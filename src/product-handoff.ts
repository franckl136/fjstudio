import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { digestJson, DomainError, isObject, type Operator } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';
import { lockControl, readControlMission, recordControl, type ControlMission } from './control-room.ts';
import { documentHash, type KnowledgeRef } from './control-room-adapters.ts';

const version='studio-handoff-v1';
const responseVersion='studio-proposal-v1';
const states=['ready','running','completed'];
const bad=()=>new DomainError(400,'handoff_input','Le format de l’échange ou la taille des champs est invalide.');
const conflict=(reason:string)=>new DomainError(409,'handoff_state',reason);
const hash=/^[a-f0-9]{64}$/;
const isUuid=(v:unknown):v is string=>typeof v==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
function scope(actor:Operator,project:string,mission:string,write=false) {
  assertProject(actor,project);assertId(mission);
  if (write && !['operator','admin'].includes(actor.accountRole??'')) throw new DomainError(403,'handoff_operator','Un compte humain opérateur ou administrateur est requis.');
}
export type ExportSettings={commandKey:string;revision:number;includeDocument:boolean;includeContext:boolean};
type Dossier={schema:typeof version;exportId:string;projectId:string;missionId:string;revision:number;contractVersion:string;objective:string;
  scope:string;constraints:string;criteria:string[];documentSha256:string;costLimitCents:0;document?:string;context?:KnowledgeRef[]};
type Stored={id:string;mission_id:string;revision:number;include_document:boolean;include_context:boolean;dossier:Dossier;dossier_sha:string;
  proposal_id:string|null;response_sha:string|null};
function envelope(row:Stored) {
  if (digestJson(row.dossier)!==row.dossier_sha) throw conflict('L’empreinte du dossier a changé.');
  return {dossier:row.dossier,sha256:row.dossier_sha,
    responseTemplate:{schema:responseVersion,exportId:row.id,dossierSha256:row.dossier_sha,title:'',content:''}};
}

async function ensureContext(client:PoolClient,m:ControlMission) {
  if (m.context.length>5) throw conflict('Le contexte dépasse le profil de la mission.');
  const current=await client.query<{id:string;version:number;title:string;content:string}>(`SELECT id,version,title,content FROM knowledge_current
    WHERE project_id=$1 AND status='validated' AND scope='control' AND id=ANY($2::uuid[])`,[m.project_id,m.context.map(k=>k.id)]);
  return m.context.map(k=>{
    const ref=current.rows.find(r=>r.id===k.id && r.version===k.version);
    if (!ref || ref.title!==k.title || ref.content!==k.content || documentHash(ref.content)!==k.digest)
      throw conflict('Une révision de contexte a changé. Exportez le dossier sans contexte ou ouvrez une nouvelle mission.');
    return {id:ref.id,version:ref.version,title:ref.title,content:ref.content,digest:k.digest};
  });
}
function eligible(m:ControlMission) {
  if (!states.includes(m.status)) throw conflict('Un plan autorisé en état prêt, en cours ou terminé est requis.');
}
export async function exportHandoff(pool:Pool,actor:Operator,project:string,mission:string,options:ExportSettings) {
  scope(actor,project,mission,true);
  if (!isUuid(options.commandKey)||!Number.isSafeInteger(options.revision)||options.revision<1||
      typeof options.includeDocument!=='boolean'||typeof options.includeContext!=='boolean') throw bad();
  return transaction(pool,async client=>{
    await lockControl(client);
    const m=await readControlMission(client,project,mission);eligible(m);
    let context:KnowledgeRef[]|undefined;
    if(options.includeContext) {
      await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
      context=await ensureContext(client,m);
    }
    const prev=(await client.query<Stored>('SELECT * FROM product_handoffs WHERE project_id=$1 AND actor=$2 AND command_key=$3',
      [project,actor.id,options.commandKey])).rows[0];
    if (prev) {
      if(prev.mission_id!==mission || prev.revision!==options.revision || prev.include_document!==options.includeDocument || prev.include_context!==options.includeContext)
        throw conflict('Cette clé de commande correspond à un autre dossier.');
      return envelope(prev);
    }
    if (m.revision!==options.revision || m.source_sha256!==documentHash(m.document)) throw conflict('Rechargez la révision et son document avant l’export.');
    const id=randomUUID();
    const dossier:Dossier={schema:version,exportId:id,projectId:project,missionId:mission,revision:m.revision,contractVersion:m.contract_version,
      objective:m.objective,scope:m.scope,constraints:m.constraints_text,criteria:m.criteria,documentSha256:m.source_sha256,costLimitCents:0};
    if (options.includeDocument) dossier.document=m.document;
    if (context) dossier.context=context;
    if (Buffer.byteLength(JSON.stringify(dossier))>64*1024) throw bad();
    const sha=digestJson(dossier);
    const row=(await client.query<Stored>(`INSERT INTO product_handoffs(id,project_id,mission_id,actor,command_key,revision,include_document,include_context,dossier,dossier_sha)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id,project,mission,actor.id,options.commandKey,m.revision,options.includeDocument,options.includeContext,dossier,sha])).rows[0];
    await recordControl(client,project,mission,actor.id,'handoff.exported',{exportId:id,revision:m.revision,digest:sha,
      document:options.includeDocument,context:options.includeContext,contextCount:context?.length??0});
    return envelope(row);
  });
}

function readResponse(input:unknown) {
  if (!isObject(input) || Object.keys(input).length!==5 || input.schema!==responseVersion || !isUuid(input.exportId) ||
      typeof input.dossierSha256!=='string' || !hash.test(input.dossierSha256)) throw bad();
  const bounded=(v:unknown,max:number)=>{
    if (typeof v!=='string'||!v.trim()||v.includes('\0')||v.length>max) throw bad();
    return v.trim();
  };
  return {schema:responseVersion,exportId:input.exportId,dossierSha256:input.dossierSha256,title:bounded(input.title,140),content:bounded(input.content,2400)};
}
export async function importHandoff(pool:Pool,actor:Operator,project:string,mission:string,input:unknown) {
  scope(actor,project,mission,true);
  const response=readResponse(input);
  const sha=digestJson(response);
  return transaction(pool,async client=>{
    await lockControl(client);
    const m=await readControlMission(client,project,mission);
    const row=(await client.query<Stored>('SELECT * FROM product_handoffs WHERE project_id=$1 AND mission_id=$2 AND id=$3 FOR UPDATE',
      [project,mission,response.exportId])).rows[0];
    if (!row) throw notFound();
    envelope(row);
    if(response.dossierSha256!==row.dossier_sha) throw conflict('La réponse désigne une autre empreinte de dossier.');
    if(row.proposal_id) {
      if(row.response_sha!==sha) throw conflict('Une autre réponse a déjà été importée pour ce dossier.');
      return {id:row.proposal_id,responseSha256:sha};
    }
    eligible(m);
    const id=randomUUID();
    const reference='Échange manuel Studio · mission '+mission+' · dossier '+row.id+' · SHA-256 '+row.dossier_sha;
    await client.query("INSERT INTO knowledge(project_id,id,kind,origin,author,reference) VALUES($1,$2,'hypothesis','agent',$3,$4)",[project,id,actor.id,reference]);
    await client.query(`INSERT INTO knowledge_revisions(project_id,knowledge_id,version,title,content,scope,status,actor,action,confidence)
      VALUES($1,$2,1,$3,$4,'reference','proposed',$5,'propose','low')`,[project,id,response.title,response.content,actor.id]);
    await client.query('UPDATE product_handoffs SET proposal_id=$2,response_sha=$3,imported_by=$4,imported_at=clock_timestamp() WHERE id=$1',
      [row.id,id,sha,actor.id]);
    await recordControl(client,project,mission,actor.id,'handoff.proposed',{exportId:row.id,proposalId:id,responseSha256:sha});
    return {id,responseSha256:sha};
  });
}

export async function handoffHistory(pool:Pool,actor:Operator,project:string,mission:string) {
  scope(actor,project,mission);
  return transaction(pool,async client=>{
    const m=await readControlMission(client,project,mission);
    const rows=(await client.query<{id:string;actor:string;created_at:Date;revision:number;dossier_sha:string;include_document:boolean;include_context:boolean;
      proposal_id:string|null;status:string|null;response_sha:string|null;imported_by:string|null;imported_at:Date|null}>(`
      SELECT h.id,h.actor,h.created_at,h.revision,h.dossier_sha,h.include_document,h.include_context,h.proposal_id,k.status,h.response_sha,h.imported_by,h.imported_at
      FROM product_handoffs h LEFT JOIN knowledge_current k ON (k.project_id,k.id)=(h.project_id,h.proposal_id)
      WHERE h.project_id=$1 AND h.mission_id=$2 ORDER BY h.created_at DESC,h.id LIMIT 50`,[project,mission])).rows;
    return {revision:m.revision,eligible:states.includes(m.status),title:m.objective,items:rows};
  },true);
}
