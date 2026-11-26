import { importSql } from './explorer-import.ts';
import { differences } from './explorer-model.ts';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { digestJson, DomainError, type JsonObject, type Operator } from './contracts.ts';
import { transaction, notFound } from './database.ts';
import { lessons, lessonById, type Lesson } from './academy-catalog.ts';
import { controlAdapters, documentHash, documentPlan, type ControlInput } from './control-room-adapters.ts';
import { getFixture, prepare, verify } from './plan.ts';
import { qualityReview } from './quality.ts';

type Proof = {artifact:JsonObject; sha256:string};
export type Practice = {
  project?:string; projectId?:string;
  mission?:{id:string;projectId:string;objective:string;status:'draft'|'planned'|'running'|'completed';document:string;criterion:string;sourceSha256:string};
  tasks?:{key:string;role:string;assignee:string;dependencies:string[];state:'waiting'|'ready'|'completed'}[];
  checkpoints?:{structure:Proof;coverage:Proof}; synthesis?:Proof;
};
export type Progress = {lesson:string; started_at:Date; completed_at:Date|null; evidence:JsonObject|null};
type Book = {stage:number;practice:Practice};
const emptyBook:Book={stage:0,practice:{}};
export const trainingObjectives={passation:'Préparer la passation du lot ambre',controle:'Contrôler le dossier du lot ambre'};
const owner=(actor:Operator)=>(actor.accountRole?'account:':'operator-key:')+actor.id;
function writable(actor:Operator) {
  if(actor.accountRole==='viewer') throw new DomainError(403,'academy_readonly','Ce compte peut consulter les guides et les exercices.');
}
export function findLesson(id:string) {
  const item=lessonById.get(id);
  if(!item) throw notFound();
  return item;
}
export async function notebook(pool:Pool,actor:Operator) {
  const key=owner(actor);
  return transaction(pool,async c=>{
    const book=(await c.query<Book>('SELECT stage,practice FROM academy_notebooks WHERE owner_key=$1',[key])).rows[0]??emptyBook;
    const progress=(await c.query<Progress>('SELECT lesson,started_at,completed_at,evidence FROM academy_progress WHERE owner_key=$1 ORDER BY started_at',[key])).rows;
    return {...book,progress};
  },true);
}
export async function beginLesson(pool:Pool,actor:Operator,id:string) {
  writable(actor);findLesson(id);
  await transaction(pool,async c=>{
    await c.query('INSERT INTO academy_notebooks(owner_key) VALUES($1) ON CONFLICT DO NOTHING',[owner(actor)]);
    await c.query('INSERT INTO academy_progress(owner_key,lesson) VALUES($1,$2) ON CONFLICT DO NOTHING',[owner(actor),id]);
  });
}

function stamp(artifact:JsonObject):Proof { return {artifact,sha256:digestJson(artifact)}; }
function documentInput(practice:Practice):ControlInput {
  const m=practice.mission;
  if(!m || documentHash(m.document)!==m.sourceSha256) throw new Error('Brief pédagogique incohérent.');
  return {objective:m.objective,scope:'Formation',constraints:'Jeu synthétique',document:m.document,criteria:[m.criterion],
    sourceSha256:m.sourceSha256,context:[],evidence:[]};
}

async function readTeachingSchema() {
  const ddl='CREATE TABLE public.ateliers (id integer PRIMARY KEY); CREATE TABLE public.travaux (id integer PRIMARY KEY, atelier_id integer NOT NULL, CONSTRAINT travaux_atelier_fk FOREIGN KEY (atelier_id) REFERENCES public.ateliers(id)); ALTER TABLE public.travaux ENABLE ROW LEVEL SECURITY; CREATE POLICY lecture_ouverte ON public.travaux FOR SELECT USING (true);';
  const first=await importSql(ddl);
  const second=await importSql(ddl+' ALTER TABLE public.travaux ADD COLUMN titre text;');
  const travaux=first.tables.find(t=>t.name==='travaux')!,fk=travaux.constraints.find(c=>c.kind==='foreign')!;
  return {engine:'Import PostgreSQL · jeu Academy',ateliers:first.tables.find(t=>t.name==='ateliers')!.columns.map(c=>c.name),
    travaux:travaux.columns.map(c=>c.name),travauxV2:second.tables.find(t=>t.name==='travaux')!.columns.map(c=>c.name),
    relation:{from:'travaux.'+fk.columns[0],to:fk.target!.table+'.'+fk.target!.columns[0]},
    policy:travaux.policies[0],rls:travaux.rls,changes:differences(first,second).map(change=>change.path.join('.'))};
}
let sampleSchema:ReturnType<typeof readTeachingSchema>|undefined;
export function teachingSchema() {return sampleSchema??=readTeachingSchema();}
export function lessonChoices(lesson:Lesson,practice:Practice):readonly [string,string][] {
  if(lesson.id!=='preuve') return lesson.choices;
  if(!practice.synthesis || !practice.mission) return [];
  return [[practice.mission.sourceSha256,practice.mission.sourceSha256],[practice.synthesis.sha256,practice.synthesis.sha256]];
}
export function previousPractice(stage:number) { return lessons.find(l=>l.stage===stage+1); }

async function practiceResult(lesson:Lesson,answer:string,practice:Practice,objective:keyof typeof trainingObjectives):Promise<JsonObject|null> {
  switch(lesson.id) {
    case 'projets':
      practice.project=answer==='papier'?'Atelier Papier':'Atelier Cuivre';
      practice.projectId='formation-'+randomUUID();
      return {projet:practice.project,identifiant:practice.projectId};
    case 'mission': {
      const document=lesson.sample;
      practice.mission={id:randomUUID(),projectId:practice.projectId!,objective:trainingObjectives[objective],status:'draft',
        document,criterion:'Le lot ambre est vérifié.',sourceSha256:documentHash(document)};
      return {projet:practice.project,mission:practice.mission.id,objectif:practice.mission.objective,critère:practice.mission.criterion,sourceSha256:practice.mission.sourceSha256};
    }
    case 'plan':
      practice.tasks=documentPlan.map(t=>({key:t.key,role:t.role,assignee:t.role==='preparer'?'Lou · Academy':'Iris · Academy',dependencies:[...t.dependencies],
        state:t.dependencies.length?'waiting':'ready'}));
      practice.mission!.status='planned';
      return {tâches:practice.tasks};
    case 'tache': {
      const input=documentInput(practice);
      practice.checkpoints={structure:stamp(controlAdapters.structure.execute(input)),coverage:stamp(controlAdapters.coverage.execute(input))};
      practice.mission!.status='running';
      for(const t of practice.tasks!) t.state=t.key==='synthesis'?'ready':'completed';
      return {sections:practice.checkpoints.structure.artifact.headings,critères:practice.checkpoints.coverage.artifact.matches,
        structureSha256:practice.checkpoints.structure.sha256,coverageSha256:practice.checkpoints.coverage.sha256};
    }
    case 'resultat': {
      const input=documentInput(practice), checkpoints=practice.checkpoints!;
      input.evidence=(['structure','coverage'] as const).map(key=>({key,sha256:checkpoints[key].sha256}));
      const synthesis=stamp(controlAdapters.synthesis.execute(input));
      if(answer!==synthesis.artifact.verdict) return null;
      practice.synthesis=synthesis;
      practice.mission!.status='completed';
      practice.tasks!.find(t=>t.key==='synthesis')!.state='completed';
      return {verdict:synthesis.artifact.verdict,preuves:synthesis.artifact.evidence,synthesisSha256:synthesis.sha256};
    }
    case 'preuve':
      if(!practice.synthesis || answer!==digestJson(practice.synthesis.artifact)) return null;
      return {checkpoint:'synthesis',sha256:practice.synthesis.sha256};
    case 'qualite': {
      const fixture=getFixture('a','incorrect');
      const report=qualityReview(verify(fixture,prepare(fixture)));
      if(answer!==(report.outcome==='failed'?'fail':'pass')) return null;
      return {grille:report.rubric,verdict:report.outcome,contrôles:report.checks.map(c=>({nom:c.label,statut:c.state,détail:c.detail}))};
    }
    case 'donnees': case 'relations': case 'versions': case 'policies': {
      const s=await teachingSchema();
      const expected=lesson.id==='donnees'?(s.travaux.includes('atelier_id')?'travaux':'ateliers'):
        lesson.id==='policies'?s.policy.command:lesson.id==='relations'?s.relation.to:s.travauxV2.find(column=>!s.travaux.includes(column));
      if(answer!==expected) return null;
      return {source:s.engine,réponse:answer,relation:s.relation,policy:s.policy,modifications:s.changes};
    }
    default: return {compétence:lesson.outcome,réponse:lesson.choices.find(([value])=>value===answer)?.[1]};
  }
}

export async function checkLesson(pool:Pool,actor:Operator,id:string,answer:string,objective='passation') {
  writable(actor);
  const lesson=findLesson(id);
  if(!Object.hasOwn(trainingObjectives,objective)) throw new DomainError(400,'academy_objective','Objectif du jeu synthétique inconnu.');
  return transaction(pool,async c=>{
    const key=owner(actor);
    const book=(await c.query<Book>('SELECT stage,practice FROM academy_notebooks WHERE owner_key=$1 FOR UPDATE',[key])).rows[0];
    const row=(await c.query<Progress>('SELECT * FROM academy_progress WHERE owner_key=$1 AND lesson=$2',[key,id])).rows[0];
    if(!book || !row) throw new DomainError(409,'academy_start','Commencez cet exercice avant de le valider.');
    if(row.completed_at) {
      const selected=lesson.id==='projets'?(book.practice.project==='Atelier Papier'?'papier':'cuivre'):
        lesson.id==='preuve'?book.practice.synthesis?.sha256:lesson.answer;
      const sameObjective=id!=='mission'||book.practice.mission?.objective===trainingObjectives[objective as keyof typeof trainingObjectives];
      return answer===selected&&sameObjective?{correct:true,evidence:row.evidence}:{correct:false,evidence:null};
    }
    if(lesson.stage && book.stage!==lesson.stage-1) throw new DomainError(409,'academy_prerequisite','Terminez d’abord l’étape précédente du carnet.');
    if(!lessonChoices(lesson,book.practice).some(([value])=>value===answer)) throw new DomainError(400,'academy_answer','Choix inconnu.');
    if(lesson.answer && lesson.answer!=='*' && lesson.answer!==answer && !['qualite','resultat','donnees','relations','versions'].includes(id))
      return {correct:false,evidence:null};
    const evidence=await practiceResult(lesson,answer,book.practice,objective as keyof typeof trainingObjectives);
    if(!evidence) return {correct:false,evidence:null};
    if(lesson.stage) await c.query('UPDATE academy_notebooks SET stage=$2, practice=$3 WHERE owner_key=$1',[key,lesson.stage,book.practice]);
    await c.query('UPDATE academy_progress SET completed_at=clock_timestamp(),evidence=$3 WHERE owner_key=$1 AND lesson=$2',[key,id,evidence]);
    return {correct:true,evidence};
  });
}
