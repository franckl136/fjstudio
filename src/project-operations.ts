import type { Pool } from 'pg';
import { digestJson, DomainError, type Operator } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';
import { detailLab, labProfiles } from './product-lab.ts';
import { labSources } from './product-lab-source.ts';
import { sources } from './explorer-store.ts';

type Profile=keyof typeof labProfiles;
type RunSummary={id:string;source_key:string;entry_path:string;profile:Profile;state:'queued'|'running'|'finished';
  commit_sha:string;verdict:string|null;created_at:Date;finished_at:Date|null;trigger_kind:'manual'|'on-change'|'interval'};
type RuleRow={source_key:string;profile:Profile;mode:'on-change'|'interval';enabled:boolean;
  interval_minutes:number;next_at:Date;updated_at:Date;updated_by:string;last_commit:string|null;last_status:string|null};
const runFields='id,source_key,entry_path,profile,state,commit_sha,verdict,created_at,finished_at,trigger_kind';
function declarations(project:string) {
  return labSources(project).map(({key,entry,ref})=>({key,entry,ref,kind:['studio-sample','studio-types'].includes(key)?'studio-example':'project'} as const));
}
function stringList(raw:unknown):string[]|null {
  return Array.isArray(raw)&&raw.every(v=>typeof v==='string')?raw:null;
}
function counted(raw:unknown):number|null {
  return typeof raw==='number' && Number.isSafeInteger(raw) && raw>=0?raw:null;
}
async function evidence(pool:Pool,actor:Operator,project:string,run:string) {
  const r=await detailLab(pool,actor,project,run);
  const i=r.inventory, report=r.result;
  return {id:r.id,source:r.source_key,entry:r.entry_path,commit:r.commit_sha,sourceSha256:r.source_digest,
    capturedAt:r.created_at,profile:r.profile,profileVersion:r.profile_version,trigger:r.trigger_kind,
    started:r.started_at,finished:r.finished_at,worker:r.worker,state:r.state,verdict:r.verdict,reportSha256:r.result_sha,
    browser:report?.browser??null,compiler:report?.compiler??null,runnerNode:report?.node??null,
    manifests:stringList(i?.manifests),directories:stringList(i?.directories),dependencies:counted(i?.dependencies),
    devDependencies:counted(i?.devDependencies)};
}
export async function projectArchitecture(pool:Pool,actor:Operator,project:string,selectedRun?:string|null) {
  assertProject(actor,project);if(selectedRun) assertId(selectedRun);
  const configured=declarations(project);
  const {latest,schemas}=await transaction(pool,async c=>{
    const exists=await c.query('SELECT 1 FROM projects WHERE id=$1',[project]);if(!exists.rowCount) throw notFound();
    const latest=(await c.query<RunSummary>('SELECT DISTINCT ON(source_key) '+runFields+' FROM product_lab_runs WHERE project_id=$1 ORDER BY source_key,created_at DESC,id DESC',[project])).rows;
    return {latest,schemas:await sources(c,actor,project)};
  },true);
  const keys=new Set([...configured.map(s=>s.key),...latest.map(r=>r.source_key)]);
  const catalog=[...keys].map(key=>({key,declaration:configured.find(s=>s.key===key)??null,latest:latest.find(r=>r.source_key===key)??null}));
  const preferred=catalog.filter(s=>s.latest).sort((a,b)=>
    Number(a.declaration?.kind==='studio-example')-Number(b.declaration?.kind==='studio-example') ||
    b.latest!.created_at.getTime()-a.latest!.created_at.getTime() || a.key.localeCompare(b.key));
  const selected=selectedRun||preferred[0]?.latest?.id;
  return {project,catalog,observation:selected?await evidence(pool,actor,project,selected):null,
    schemaSources:schemas.map(({id,label,environment,origin})=>({id,label,environment,origin}))};
}

export async function projectAutomations(pool:Pool,actor:Operator,project:string) {
  assertProject(actor,project);
  const configured=declarations(project);
  return transaction(pool,async c=>{
    const exists=await c.query('SELECT 1 FROM projects WHERE id=$1',[project]);if(!exists.rowCount) throw notFound();
    const rules=(await c.query<RuleRow>(
      'SELECT source_key,profile,mode,enabled,interval_minutes,next_at,updated_at,updated_by,last_commit,last_status FROM product_lab_rules WHERE project_id=$1 ORDER BY enabled DESC,source_key,profile',[project])).rows;
    // A manual run for the same source is not evidence that its rule ever fired.
    const history=(await c.query<RunSummary>('SELECT '+runFields+' FROM product_lab_runs WHERE project_id=$1 AND trigger_kind IN (\'on-change\',\'interval\') ORDER BY created_at DESC,id DESC',[project])).rows;
    const schedules=rules.map(rule=>{
      const runs=history.filter(r=>r.source_key===rule.source_key&&r.profile===rule.profile);
      const lastResult=runs.filter(r=>r.state==='finished').sort((a,b)=>Number(b.finished_at)-Number(a.finished_at)||b.id.localeCompare(a.id))[0]??null;
      return {source:rule.source_key,profile:rule.profile,mode:rule.mode,enabled:rule.enabled,intervalMinutes:rule.interval_minutes,
        nextPoll:rule.enabled?rule.next_at:null,modified:rule.updated_at,modifiedBy:rule.updated_by,lastCommit:rule.last_commit,
        lastPollMessage:rule.last_status,declaration:configured.find(s=>s.key===rule.source_key)??null,
        lastRun:runs[0]??null,lastResult,recent:runs.slice(0,5),totalRuns:runs.length};
    });
    const resultIds=schedules.flatMap(rule=>rule.lastResult?[rule.lastResult.id]:[]);
    if(resultIds.length) {
      const reports=await c.query<{result:unknown;result_sha:string}>(
        'SELECT result,result_sha FROM product_lab_runs WHERE project_id=$1 AND id=ANY($2::uuid[])',[project,resultIds]);
      for(const row of reports.rows) {
        if(row.result_sha!==digestJson(row.result)) throw new DomainError(409,'lab_integrity','Empreinte de rapport divergente.');
      }
    }
    return {project,rules:schedules};
  },true);
}
