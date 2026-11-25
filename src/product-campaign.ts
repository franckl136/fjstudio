import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { Pool, PoolClient } from 'pg';
import { digestJson, DomainError, isObject, type Operator } from './contracts.ts';
import { assertId, assertProject, notFound } from './database.ts';

const keys = ['tests','suites','pass','fail','cancelled','skipped','todo'] as const;
export type TestCounts = Record<typeof keys[number],number>;
export interface Stage {
  exitCode: number | null;
  elapsedMs: number;
  stdoutSha256: string;
  stderrSha256: string;
}
export interface Campaign {
  profile: 'studio-npm-v1';
  startedAt: string;
  finishedAt: string;
  commitBefore: string;
  commitAfter: string | null;
  treeBefore: 'clean';
  treeAfter: 'clean'|'changed'|'unknown';
  versions: {node:string; npm:string; typescript:string; git:string};
  typecheck: Stage;
  tests: Stage;
  counts: TestCounts | null;
}

const uint = (n:unknown): n is number => Number.isSafeInteger(n) && Number(n)>=0;
function countsValid(value:unknown): value is TestCounts {
  return isObject(value) && Object.keys(value).length===keys.length && keys.every(k=>uint(value[k])) &&
    value.tests === Number(value.pass)+Number(value.fail)+Number(value.cancelled)+Number(value.skipped)+Number(value.todo);
}

// Node 24 spec and TAP reporters finish with these ordered lines. Ignore every name and diagnostic.
export function parseTestCounts(tail:string): TestCounts | null {
  const lines = tail.trimEnd().split(/\r?\n/).slice(-8);
  if (lines.length!==8 || !/^(?:ℹ|#) duration_ms [0-9]+(?:\.[0-9]+)?$/.test(lines[7])) return null;
  const counts = {} as TestCounts;
  for (const [i,key] of keys.entries()) {
    const found = /^(?:ℹ|#) ([a-z]+) ([0-9]{1,7})$/.exec(lines[i]);
    if (found?.[1]!==key) return null;
    counts[key]=Number(found[2]);
  }
  return countsValid(counts)?counts:null;
}

// Retain at most one short block of recognized Node counters. All other output is hashed and discarded.
export class CampaignCounters {
  private readonly decoder = new StringDecoder('utf8');
  private partial='';
  private overflow=false;
  private lines:string[]=[];
  private blocks=0;
  value:ReturnType<typeof parseTestCounts>=null;
  feed(chunk:Buffer) {
    const parts=this.decoder.write(chunk).split('\n');
    for (let i=0;i<parts.length;i++) {
      if (i>0) {
        this.line(this.overflow?'':this.partial.trimEnd());
        this.partial=''; this.overflow=false;
      }
      if (this.partial.length+parts[i].length>160) this.overflow=true;
      if (!this.overflow) this.partial+=parts[i];
    }
  }
  finish() { this.line(this.overflow?'':(this.partial+this.decoder.end()).trimEnd()); }
  private line(line:string) {
    if (!/^(?:ℹ|#) (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) [0-9.]+$/.test(line)) {this.lines=[];return;}
    this.lines.push(line);
    if (this.lines.length>8) this.lines.shift();
    const counts=parseTestCounts(this.lines.join('\n'));
    if (counts) { this.value=++this.blocks===1?counts:null; this.lines=[]; }
  }
}

export function campaignVerdict(c:Campaign) {
  if (c.commitAfter!==c.commitBefore || c.treeAfter!=='clean' || c.typecheck.exitCode===null || c.tests.exitCode===null) return 'NOT QUALIFIED';
  if (c.typecheck.exitCode!==0 || c.tests.exitCode!==0 || (c.counts?.fail??0)>0) return 'FAIL';
  if (!c.counts?.tests || c.counts.cancelled) return 'NOT QUALIFIED';
  if (c.counts.skipped || c.counts.todo) return 'PASS WITH RESERVATIONS';
  return 'PASS';
}

function exact(value:unknown,fields:string[]): value is Record<string,unknown> {
  return isObject(value) && Object.keys(value).length===fields.length && fields.every(key=>Object.hasOwn(value,key));
}
const matches = (v:unknown,re:RegExp): v is string => typeof v==='string' && re.test(v);
const sha = /^[a-f0-9]{64}$/;
const commit = /^[a-f0-9]{40}$/;
const version = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:\.windows\.\d{1,3})?$/;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function validStage(s:unknown) {
  return exact(s,['exitCode','elapsedMs','stdoutSha256','stderrSha256']) && (s.exitCode===null||uint(s.exitCode)) &&
    uint(s.elapsedMs) && matches(s.stdoutSha256,sha) && matches(s.stderrSha256,sha);
}
function validated(c:unknown): asserts c is Campaign {
  if (!exact(c,['profile','startedAt','finishedAt','commitBefore','commitAfter','treeBefore','treeAfter','versions','typecheck','tests','counts']) ||
      c.profile!=='studio-npm-v1' || !matches(c.startedAt,iso) || !matches(c.finishedAt,iso) || c.finishedAt<c.startedAt ||
      !matches(c.commitBefore,commit) || !(c.commitAfter===null || matches(c.commitAfter,commit)) ||
      c.treeBefore!=='clean' || !['clean','changed','unknown'].includes(String(c.treeAfter)) ||
      !exact(c.versions,['node','npm','typescript','git']) || !Object.values(c.versions).every(v=>matches(v,version)) ||
      !validStage(c.typecheck) || !validStage(c.tests) || !(c.counts===null || countsValid(c.counts))) {
    throw new DomainError(409,'campaign_evidence','Rapport de campagne invalide.');
  }
}

export async function saveCampaign(db:Pool|PoolClient,report:Campaign) {
  validated(report);
  const id=randomUUID();
  const digest=digestJson(report);
  const verdict=campaignVerdict(report);
  await db.query("INSERT INTO product_campaigns(id,project_id,finished_at,commit_sha,verdict,report,report_sha) VALUES($1,'a',$2,$3,$4,$5,$6)",
    [id,report.finishedAt,report.commitBefore,verdict,report,digest]);
  return {id,verdict,digest};
}

export function campaignScope(actor:Operator,project:string) {
  assertProject(actor,project);
  if (project!=='a') throw notFound();
}
export async function listCampaigns(db:Pool,actor:Operator,project:string) {
  campaignScope(actor,project);
  return (await db.query<{id:string;finished_at:Date;commit_sha:string;verdict:string;report_sha:string}>(
    'SELECT id,finished_at,commit_sha,verdict,report_sha FROM product_campaigns WHERE project_id=$1 ORDER BY finished_at DESC,id DESC LIMIT 100',[project])).rows;
}
export async function readCampaign(db:Pool,actor:Operator,project:string,id:string) {
  campaignScope(actor,project); assertId(id);
  const row=(await db.query<{id:string;report:Campaign;report_sha:string;verdict:string;commit_sha:string;finished_at:Date}>(
    'SELECT id,report,report_sha,verdict,commit_sha,finished_at FROM product_campaigns WHERE project_id=$1 AND id=$2',[project,id])).rows[0];
  if (!row) throw notFound();
  validated(row.report);
  if (digestJson(row.report)!==row.report_sha || campaignVerdict(row.report)!==row.verdict || row.commit_sha!==row.report.commitBefore ||
    row.finished_at.toISOString()!==row.report.finishedAt) throw new DomainError(409,'campaign_integrity','Empreinte ou index de campagne divergent.');
  return row;
}
