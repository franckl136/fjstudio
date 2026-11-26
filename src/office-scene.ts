import type { Desk } from './product-workspace.ts';
import { date,e } from './views.ts';

type OfficeData={agents:readonly Desk[];projects:readonly {id:string;name:string}[]};

export function deskName(d:Desk) {
  if(d.id.startsWith('scribe-')) return 'Documentaliste';
  if(d.id.startsWith('controle-')) return 'Vérificateur';
  return d.id;
}
const zones={coffee:'disponible au café',desks:'au poste de travail',meeting:'à la table de synthèse'};
const taskNames:Record<string,string>={structure:'Index du document',coverage:'Vérification des critères',synthesis:'Synthèse des deux preuves'};
function outfit(projectId:string,role:Desk['role']) {
  return (Array.from(projectId).reduce((v,c)=>v+c.charCodeAt(0),0)+(role==='preparer'?0:3))%6;
}
function zone(d:Desk):keyof typeof zones {
  const task=d.records.find(r=>r.live);
  return task?.task==='synthesis'?'meeting':task?'desks':'coffee';
}
function classicScene(data:OfficeData,stationLink:(d:Desk)=>string,query:URLSearchParams) {
  const online=data.agents.filter(d=>d.state!=='offline' && d.state!=='unseen');
  const rooms={coffee:online.filter(d=>zone(d)==='coffee'),desks:online.filter(d=>zone(d)==='desks'),meeting:online.filter(d=>zone(d)==='meeting')};
  const perRoom=4;
  const pages=Math.max(1,...Object.values(rooms).map(room=>Math.ceil(room.length/perRoom)));
  const requested=Number(query.get('groupe')??1);
  const group=Number.isSafeInteger(requested)?Math.min(Math.max(requested,1),pages):1;
  const visible=Object.values(rooms).flatMap(room=>{
    const start=Math.min((group-1)*perRoom,Math.max(0,Math.floor((room.length-1)/perRoom))*perRoom);
    return room.slice(start,start+perRoom);
  });
  function page(n:number) {
    const params=new URLSearchParams(query);
    params.set('groupe',String(n));
    return '/office?'+e(params.toString())+'#loft';
  }
  const locations={coffee:0,desks:0,meeting:0};
  const people=visible.map(d=>{
    const key=zone(d),place=locations[key]++;
    const name=deskName(d),project=data.projects.find(p=>p.id===d.projectId)?.name??d.projectId;
    const look=outfit(d.projectId,d.role);
    const description=name+' · '+project+' · '+zones[key];
    return `<a class="loft-person look-${look}" data-area="${key}" data-seat="${place}" data-member="${e(d.projectId+'/'+d.id+'/'+d.role)}"
      href="${e(stationLink(d))}" title="${e(description)}" aria-label="${e(description)}"><i class="walker" aria-hidden="true"></i>
      <span class="loft-tag">${e(name)} · ${e(project)}</span></a>`;
  }).join('');
  return `<section id="loft" class="loft panel"><header class="section-head"><div><h2>Le loft du Studio</h2>
    <p>Les agents locaux dans l’atelier · <a href="${loftUrl(query,{rendu:null})}">Voir le loft pixel</a></p></div><button class="loft-expand" type="button" aria-pressed="false" hidden>⛶ Agrandir</button></header>
    <div class="loft-stage"><div class="loft-floor" aria-label="Atelier parisien · plateau des agents">
    <i class="coffee-steam" aria-hidden="true"></i><div class="loft-people">${people}</div></div></div>
    <div class="loft-presence"><ul class="loft-legend"><li><i></i><b>${rooms.coffee.length}</b> au café</li>
    <li><i></i><b>${rooms.desks.length}</b> au bureau</li><li><i></i><b>${rooms.meeting.length}</b> en synthèse</li></ul>
    <p class="loft-count">${visible.length} sur ${online.length} à l’image. Sélectionnez un personnage pour ouvrir son poste.</p>
    ${pages>1?`<nav aria-label="Groupes du plateau"><a href="${page(group===1?pages:group-1)}" aria-label="Groupe précédent">←</a>
      Groupe ${group} / ${pages} <a href="${page(group===pages?1:group+1)}" aria-label="Groupe suivant">→</a></nav>`:''}</div>
    ${historyPanel(data,false)}
    <span class="loft-caption" role="status"></span></section>`;
}

function historyPanel(data:OfficeData,pixels:boolean) {
  // A replay uses accepted attempts of one completed synthesis, including its own project and mission.
  const records=data.agents.flatMap(d=>d.records.filter(r=>r.engine==='control' && r.state==='completed'));
  const last=records.filter(r=>r.task==='synthesis').sort((a,b)=>Number(b.finished)-Number(a.finished))[0];
  const replay=last?records.filter(r=>r.project_id===last.project_id && r.mission_id===last.mission_id)
    .sort((a,b)=>Number(a.began)-Number(b.began)): [];
  return `<div class="loft-history" data-mission="${last && replay.length===3?e(last.mission_id):''}">${last && replay.length===3?`<details><summary>Dernière mission · ${e(last.objective)}</summary>
      <ol>${replay.map(r=>`<li data-look="${outfit(r.project_id,r.role)}" data-member="${e(r.project_id+'/'+r.runner_id+'/'+r.role)}" data-area="${r.task==='synthesis'?'meeting':pixels&&r.role==='verifier'?'control':'desks'}">${e(taskNames[r.task]??r.task)} · ${e(r.runner_id)} · ${date(r.finished)}</li>`).join('')}</ol>
      <a href="/projects/${e(last.project_id)}/control/${e(last.mission_id)}">Lire les trois checkpoints</a></details>
      <button type="button" class="loft-replay" hidden>Rejouer les trois étapes</button>`:''}</div>`;
}

function loftUrl(query:URLSearchParams,fields:Record<string,string|null>) {
  const params=new URLSearchParams(query);
  for(const [key,value] of Object.entries(fields)) { if(value===null) params.delete(key); else params.set(key,value); }
  return '/office?'+e(params.toString())+'#loft';
}

const rooms=[
  {id:'desks',slug:'bureau',name:'Bureau',purpose:'Préparation des livrables'},
  {id:'coffee',slug:'cafe',name:'Café',purpose:'Agents disponibles'},
  {id:'meeting',slug:'reunion',name:'Salle de réunion',purpose:'Synthèse des résultats'},
  {id:'control',slug:'controle',name:'Salle de contrôle',purpose:'Vérification des critères'},
] as const;
type Room=typeof rooms[number]['id'];
function observedRoom(d:Desk):Room {
  const active=d.records.find(r=>r.live);
  if(!active) return 'coffee';
  if(active.task==='synthesis') return 'meeting';
  return active.role==='verifier'?'control':'desks';
}
function avatar(d:Desk,data:OfficeData,area:Room,seat:number,stationLink:(d:Desk)=>string) {
  const name=deskName(d),project=data.projects.find(p=>p.id===d.projectId)?.name??d.projectId;
  const title=name+' · '+project;
  return `<a class="pixel-person loft-person look-${outfit(d.projectId,d.role)}" data-member="${e(d.projectId+'/'+d.id+'/'+d.role)}"
    data-area="${area}" data-seat="${seat}" title="${e(title)}" aria-label="Ouvrir le poste · ${e(title)}" href="${e(stationLink(d))}"><span class="pixel-label">${e(title)}</span></a>`;
}

export function officeScene(data:OfficeData,stationLink:(d:Desk)=>string,query:URLSearchParams) {
  if(query.get('rendu')==='classique') return classicScene(data,stationLink,query);
  const focus=rooms.find(r=>r.slug===query.get('salle'))?.id??'plan';
  const active=data.agents.filter(d=>d.state==='working'||d.state==='verifying'||d.state==='available');
  const groups=rooms.map(room=>({...room,members:active.filter(d=>observedRoom(d)===room.id)}));
  const pageSize=4, requested=Number(query.get('groupe')??1);
  const pages=Math.max(1,...groups.filter(room=>focus==='plan'||room.id===focus).map(r=>Math.ceil(r.members.length/pageSize)));
  const page=Number.isSafeInteger(requested)?Math.min(Math.max(1,requested),pages):1;
  const roomLink=(slug:string|null)=>loftUrl(query,{salle:slug,groupe:null});
  return `<section id="loft" class="loft panel pixel-loft" data-focus="${focus}">
    <link rel="stylesheet" href="/office-assets/pixel-office.css"><script src="/office-assets/pixel-office.js" defer></script>
    <header class="section-head"><div><h2>Le loft du Studio</h2><p>Choisissez une pièce ou le poste d’un agent.</p></div>
    <button class="loft-expand" type="button" aria-pressed="false" hidden>⛶ Agrandir</button></header>
    <nav class="room-tabs" aria-label="Pièces du loft"><a href="${roomLink(null)}"${focus==='plan'?' aria-current="page"':''}>Plan</a>
    ${groups.map(room=>`<a href="${roomLink(room.slug)}"${focus===room.id?' aria-current="page"':''}>${room.name} <span data-count="${room.id}">${room.members.length}</span></a>`).join('')}</nav>
    <div class="pixel-campus">${groups.map(room=>{
      const start=Math.min((page-1)*pageSize,Math.max(0,Math.floor((room.members.length-1)/pageSize))*pageSize);
      const members=room.members.slice(start,start+pageSize);
      return `<article class="pixel-room" data-office-room="${room.id}" data-in-focus="${focus===room.id?'yes':'no'}">
        <header><div><h3><a href="${roomLink(room.slug)}">${room.name}</a></h3><small>${room.purpose}</small></div>
        <span class="room-total" data-count="${room.id}" aria-label="Effectif de la pièce">${room.members.length}</span></header>
        <div class="pixel-floor"><canvas width="400" height="228" data-room-art="${room.id}" data-occupants="${room.members.length}" aria-hidden="true"></canvas>
        <div class="loft-people" data-crowd="${room.id}">${members.map((d,i)=>avatar(d,data,room.id,i,stationLink)).join('')}</div></div>
      </article>`;}).join('')}</div>
    <div class="loft-presence"><a href="${loftUrl(query,{liste:'1'}).replace(/#loft$/,'#postes-locaux')}">Liste des postes</a><a href="${loftUrl(query,{rendu:'classique'})}">Atelier classique</a>
    ${pages>1?`<nav aria-label="Groupes du plateau"><a href="${loftUrl(query,{groupe:String(page===1?pages:page-1)})}" aria-label="Groupe précédent">←</a>
      Groupe ${page} / ${pages} <a href="${loftUrl(query,{groupe:String(page===pages?1:page+1)})}" aria-label="Groupe suivant">→</a></nav>`:''}</div>
    ${historyPanel(data,true)}<span class="loft-caption" role="status"></span></section>`;
}
