import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { before,after,test } from 'node:test';
import type { Pool } from 'pg';
import { importSql,importPrisma } from '../src/explorer-import.ts';
import { captureInternal,importSource,readSource,revokeSource,snapshot,sources,versions } from '../src/explorer-store.ts';
import { differences,schemaSignals } from '../src/explorer-model.ts';
import { inspectDedicated } from '../src/explorer-connections.ts';
import { createPool } from '../src/config.ts';
import { migrate } from '../src/core.ts';
import { createServer } from '../src/http.ts';
import { Core } from '../src/core.ts';
import { once } from 'node:events';
import { mkdtemp,mkdir,writeFile,rm,link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncProjectCode } from '../src/explorer-code.ts';
import type { AddressInfo } from 'node:net';

const sql=`CREATE TABLE public.ateliers (site int, id int, PRIMARY KEY(site,id));
CREATE TABLE public.travaux (site int, id integer PRIMARY KEY, atelier_id integer NOT NULL, note text DEFAULT 'sensible-fixture',
CONSTRAINT travaux_atelier_fk FOREIGN KEY (site,atelier_id) REFERENCES public.ateliers(site,id) ON DELETE CASCADE);
ALTER TABLE public.travaux ENABLE ROW LEVEL SECURITY;
CREATE POLICY lecture_ouverte ON public.travaux FOR SELECT USING (true);
CREATE POLICY ecriture ON public.travaux FOR INSERT WITH CHECK (note <> 'sensible-fixture');
CREATE INDEX travaux_atelier ON public.travaux(site,atelier_id);
CREATE FUNCTION public.fixture_f() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER t AFTER INSERT ON public.travaux FOR EACH ROW EXECUTE FUNCTION public.fixture_f();`;
const admin={id:'schema-admin',accountRole:'admin' as const,projectIds:['a','b']};
const op={id:'schema-op',accountRole:'operator' as const,projectIds:['a']};
const viewer={id:'schema-viewer',accountRole:'viewer' as const,projectIds:['a']};
let adminDb:Pool,pool:Pool,testUrl:URL,name:string,created=false;
before(async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  adminDb=createPool(url.href);name='fjstudio_a1_test_'+randomUUID().replaceAll('-','');
  await adminDb.query('CREATE DATABASE '+name+' TEMPLATE template0');created=true;url.pathname='/'+name;testUrl=url;pool=createPool(url.href);await migrate(pool);
});
after(async()=>{await pool?.end();if(created)await adminDb.query('DROP DATABASE '+name);await adminDb?.end();});

test('Explorer · SQL passif, FK composite exacte, RLS, migration et littéraux masqués',async()=>{
  const m=await importSql(sql+' INSERT INTO public.travaux(id) VALUES (42);');
  assert.equal(m.tables.length,2);
  assert.equal(m.functions[0].definer,true);
  const t=m.tables.find(t=>t.name==='travaux')!,fk=t.constraints.find(c=>c.kind==='foreign')!;
  assert.deepEqual(fk.columns,['site','atelier_id']);assert.deepEqual(fk.target,{schema:'public',table:'ateliers',columns:['site','id']});
  assert.equal(fk.onDelete,'CASCADE');assert.equal(t.rls,true);assert.equal(t.policies.find(p=>p.name==='lecture_ouverte')!.using,'true');
  assert(!JSON.stringify(m).includes('sensible-fixture'));assert.equal((await pool.query("SELECT to_regclass('public.travaux') AS x")).rows[0].x,null);
  const changed=await importSql('ALTER TABLE public.travaux ADD COLUMN titre text',m);
  assert(differences(m,changed).some(d=>d.path.at(-1)==='titre'&&d.change==='ajouté'));
  assert.equal(t.columns.length,4);
  await assert.rejects(importSql('CREATE TABLE broken (secret-sensitive @@@'),e=>e instanceof Error&&!e.message.includes('secret-sensitive'));
});
test('Explorer · Prisma utilise les noms physiques et ne suppose aucune FK émulée',()=>{
  const p='datasource db {\n provider="postgresql"\n url=env("DATABASE_URL")\n}\nmodel Atelier {\n id Int @id @map("pk")\n travaux Travail[]\n @@map("ateliers")\n}\nmodel Travail {\n id Int @id\n a Int @map("atelier_id")\n atelier Atelier @relation(fields:[a],references:[id],onDelete:Cascade)\n @@index([a])\n}';
  const m=importPrisma(p);const t=m.tables.find(t=>t.name==='Travail')!,fk=t.constraints.find(c=>c.kind==='foreign')!;
  assert.deepEqual(fk.target,{schema:'public',table:'ateliers',columns:['pk']});assert.deepEqual(fk.columns,['atelier_id']);assert.equal(t.rls,null);
  assert.equal(schemaSignals(importPrisma(p.replace('provider="postgresql"','provider="postgresql"\n relationMode="prisma"'))).foreignKeys,0);
  assert.equal(schemaSignals(importPrisma(p.replace(' url=env("DATABASE_URL")\n',''))).foreignKeys,1);
});
test('Explorer · captures PostgreSQL réelles, historique, droits, masquage et révocation',async()=>{
  await pool.query(sql);
  const inner=await captureInternal(pool),copy=await captureInternal(pool);assert.equal(copy.source,inner.source);assert.notEqual(copy.id,inner.id);
  assert.equal((await snapshot(pool,admin,null,copy.source,copy.id)).digest,(await snapshot(pool,admin,null,inner.source,inner.id)).digest);
  const live=(await snapshot(pool,admin,null,inner.source)).structure;assert(live.tables.some(t=>t.name==='schema_migrations'));assert(live.migrations.includes('022-schema-explorer.sql'));
  assert(!JSON.stringify(live).includes('sensible-fixture'));
  const t=live.tables.find(t=>t.name==='travaux')!;assert.equal(t.rls,true);assert.equal(t.policies.length,2);assert.equal(t.triggers.length,1);
  assert(t.constraints.some(c=>c.target?.columns.join(',')==='site,id'));assert(t.indexes.some(i=>i.name==='travaux_atelier'));
  await assert.rejects(sources(pool,op,null),{status:403});
  const fields={origin:'sql',environment:'test',label:'Formations',reference:'001.sql',document:sql};
  await assert.rejects(importSource(pool,viewer,'a',fields),{status:403});
  const a=await importSource(pool,op,'a',fields),b=await importSource(pool,admin,'b',fields);
  const external=await importSource(pool,op,'a',{...fields,environment:'development'});
  assert.notEqual(a.source,external.source);
  await assert.rejects(snapshot(pool,admin,'a',a.source,external.id),{status:404});
  await assert.rejects(snapshot(pool,op,'a',b.source,b.id),{status:404});await assert.rejects(readSource(pool,op,'b',b.source),{status:404});
  const inc={...fields,origin:'migration',reference:'002.sql',document:'ALTER TABLE public.travaux ADD COLUMN titre text'};
  const [one,two]=await Promise.all([importSource(pool,op,'a',inc),importSource(pool,op,'a',inc)]);assert.deepEqual(one,two);
  assert.equal((await versions(pool,viewer,'a',a.source)).length,2);
  await assert.rejects(importSource(pool,op,'a',{...inc,document:'ALTER TABLE public.travaux ADD COLUMN prix int'}),{status:400});
  await assert.rejects(revokeSource(pool,op,'a',a.source),{status:403});await revokeSource(pool,admin,'a',a.source);
  await assert.rejects(snapshot(pool,viewer,'a',a.source,a.id),{status:404});
  await assert.rejects(importSource(pool,op,'a',fields),{status:409});
  assert((await sources(pool,op,'a')).every(s=>s.id!==a.source));
});
test('Explorer · connexion privilégiée refusée, sources HTTP cloisonnées',async()=>{
  await assert.rejects(inspectDedicated(testUrl.href,['public']),/dédié aux métadonnées/);
  const token=randomBytes(32).toString('base64url');
  const server=createServer(new Core(pool),[{id:'schema-view',kind:'operator',projectIds:['a'],token}]);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const url='http://127.0.0.1:'+(server.address() as AddressInfo).port;
    const req=(path:string)=>fetch(url+path,{headers:{authorization:'Bearer '+token}});
    assert.equal((await req('/api/projects/a/database')).status,200);assert.equal((await req('/api/projects/b/database')).status,404);
    const source=await captureInternal(pool);assert.equal((await req('/api/database?source='+source.source)).status,403);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('Explorer · connexion avec rôle catalogue seul sur grappe de recette isolée',{skip:process.env.STUDIO_EXPLORER_TEST_ROLE!=='1'},async()=>{
  assert.equal(testUrl.port,'55453');assert.equal(process.env.COMPOSE_PROJECT_NAME,'fjstudio-evolution');
  const role='test_schema_'+randomUUID().replaceAll('-',''),password=randomBytes(32).toString('hex');
  // Cluster-global setup is enabled explicitly only on the dedicated disposable QA instance.
  await pool.query("CREATE ROLE "+role+" LOGIN PASSWORD '"+password+"'");
  try{
    const dsn=new URL(testUrl);dsn.username=role;dsn.password=password;
    const m=await inspectDedicated(dsn.href,['public']);assert(m.tables.some(t=>t.name==='projects'));
    await pool.query('GRANT SELECT ON projects TO '+role);
    await assert.rejects(inspectDedicated(dsn.href,['public']),/dédié aux métadonnées/);
  }finally{await pool.query('DROP OWNED BY '+role);await pool.query('DROP ROLE '+role);}
});

test('Explorer · code local non commité, empreinte rejouable, lecture bornée et révocation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'fjstudio-code-')),dir=join(root,'supabase','migrations');
  const previous=process.env.STUDIO_GIT_REPOSITORIES;
  const key='schema-local-fixture', project='b';
  try{
    process.env.STUDIO_GIT_REPOSITORIES=JSON.stringify([{key,project,directory:root,remote:''}]);
    await pool.query("INSERT INTO project_repositories(project_id,repository_key,remote_url,registered_by) VALUES($1,$2,'','fixture')",[project,key]);
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'001_initial.sql'),"CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    await writeFile(join(dir,'002_rooms.sql'),"CREATE TABLE public.loft(id int PRIMARY KEY); CREATE TRIGGER arrival AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.enter();");
    await writeFile(join(dir,'002_rooms.down.sql'),"DROP TABLE public.loft;");
    const first=await syncProjectCode(pool,admin,project);
    assert.equal(first.sources.length,1,first.status);
    const source=first.sources[0].id;
    const hist=()=>versions(pool,admin,project,source);
    const capture=await snapshot(pool,admin,project,source);
    assert.deepEqual(capture.structure.tables.map(t=>t.name),['loft']);
    assert.match(capture.structure.warnings.join(' '),/auth.users/);
    assert.equal(capture.structure.migrations.length,2);
    await Promise.all([syncProjectCode(pool,admin,project),syncProjectCode(pool,admin,project)]);
    assert.equal((await hist()).length,1);
    await writeFile(join(dir,'003_update.sql'),'ALTER TABLE public.loft ADD COLUMN seats int;');
    assert.equal((await syncProjectCode(pool,admin,project)).sources[0].updated,true);
    assert.equal((await hist()).length,2);
    await assert.rejects(syncProjectCode(pool,{...viewer,projectIds:['b']},project));
    await assert.rejects(syncProjectCode(pool,op,project));
    await writeFile(join(dir,'004_bad.sql'),'BAD SQL TEXT');
    assert.equal((await syncProjectCode(pool,admin,project)).sources.length,0);
    assert.equal((await hist()).length,2);
    await rm(join(dir,'004_bad.sql'));
    await writeFile(join(root,'unrelated.txt'),'CREATE TABLE must_not_import(i int);');
    await link(join(root,'unrelated.txt'),join(root,'schema.sql'));
    assert.equal((await syncProjectCode(pool,admin,project)).sources.length,0);
    await rm(join(root,'schema.sql'));
    await revokeSource(pool,admin,project,source);
    assert.equal((await syncProjectCode(pool,admin,project)).sources.length,0);
    assert.equal((await sources(pool,admin,project)).some(s=>s.id===source),false);
  }finally{
    if(previous===undefined)delete process.env.STUDIO_GIT_REPOSITORIES;else process.env.STUDIO_GIT_REPOSITORIES=previous;
    await rm(root,{recursive:true,force:true});
  }
});
