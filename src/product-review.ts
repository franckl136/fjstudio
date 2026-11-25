import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { DomainError, digestJson, type Operator } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';
import { currentReviewHead, readStudioChanges, type Change } from './product-review-source.ts';

export const reviewProject = 'a';
type RecordRow = {id:string;branch:string;base_sha:string;head_sha:string;summary:Change[];digest:string;created_by:string;created_at:Date};
type Decision = {actor:string;decision:'approved'|'changes_requested';at:Date};
const fields = 'id,branch,base_sha,head_sha,digest,created_by,created_at';
function authorize(actor:Operator,project:string,write=false) {
  assertProject(actor,project);
  if(project!==reviewProject) throw notFound();
  if(write && !['admin','operator'].includes(actor.accountRole ?? '')) {
    throw new DomainError(403,'git_review_actor','Un compte humain opérateur ou administrateur est requis.');
  }
}
function checkDigest(row:RecordRow) {
  const actual=digestJson({version:1,branch:row.branch,base:row.base_sha,head:row.head_sha,summary:row.summary});
  if(actual!==row.digest) throw new DomainError(409,'git_review_integrity','Le reçu de revue doit être vérifié.');
}
const busy = new WeakSet<Pool>();
export async function captureReview(pool:Pool,actor:Operator,project:string) {
  authorize(actor,project,true);
  if(busy.has(pool)) throw new DomainError(409,'git_review_busy','Une capture est en cours.');
  busy.add(pool);
  try {
    const result=await readStudioChanges();
    const digest=digestJson({version:1,...result});
    return await transaction(pool,async client=>{
      const value=await client.query<Omit<RecordRow,'summary'>>('INSERT INTO product_git_reviews(id,project_id,branch,base_sha,head_sha,summary,digest,created_by) '+
        'VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT(project_id,head_sha,digest) DO NOTHING RETURNING '+fields,
        [randomUUID(),project,result.branch,result.base,result.head,JSON.stringify(result.summary),digest,actor.id]);
      if(value.rows[0]) return value.rows[0];
      const existing=await client.query<Omit<RecordRow,'summary'>>('SELECT '+fields+' FROM product_git_reviews WHERE project_id=$1 AND head_sha=$2 AND digest=$3',
        [project,result.head,digest]);
      return existing.rows[0];
    });
  } finally {busy.delete(pool);}
}
export async function listReviews(pool:Pool,actor:Operator,project:string) {
  authorize(actor,project);
  return (await pool.query<Omit<RecordRow,'summary'>>('SELECT '+fields+' FROM product_git_reviews WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT 25',[project])).rows;
}
export async function reviewDetail(pool:Pool,actor:Operator,project:string,id:string) {
  authorize(actor,project);
  assertId(id);
  return transaction(pool,async client=>{
    const row=(await client.query<RecordRow>('SELECT '+fields+',summary FROM product_git_reviews WHERE project_id=$1 AND id=$2',[project,id])).rows[0];
    if(!row) throw notFound();
    checkDigest(row);
    const decisions=(await client.query<Decision>('SELECT actor,decision,at FROM product_git_decisions WHERE review_id=$1 ORDER BY at,actor',[id])).rows;
    return {review:row,decisions};
  },true);
}
export async function decideReview(pool:Pool,actor:Operator,project:string,id:string,decision:unknown,confirmed:unknown) {
  authorize(actor,project,true);
  assertId(id);
  if(confirmed!=='yes' || (decision!=='approved' && decision!=='changes_requested')) {
    throw new DomainError(400,'git_review_decision','Choisissez une décision et confirmez sa portée.');
  }
  return transaction(pool,async client=>{
    const row=(await client.query<RecordRow>('SELECT '+fields+',summary FROM product_git_reviews WHERE project_id=$1 AND id=$2 FOR UPDATE',[project,id])).rows[0];
    if(!row) throw notFound();
    checkDigest(row);
    const previous=(await client.query<Decision>('SELECT actor,decision,at FROM product_git_decisions WHERE review_id=$1 AND actor=$2',[id,actor.id])).rows[0];
    if(previous) {
      if(previous.decision!==decision) throw new DomainError(409,'git_review_recorded','Une décision différente a déjà été consignée pour ce compte.');
      return previous;
    }
    if(await currentReviewHead()!==row.head_sha) throw new DomainError(409,'git_review_stale','La branche a changé. Capturez sa nouvelle révision.');
    return (await client.query<Decision>('INSERT INTO product_git_decisions(review_id,actor,decision) VALUES($1,$2,$3) RETURNING actor,decision,at',
      [id,actor.id,decision])).rows[0];
  });
}
