import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { Pool } from 'pg';
import { composeDatabaseUrl } from '../scripts/postgres-tools.ts';
import { createPool } from '../src/config.ts';
import { digestJson, type Operator } from '../src/contracts.ts';
import { migrate } from '../src/core.ts';
import { captureReview, decideReview, listReviews, reviewDetail } from '../src/product-review.ts';
import { canPreviewText, checkReviewBranch, currentReviewHead, reviewBranch, reviewVisibility } from '../src/product-review-source.ts';

const operator:Operator={id:'review-op',accountRole:'operator',projectIds:['a']};
const reader:Operator={...operator,id:'review-reader',accountRole:'viewer'};
const b:Operator={...operator,id:'review-b',projectIds:['b']};
let maintenance:Pool, pool:Pool, created:string|undefined;
before(async()=>{
  const url=composeDatabaseUrl();
  assert.equal(url.pathname,'/fjstudio_a1');
  const name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  maintenance=createPool(url.href);
  await maintenance.query('CREATE DATABASE '+name+' TEMPLATE template0');
  created=name;url.pathname='/'+name;pool=createPool(url.href);await migrate(pool);
});
after(async()=>{
  try{if(pool)await pool.end();if(created)await maintenance.query('DROP DATABASE '+created);}
  finally{if(maintenance)await maintenance.end();}
});

test('Revue Git · branche autorisée, métadonnées et protections des extraits',()=>{
  assert.doesNotThrow(()=>checkReviewBranch(reviewBranch));
  for(const ref of ['main','refs/heads/main','master','HEAD','feat/autre']) assert.throws(()=>checkReviewBranch(ref),{status:409});
  for(const file of ['.env.local','secrets/key.pem','docs/credentials.md','src/product-auth.ts','ops/backup.sql','package-lock.json'])
    assert.equal(reviewVisibility(file,'000000','100644'),'sensitive');
  for(const file of ['src/../copy.ts','src/écran.ts','docs/\nvisible.md','images/photo.jpg','.git/hooks/post-checkout'])
    assert.equal(reviewVisibility(file,'100644','100644'),'metadata');
  assert.equal(reviewVisibility('src/catalogue.ts','100644','120000'),'metadata');
  assert.equal(reviewVisibility('src/catalogue.ts','000000','100644'),'preview');
  assert(!canPreviewText(Buffer.from([0,17,2])));
  assert(!canPreviewText(Buffer.from([0xff])));
  assert(!canPreviewText(Buffer.alloc(16385,97)));
  assert(!canPreviewText(Buffer.from('const password = "demo-private-value";')));
  assert(!canPreviewText(Buffer.from('postgresql://sample:sample@localhost:1234/atelier')));
  assert(canPreviewText(Buffer.from('function count(lines: string[]) { return lines.length; }')));
});

test('Revue Git · isolement, lecture persistée, décisions sur le dernier commit uniquement',async()=>{
  await assert.rejects(captureReview(pool,b,'a'),{status:404});
  await assert.rejects(captureReview(pool,{...operator,projectIds:['a','b']},'b'),{status:404});
  await assert.rejects(captureReview(pool,reader,'a'),{status:403});
  await assert.rejects(captureReview(pool,{id:'historical',projectIds:['a']},'a'),{status:403});
  const stale={version:1,branch:reviewBranch,head:'0'.repeat(40),base:'1'.repeat(40),summary:[]};
  const staleId=randomUUID();
  await pool.query(`INSERT INTO product_git_reviews(id,project_id,branch,base_sha,head_sha,summary,digest,created_by)
    VALUES($1,'a',$2,$3,$4,'[]',$5,$6)`,[staleId,stale.branch,stale.base,stale.head,digestJson(stale),operator.id]);
  assert.equal((await reviewDetail(pool,reader,'a',staleId)).review.head_sha,stale.head);
  await assert.rejects(decideReview(pool,reader,'a',staleId,'approved','yes'),{status:403});
  await assert.rejects(decideReview(pool,operator,'a',staleId,'approved','no'),{status:400});
  await assert.rejects(decideReview(pool,operator,'a',staleId,'approved','yes'),{status:409});
  await pool.query('UPDATE product_git_reviews SET digest=$1 WHERE id=$2',['2'.repeat(64),staleId]);
  await assert.rejects(reviewDetail(pool,reader,'a',staleId),{code:'git_review_integrity'});
  await assert.rejects(reviewDetail(pool,b,'a',staleId),{status:404});
});

test('Revue Git · capture locale réelle et deux avis humains, ou refus si checkout non autorisé',async()=>{
  const readGit=(...args:string[])=>{
    try{return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
    catch{return '';}
  };
  if(readGit('branch','--show-current')!==reviewBranch ||
    readGit('config','--local','--get-all','remote.origin.url')!=='https://github.com/franckl136/fjstudio.git'){
    await assert.rejects(captureReview(pool,operator,'a'),{status:409});return;
  }
  const row=await captureReview(pool,operator,'a');
  assert.equal(row.head_sha,await currentReviewHead());
  assert.equal((await captureReview(pool,operator,'a')).id,row.id);
  const data=await reviewDetail(pool,reader,'a',row.id);
  assert(data.review.summary.length<=120);
  assert(data.review.summary.filter(f=>f.visibility==='preview').length<=8);
  for(const item of data.review.summary){
    assert((item.excerpt?.length??0)<=2400);
    if(item.visibility!=='preview')assert.equal(item.excerpt,undefined);
  }
  const [vote,other]=await Promise.all([
    decideReview(pool,operator,'a',row.id,'approved','yes'),
    decideReview(pool,{...operator,id:'review-other'},'a',row.id,'changes_requested','yes'),
  ]);
  assert.equal(other.decision,'changes_requested');
  assert.deepEqual(await decideReview(pool,operator,'a',row.id,'approved','yes'),vote);
  await assert.rejects(decideReview(pool,operator,'a',row.id,'changes_requested','yes'),{status:409});
  assert.equal((await reviewDetail(pool,reader,'a',row.id)).decisions.length,2);
  assert((await listReviews(pool,reader,'a')).some(review=>review.id===row.id));
});
