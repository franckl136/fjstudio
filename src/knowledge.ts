import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { assertId, assertProject, notFound, transaction } from './database.ts';
import { DomainError, type FixtureId, type JsonObject, type Operator, type ProjectId } from './contracts.ts';

export const kinds = {
  fact: 'Fait technique', decision: 'Décision', constraint: 'Contrainte', rule: 'Règle métier',
  architecture: 'Architecture', document: 'Documentation', issue: 'Problème connu', risk: 'Risque',
  goal: 'Objectif', hypothesis: 'Hypothèse', question: 'À vérifier',
};
export const origins = { observed: 'Observation', imported: 'Document importé', agent: 'Proposition d’agent', hypothesis: 'Hypothèse', human: 'Décision humaine' };
export const scopes = { reference: 'Consultation uniquement', nominal: 'Cas nominal', incorrect: 'Cas incorrect', both: 'Les deux cas A1' };
export const confidenceLevels = { low: 'Faible', medium: 'Moyenne', high: 'Élevée' };
export const statuses = { proposed: 'À valider', validated: 'Validée', rejected: 'Rejetée', obsolete: 'Obsolète', revoked: 'Révoquée' };
export type KnowledgeRow = {
  id: string; project_id: ProjectId; kind: keyof typeof kinds; origin: keyof typeof origins;
  author: string; reference: string; related_id: string | null; created_at: Date;
  version: number; title: string; content: string; scope: keyof typeof scopes;
  confidence: keyof typeof confidenceLevels | null; validity: string;
  claim_key: string; claim_value: string;
  status: keyof typeof statuses; action: string; actor: string; at: Date;
};
type Revision = Pick<KnowledgeRow,'version'|'title'|'content'|'scope'|'status'|'action'|'actor'|'at'|'confidence'|'validity'|'claim_key'|'claim_value'>;
export type ContextEntry = { id: string; projectId: ProjectId; version: number; title: string; content: string };
const execute = promisify(execFile);
const repo = fileURLToPath(new URL('../',import.meta.url));

function invalid(): never { throw new DomainError(400,'knowledge_input','Vérifiez le type, la portée, le titre et le contenu de la fiche.'); }
function field(value: unknown, max: number, optional = false): string {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.includes('\0') || value.length > max || (!optional && !value.trim())) invalid();
  return value.trim();
}
function choice<T extends object>(value: unknown, allowed: T): keyof T & string {
  if (typeof value !== 'string' || !Object.hasOwn(allowed,value)) invalid();
  return value as keyof T & string;
}

type Disagreement = {
  project_id: ProjectId; first_id: string; first_version: number; first_title: string;
  second_id: string; second_version: number; second_title: string; reason: 'assertion' | 'document';
};

function declaredClaim(input: JsonObject, current?: KnowledgeRow) {
  const key = field(input.claimKey ?? current?.claim_key, 80, true).toLocaleLowerCase('fr');
  const value = field(input.claimValue ?? current?.claim_value, 160, true);
  if (Boolean(key) !== Boolean(value)) {
    throw new DomainError(400,'incomplete_claim','Précisez ensemble le sujet et la valeur de l’affirmation.');
  }
  return {key,value};
}

export async function contextSources(client: PoolClient, project: ProjectId, mission: string) {
  return (await client.query<{
    id: string; version: number; selected_at: Date | null; status: KnowledgeRow['status'];
    origin: KnowledgeRow['origin']; reference: string; actor: string; validated_at: Date; scope: string;
  }>(`SELECT k.id, r.version, c.selected_at, r.status, k.origin, k.reference, r.actor, r.at AS validated_at, r.scope
    FROM mission_context c JOIN knowledge_revisions r USING(project_id,knowledge_id,version)
    JOIN knowledge k ON k.project_id=c.project_id AND k.id=c.knowledge_id
    WHERE c.project_id=$1 AND c.mission_id=$2 ORDER BY k.id`,[project,mission])).rows;
}

export async function freezeContext(client: PoolClient, project: ProjectId, mission: string, fixture: FixtureId) {
  await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
  await client.query(`INSERT INTO mission_context(project_id,mission_id,knowledge_id,version)
    SELECT project_id,$2,id,version FROM knowledge_current
    WHERE project_id=$1 AND status='validated' AND scope IN ($3,'both')
    ORDER BY (scope=$3) DESC, at DESC, id LIMIT 5`,[project,mission,fixture]);
}

export async function readContext(client: PoolClient, project: ProjectId, mission: string) {
  return (await client.query<ContextEntry>(`SELECT c.knowledge_id AS id,c.project_id AS "projectId",r.version,r.title,r.content
    FROM mission_context c JOIN knowledge_revisions r USING(project_id,knowledge_id,version)
    WHERE c.project_id=$1 AND c.mission_id=$2 ORDER BY c.knowledge_id`,[project,mission])).rows;
}

export class Knowledge {
  private pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async list(actor: Operator, project: ProjectId, query = '', kind = '', status = '', origin = '', relatedTo = '') {
    assertProject(actor,project);
    field(query,160,true);
    if (kind) choice(kind,kinds);
    if (status) choice(status,statuses);
    if (origin) choice(origin,origins);
    if (relatedTo) assertId(relatedTo);
    return (await this.pool.query<KnowledgeRow>(`WITH search AS (SELECT websearch_to_tsquery('french',$2) AS terms)
      SELECT k.* FROM knowledge_current k CROSS JOIN search
      CROSS JOIN LATERAL (SELECT to_tsvector('french',k.title || ' ' || k.content) AS terms) doc
      WHERE k.project_id=$1 AND ($2='' OR doc.terms @@ search.terms OR strpos(lower(k.title || ' ' || k.content || ' ' || k.reference),lower($2))>0)
        AND ($3='' OR k.kind=$3) AND ($4='' OR k.status=$4) AND ($5='' OR k.origin=$5)
        AND ($6::uuid IS NULL OR k.related_id=$6 OR EXISTS (
          SELECT 1 FROM knowledge rel WHERE rel.project_id=k.project_id AND rel.id=$6 AND rel.related_id=k.id))
      ORDER BY ts_rank(doc.terms,search.terms) DESC,k.at DESC,k.id`,[project,query,kind,status,origin,relatedTo||null])).rows;
  }

  async detail(actor: Operator, project: ProjectId, id: string) {
    assertProject(actor,project);
    assertId(id);
    return transaction(this.pool,async client => {
      const item = (await client.query<KnowledgeRow>('SELECT * FROM knowledge_current WHERE project_id=$1 AND id=$2',[project,id])).rows[0];
      if (!item) throw notFound();
      const history = (await client.query<Revision>('SELECT version,title,content,scope,status,action,actor,at,confidence,validity,claim_key,claim_value FROM knowledge_revisions WHERE project_id=$1 AND knowledge_id=$2 ORDER BY version DESC',[project,id])).rows;
      const uses = (await client.query<{mission_id:string;version:number}>('SELECT mission_id,version FROM mission_context WHERE project_id=$1 AND knowledge_id=$2 ORDER BY mission_id',[project,id])).rows;
      const related = (await client.query<{id:string;title:string}>('SELECT id,title FROM knowledge_current WHERE project_id=$1 AND related_id=$2 ORDER BY id',[project,id])).rows;
      const conflicts = (await client.query<Disagreement>(`SELECT * FROM knowledge_disagreements
        WHERE project_id=$1 AND (first_id=$2 OR second_id=$2) ORDER BY first_id,second_id`,[project,id])).rows;
      return {item,history,uses,related,conflicts};
    },true);
  }

  async propose(actor: Operator, project: ProjectId, input: JsonObject) {
    assertProject(actor,project);
    if (input.origin === 'imported') throw new DomainError(400,'import_required','Utilisez l’import du document Git du projet.');
    return this.insertProposal(actor,project,input);
  }

  private async insertProposal(actor: Operator, project: ProjectId, input: JsonObject, previousReference?: string) {
    const claim = declaredClaim(input);
    const kind = choice(input.kind,kinds);
    const origin = choice(input.origin,origins);
    const scope = choice(input.scope,scopes);
    const title = field(input.title,140);
    const content = field(input.content,2400);
    const reference = field(input.reference,320,true);
    const confidence = input.confidence ? choice(input.confidence,confidenceLevels) : null;
    const validity = field(input.validity,160,true);
    const related = field(input.relatedId,36,true) || null;
    if (related) assertId(related);
    const id = randomUUID();
    return transaction(this.pool,async client => {
      if (origin === 'imported') {
        await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
        const prior = await client.query<{id:string}>(
          "SELECT id FROM knowledge WHERE project_id=$1 AND origin='imported' AND reference=ANY($2) ORDER BY created_at LIMIT 1",
          [project,[reference,previousReference]]);
        if (prior.rows[0]) return prior.rows[0];
      }
      if (related && !(await client.query('SELECT 1 FROM knowledge WHERE project_id=$1 AND id=$2',[project,related])).rowCount) throw notFound();
      await client.query('INSERT INTO knowledge(project_id,id,kind,origin,author,reference,related_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',[project,id,kind,origin,actor.id,reference,related]);
      await client.query(`INSERT INTO knowledge_revisions(project_id,knowledge_id,version,title,content,scope,status,actor,action,confidence,validity,claim_key,claim_value)
        VALUES ($1,$2,1,$3,$4,$5,'proposed',$6,'propose',$7,$8,$9,$10)`,[project,id,title,content,scope,actor.id,confidence,validity,claim.key,claim.value]);
      return {id};
    });
  }

  async importDocument(actor: Operator, project: ProjectId) {
    assertProject(actor,project);
    const path = 'docs/projects/'+project+'.md';
    let content: string;
    let blob: string;
    try {
      const options = {cwd:repo,maxBuffer:16384,windowsHide:true};
      blob = (await execute('git',['rev-parse','--verify','HEAD:'+path],options)).stdout.trim();
      if (!/^[a-f0-9]{40,64}$/.test(blob)) throw new Error();
      content = (await execute('git',['cat-file','blob',blob],options)).stdout.trim();
    } catch { throw new DomainError(503,'document_unavailable','Le document synthétique est absent de la révision Git locale.'); }
    const digest = createHash('sha256').update(content).digest('hex');
    return this.insertProposal(actor,project,{kind:'document',origin:'imported',title:content.split('\n')[0].replace(/^#\s*/,''),content,
      scope:'both',reference:path+' · Git '+blob+' · SHA-256 '+digest},path+' · SHA-256 du texte importé '+digest);
  }

  async revise(actor: Operator, project: ProjectId, id: string, input: JsonObject) {
    assertProject(actor,project);
    assertId(id);
    return transaction(this.pool,async client => {
      await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
      const row = (await client.query<KnowledgeRow>('SELECT * FROM knowledge_current WHERE project_id=$1 AND id=$2',[project,id])).rows[0];
      if (!row) throw notFound();
      if (row.version !== Number(input.version)) throw new DomainError(409,'version_conflict','La fiche a changé. Rechargez sa dernière version.');
      const claim = declaredClaim(input.action === 'edit' ? input : {}, row);
      let {title,content,scope,confidence,validity} = row;
      let status: keyof typeof statuses;
      switch (input.action) {
        case 'edit':
          if (row.status === 'revoked') throw new DomainError(409,'revoked','Une fiche révoquée est définitive.');
          title = field(input.title,140); content = field(input.content,2400); scope = choice(input.scope,scopes);
          if (input.confidence !== undefined) confidence = input.confidence ? choice(input.confidence,confidenceLevels) : null;
          if (input.validity !== undefined) validity = field(input.validity,160,true);
          status = 'proposed'; break;
        case 'validate': case 'reject':
          if (row.status !== 'proposed') throw new DomainError(409,'not_proposed','Seule une proposition peut être arbitrée.');
          status = input.action === 'validate' ? 'validated' : 'rejected'; break;
        case 'obsolete': case 'revoke':
          if (row.status !== 'validated' && !(input.action === 'revoke' && row.status === 'obsolete')) throw new DomainError(409,'not_validated','La transition exige une fiche validée.');
          status = input.action === 'obsolete' ? 'obsolete' : 'revoked'; break;
        default: invalid();
      }
      await client.query(`INSERT INTO knowledge_revisions(project_id,knowledge_id,version,title,content,scope,status,actor,action,confidence,validity,claim_key,claim_value)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[project,id,row.version+1,title,content,scope,status,actor.id,input.action,confidence,validity,claim.key,claim.value]);
      return {id,version:row.version+1,status};
    });
  }
}
