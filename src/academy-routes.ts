import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { DomainError, type Operator, type JsonObject } from './contracts.ts';
import { notFound } from './database.ts';
import { date, e, layout } from './views.ts';
import { listWorkspaceProjects } from './product-workspace-projects.ts';
import { globalDestination } from './project-navigation.ts';
import { lessons, type Lesson } from './academy-catalog.ts';
import { beginLesson, checkLesson, findLesson, lessonChoices, notebook, previousPractice, teachingSchema, trainingObjectives } from './academy.ts';
import { helpDocs, helpSearch } from './academy-help.ts';
import { documentBody } from './academy-help-view.ts';

type Book=Awaited<ReturnType<typeof notebook>>;
interface Tools {
  html(res:ServerResponse,status:number,value:string):void;
  json(res:ServerResponse,status:number,value:unknown):void;
  body(req:IncomingMessage,kind:'form'|'json'):Promise<JsonObject>;
  redirect(res:ServerResponse,target:string):void;
}
const projectQuery=(project?:string|null)=>project?'?project='+encodeURIComponent(project):'';
const pathTo=(id:string,project?:string|null)=>'/academy/'+id+projectQuery(project);
const complete=(b:Book,id:string)=>b.progress.some(p=>p.lesson===id&&p.completed_at);
function status(b:Book,id:string) {
  if(complete(b,id)) return 'Exercice validé';
  return b.progress.some(p=>p.lesson===id)?'En cours':'À découvrir';
}
function recommendation(b:Book) {
  const available=(l:Lesson)=>!complete(b,l.id)&&(!l.stage||l.stage===b.stage+1);
  return lessons.find(l=>available(l)&&b.progress.some(p=>p.lesson===l.id))??lessons.find(available);
}
const taskLabels:Record<string,string>={structure:'Indexer le document',coverage:'Repérer les critères',synthesis:'Vérifier les preuves'};
const stateLabels={draft:'Brouillon',planned:'Plan validé',running:'En cours',completed:'Terminée',waiting:'En attente',ready:'Prête'};
function practicePanel(book:Book,project?:string|null) {
  const practice=book.practice;
  if(!practice.project) return '';
  const next=previousPractice(book.stage);
  return `<section id="carnet" class="panel"><h2>Mon atelier synthétique · ${e(practice.project)}</h2>
    ${practice.mission?`<p><strong>${e(practice.mission.objective)}</strong> · ${e(stateLabels[practice.mission.status])}</p>`:'<p>Votre projet est prêt à recevoir sa première mission de formation.</p>'}
    ${practice.tasks?`<div class="table-wrap"><table><thead><tr><th>Tâche</th><th>Agent de formation</th><th>État</th></tr></thead><tbody>
      ${practice.tasks.map(t=>'<tr><th scope="row">'+e(taskLabels[t.key])+'</th><td>'+e(t.assignee)+'</td><td>'+e(stateLabels[t.state])+'</td></tr>').join('')}</tbody></table></div>`:''}
    ${practice.projectId?`<details><summary>Identifiants du carnet</summary><dl class="academy-receipt"><dt>Projet</dt><dd>${e(practice.projectId)}</dd>
      ${practice.mission?'<dt>Mission</dt><dd>'+e(practice.mission.id)+'</dd>':''}</dl></details>`:''}
    <a href="${pathTo(next?.id??'preuve',project)}#${next?'exercice':'preuve'}">${next?'Poursuivre · '+e(next.title):'Consulter la preuve finale'}</a></section>`;
}
function catalogPage(book:Book,actor:Operator,q:string,project?:string|null) {
  const finished=lessons.filter(l=>complete(book,l.id));
  const next=recommendation(book), groups=[...new Set(lessons.map(l=>l.group))];
  const search=helpSearch(q);
  const searchView=q?`<div aria-live="polite"><h3>Résultats pour « ${e(q)} »</h3>
    ${search.lessons.length?'<ul>'+search.lessons.map(l=>'<li><a href="'+pathTo(l.id,project)+'">'+e(l.title)+'</a></li>').join('')+'</ul>':''}
    ${search.docs.length?'<ul>'+search.docs.map(d=>'<li><a href="/academy/docs/'+e(d.id)+projectQuery(project)+'">'+e(d.title)+'</a><p>'+e(d.excerpt)+'</p></li>').join('')+'</ul>':''}
    ${search.lessons.length||search.docs.length?'':'<p>Aucun guide trouvé. Essayez « bail », « qualification » ou « sauvegarde ».</p>'}</div>`:'';
  return `<header class="product-heading"><div><h1>Studio Academy</h1><p>Apprenez à piloter le Studio dans votre carnet de formation personnel.</p></div></header>
    <section id="aide" class="panel"><h2>Rechercher dans les guides</h2>
      <form class="search-toolbar" role="search" method="get" action="/academy#aide">${project?'<input type="hidden" name="project" value="'+e(project)+'">':''}<label for="academy-q">Question ou mots-clés</label><input id="academy-q" type="search" name="q" maxlength="120" value="${e(q)}">
      <button>Rechercher</button></form>${searchView}
      <details><summary>Documentation consultable</summary><ul>${helpDocs().map(d=>'<li><a href="/academy/docs/'+d.id+projectQuery(project)+'">'+e(d.title)+'</a></li>').join('')}</ul></details></section>
    <section class="panel academy-progress"><div><h2>Votre parcours</h2>
      <p><strong>${finished.length} sur ${lessons.length}</strong> exercices validés · ${book.progress.filter(p=>!p.completed_at).length} en cours</p>
      <progress max="${lessons.length}" value="${finished.length}" aria-label="Exercices validés"></progress></div>
      ${next?`<a class="button primary" href="${pathTo(next.id,project)}">${book.progress.length?'Continuer':'Commencer'} · ${e(next.title)} →</a>`:'<p>Tous les exercices du parcours ont été validés.</p>'}
      ${actor.accountRole==='viewer'?'<p>Votre accès lecteur permet de parcourir les leçons et les exemples. La saisie dans un carnet est disponible aux opérateurs et administrateurs.</p>':''}</section>
    ${practicePanel(book,project)}
    <div class="academy-grid">${groups.map(group=>`<section class="panel"><h2>${e(group)}</h2><ol class="academy-index">${lessons.filter(l=>l.group===group).map(l=>
      `<li><a href="${pathTo(l.id,project)}">${e(l.title)}</a><small>${status(book,l.id)}</small></li>`).join('')}</ol></section>`).join('')}</div>
    ${finished.length?`<details class="panel"><summary>Compétences exercées et validées</summary><ul>${finished.map(l=>`<li><a href="${pathTo(l.id,project)}#preuve">${e(l.outcome)}</a></li>`).join('')}</ul></details>`:''}`;
}
export function moduleLink(lesson:Lesson,project?:string) {
  const prefix=project?'/projects/'+encodeURIComponent(project):'';
  if(lesson.id==='github')return '/office'+projectQuery(project)+'#cursor';
  if(lesson.module==='workspace')return '/workspace'+projectQuery(project)+(lesson.id==='pilotage'?'#attention':'');
  if(lesson.module==='office')return '/office'+projectQuery(project)+'#loft';
  if(lesson.module==='projects')return prefix||'/workspace#portefeuille';
  return prefix?prefix+'/'+lesson.module:globalDestination(lesson.module);
}
function receipts(evidence:JsonObject) {
  return '<details open><summary>Résultat enregistré dans votre carnet</summary><dl class="academy-receipt">'+Object.entries(evidence).map(([k,v])=>
    '<dt>'+e(k)+'</dt><dd>'+(typeof v==='object'?'<pre>'+e(JSON.stringify(v,null,2))+'</pre>':e(v))+'</dd>').join('')+'</dl></details>';
}
async function lessonPage(book:Book,actor:Operator,lesson:Lesson,project:string|undefined,wrong:boolean) {
  const row=book.progress.find(p=>p.lesson===lesson.id),root=pathTo(lesson.id);
  const prerequisites=lesson.stage && lesson.stage>book.stage+1?previousPractice(book.stage):undefined;
  const upcoming=recommendation(book);
  const url=moduleLink(lesson,project);
  const scope=projectQuery(project);
  const options=lessonChoices(lesson,book.practice);
  let material='';
  if(['donnees','relations','versions','policies'].includes(lesson.id)){
    const s=await teachingSchema();
    material=`<details open><summary>Schéma du laboratoire · ${e(s.engine)}</summary><dl class="facts">
      <dt>ateliers</dt><dd>${e(s.ateliers.join(', '))}</dd><dt>travaux · version 1</dt><dd>${e(s.travaux.join(', '))}</dd>
      <dt>Clé étrangère déclarée</dt><dd><code>${e(s.relation.from)} → ${e(s.relation.to)}</code></dd>
      ${lesson.id==='policies'?'<dt>RLS</dt><dd>'+ (s.rls?'Activée':'Désactivée')+'</dd><dt>'+e(s.policy.name)+'</dt><dd>'+e(s.policy.command)+' · USING '+e(s.policy.using)+'</dd>':''}
      ${lesson.id==='versions'?'<dt>travaux · version 2</dt><dd>'+e(s.travauxV2.join(', '))+'</dd>':''}</dl></details>`;
  } else if(lesson.id==='preuve'&&book.practice.synthesis) {
    material='<dl class="academy-receipt"><dt>Texte source</dt><dd>'+e(book.practice.mission?.sourceSha256)+'</dd><dt>Checkpoint · synthèse</dt><dd>'+e(book.practice.synthesis.sha256)+'</dd></dl>';
  }
  const validated=Boolean(row?.completed_at);
  const choices=options.map(([v,label])=>`<label class="academy-choice"><input required type="radio" name="answer" value="${e(v)}"> <span>${e(label)}</span></label>`).join('');
  return `<a class="back" href="/academy${scope}">← Parcours Academy</a>
    <header class="product-heading"><div><h1>${e(lesson.title)}</h1><p>${e(lesson.outcome)}</p></div></header>
    <nav class="actions academy-steps" aria-label="Étapes du guide"><a href="#observer">Observer</a> <a href="#exercice">Pratiquer</a> ${validated?'<a href="#preuve">Relire la preuve</a>':''}</nav>
    <section class="panel academy-target" id="observer" tabindex="-1"><h2>Observer</h2><p>${e(lesson.detail)}</p>
    ${url?`<a href="${e(url)}">Consulter cet espace du Studio</a>`:''}</section>
    <section class="panel academy-target" id="exercice" tabindex="-1"><h2>Exercice synthétique</h2>
    <div class="academy-sample">${e(lesson.sample).replaceAll('\n','<br>')}</div>${material}
    ${wrong?'<p class="error" role="alert">Le résultat ne correspond pas aux éléments du cas. Relisez les indices puis réessayez.</p>':''}
    ${validated?'<p class="badge">Exercice validé</p>':actor.accountRole==='viewer'?'<p>Exercice en consultation avec votre accès lecteur.</p>':
      prerequisites?`<p>Le carnet de mission se construit dans l’ordre. Prochaine étape : <a href="${pathTo(prerequisites.id,project)}#exercice">${e(prerequisites.title)}</a>.</p>`:
      !row?`<form action="${root}/start${scope}" method="post"><button class="primary">Commencer l’exercice</button></form>`:
      `<form action="${root}/check${scope}" method="post">${lesson.id==='mission'?'<label>Objectif du brief<select name="objective">'+Object.entries(trainingObjectives).map(([k,v])=>'<option value="'+e(k)+'">'+e(v)+'</option>').join('')+'</select></label>':''}
       <fieldset><legend>${e(lesson.question)}</legend>${choices}</fieldset><button class="primary">${lesson.id==='qualite'?'Lancer la qualification et vérifier':lesson.id==='tache'?'Exécuter et vérifier':'Valider ma réponse'}</button></form>`}</section>
    ${validated?`<section class="panel academy-target" id="preuve" tabindex="-1"><h2>Compétence validée</h2><p>${e(lesson.feedback)}</p>
      <p>Exercice validé le ${date(row!.completed_at)}.</p>${receipts(row!.evidence!)}
      ${upcoming?`<a class="button" href="${pathTo(upcoming.id,project)}">Continuer · ${e(upcoming.title)} →</a>`:''}</section>`:''}
    <a class="back" href="/academy${scope}">Quitter cette leçon et retrouver mon parcours</a>`;
}

export async function academyRoute(pool:Pool,req:IncomingMessage,res:ServerResponse,url:URL,actor:Operator,api:boolean,io:Tools) {
  const path=api?url.pathname.slice(4):url.pathname;
  if(path!=='/academy' && !path.startsWith('/academy/')) return false;
  const parts=path.split('/').slice(2),id=parts[0],action=parts[1];
  const project=url.searchParams.get('project');
  if(project&&!actor.projectIds.includes(project)) throw notFound();
  const render=async(status:number,title:string,html:string)=>{
    const projects=await listWorkspaceProjects(pool,actor);
    io.html(res,status,layout(title,html,projects,project??'',true,'academy'));
  };
  if(req.method==='GET') {
    if(parts.length===2 && id==='docs'){
      const doc=helpDocs().find(d=>d.id===action);
      if(!doc) throw notFound();
      if(api) io.json(res,200,doc);
      else await render(200,doc.title,'<a href="/academy'+projectQuery(project)+'#aide">← Recherche documentaire</a><section class="panel"><h1>'+e(doc.title)+'</h1><p>Source locale · docs/'+e(doc.file)+'</p>'+
        documentBody(doc,project??undefined)+'</section>');
      return true;
    }
    if(parts.length>1 || id==='docs') throw notFound();
    const book=await notebook(pool,actor),q=url.searchParams.get('q')?.trim().slice(0,120)??'';
    if(!id) {
      if(api) io.json(res,200,{lessons:lessons.map(({id,title,group,outcome})=>({id,title,group,outcome})),progress:book.progress,
        practice:book.practice,next:recommendation(book)?.id??null,search:helpSearch(q)});
      else await render(200,'Studio Academy',catalogPage(book,actor,q,project));
    } else {
      const lesson=findLesson(id);
      if(api) {
        const {title,detail,question,sample,outcome}=lesson;
        io.json(res,200,{id,title,detail,sample,question,outcome,choices:lessonChoices(lesson,book.practice),progress:book.progress.find(p=>p.lesson===id)??null});
      } else await render(200,lesson.title,await lessonPage(book,actor,lesson,project??undefined,false));
    }
    return true;
  }
  if(req.method!=='POST') throw new DomainError(405,'academy_method','Méthode indisponible.');
  if(actor.accountRole==='viewer') throw new DomainError(403,'academy_readonly','Accès en lecture.');
  if(parts.length!==2 || !['start','check'].includes(action)) throw notFound();
  const lesson=findLesson(id),input=await io.body(req,api?'json':'form');
  if(action==='start') {
    if(Object.keys(input).length) throw new DomainError(400,'academy_fields','Aucun paramètre attendu.');
    await beginLesson(pool,actor,id);
    if(api) io.json(res,200,{lesson:id,started:true});else io.redirect(res,pathTo(id,project)+'#exercice');
  } else {
    if(Object.keys(input).some(k=>k!=='answer' && (id!=='mission'||k!=='objective')) || typeof input.answer!=='string' ||
      (input.objective!==undefined && typeof input.objective!=='string')) throw new DomainError(400,'academy_fields','Champs de l’exercice invalides.');
    const result=await checkLesson(pool,actor,id,input.answer,input.objective);
    if(api) io.json(res,result.correct?200:422,result);
    else if(result.correct) io.redirect(res,pathTo(id,project)+'#preuve');
    else await render(422,lesson.title,await lessonPage(await notebook(pool,actor),actor,lesson,project??undefined,true));
  }
  return true;
}
