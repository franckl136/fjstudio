import type { CursorPull } from './cursor-sessions.ts';
import type { CodexAgent } from './codex-office.ts';
import type { Desk } from './product-workspace.ts';
import { date,e } from './views.ts';

type OfficeData={cursorSessions?:readonly CursorPull[];agents:readonly Desk[];projects:readonly {id:string;name:string}[]};

export function deskName(d:Desk) {
  if(d.id.startsWith('scribe-')) return 'Documentaliste';
  if(d.id.startsWith('controle-')) return 'Vérificateur';
  return d.id;
}
const taskNames:Record<string,string>={structure:'Index du document',coverage:'Vérification des critères',synthesis:'Synthèse des deux preuves'};
function historyPanel(data:OfficeData) {
  // A replay uses accepted attempts of one completed synthesis, including its own project and mission.
  const records=data.agents.flatMap(d=>d.records.filter(r=>r.engine==='control' && r.state==='completed'));
  const last=records.filter(r=>r.task==='synthesis').sort((a,b)=>Number(b.finished)-Number(a.finished))[0];
  const replay=last?records.filter(r=>r.project_id===last.project_id && r.mission_id===last.mission_id)
    .sort((a,b)=>Number(a.began)-Number(b.began)): [];
  return `<div class="loft-history" data-mission="${last && replay.length===3?e(last.mission_id):''}">${last && replay.length===3?`<details><summary>Historique de mission · ${e(last.objective)}</summary>
      <ol>${replay.map(r=>`<li data-member="${e(r.project_id+'/'+r.runner_id+'/'+r.role)}" data-area="${r.task==='synthesis'?'meeting':r.role==='verifier'?'control':'desks'}">${e(taskNames[r.task]??r.task)} · ${e(r.runner_id)} · ${date(r.finished)}</li>`).join('')}</ol>
      <a href="/projects/${e(last.project_id)}/control/${e(last.mission_id)}">Lire les trois checkpoints</a></details>
      <button type="button" class="loft-replay" hidden>Rejouer les trois étapes</button>`:''}</div>`;
}

function loftUrl(query:URLSearchParams,fields:Record<string,string|null>) {
  const params=new URLSearchParams(query);
  params.delete('rendu'); params.delete('groupe'); params.delete('loft');
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
  const recent=d.records.filter(r=>r.finished).map(r=>({id:r.id,area:r.task==='synthesis'?'meeting':r.role==='verifier'?'control':'desks',at:Number(r.finished)}));
  return `<a class="pixel-person loft-person" data-member="${e(d.projectId+'/'+d.id+'/'+d.role)}"
    data-area="${area}" data-seat="${seat}" data-live="${e(d.records.find(r=>r.live)?.id??'')}" data-recent="${e(JSON.stringify(recent))}" title="${e(title)}" aria-label="Ouvrir le poste · ${e(title)}" href="${e(stationLink(d))}"><span class="pixel-label">${e(title)}<small class="fallback-room"> · ${e(rooms.find(room=>room.id===area)?.name)}</small></span></a>`;
}

const codexState={working:'Activité récente',finished:'Tour terminé',recent:'Présence non confirmée'};
function codexAvatar(a:CodexAgent,area:Room,seat:number){
  const title='Codex · '+a.name+' · '+a.project+' · '+codexState[a.state];
  return `<a class="pixel-person loft-person" data-member="codex/${e(a.id)}" data-area="${area}" data-seat="${seat}" data-live="" data-recent="[]" href="#codex-${e(a.id)}" title="${e(title)}" aria-label="${e(title)}"><span class="pixel-label">Codex · ${e(a.name)}</span></a>`;
}
function cursorAvatar(session:CursorPull,seat:number){
  const label='Cursor · PR #'+session.pr_number;
  const title=label+' · '+session.project_id+' · '+session.title+' · activité inconnue';
  return `<a class="pixel-person loft-person" data-member="cursor/${e(session.project_id)}/${e(session.agent_id)}"
    data-area="coffee" data-seat="${seat}" data-live="" data-recent="[]" title="${e(title)}" aria-label="${e(title)}"
    href="https://cursor.com/agents/${e(session.agent_id)}" target="_blank" rel="noopener noreferrer"><span class="pixel-label">${e(label)}</span></a>`;
}
export function officeScene(data:OfficeData,stationLink:(d:Desk)=>string,query:URLSearchParams,codex:CodexAgent[]=[]) {
  const focus=rooms.find(r=>r.slug===query.get('salle'))?.id??'plan';
  const active=data.agents.filter(d=>d.state==='working'||d.state==='verifying'||d.state==='available');
  const cursor=new Map<string,CursorPull>();
  for(const row of data.cursorSessions??[]){
    if(row.state==='draft'||row.state==='open')cursor.set(row.project_id+'/'+row.agent_id,row);
  }
  const groups=rooms.map(room=>({...room,cursor:room.id==='coffee'?[...cursor.values()]:[],codex:codex.filter(a=>(a.state==="working"?"desks":"coffee")===room.id),members:active.filter(d=>observedRoom(d)===room.id)}));
  const roomLink=(slug:string|null)=>loftUrl(query,{salle:slug});
  const selected=groups.find(room=>room.id===focus);
  return `<section id="loft" class="loft panel pixel-loft" data-focus="${focus}">
    <link rel="stylesheet" href="/office-assets/pixel-office.css"><script src="/office-assets/pixel-office.js" defer></script>
    <header class="section-head"><div><h2>Le loft du Studio</h2><p>Suivez les affectations entre les quatre pièces. Cliquez sur un agent pour ouvrir son poste.</p></div>
    <button class="loft-expand" type="button" aria-pressed="false" hidden>⛶ Agrandir</button></header>
    <nav class="room-tabs" aria-label="Pièces du loft"><a data-camera="plan" href="${roomLink(null)}"${focus==='plan'?' aria-current="page"':''}>Plan complet</a>
    ${groups.map(room=>`<a data-camera="${room.id}" data-name="${e(room.name)}" data-purpose="${e(room.purpose)}" href="${roomLink(room.slug)}"${focus===room.id?' aria-current="page"':''}>${room.name} <span data-count="${room.id}">${room.members.length+room.codex.length+room.cursor.length}</span></a>`).join('')}</nav>
    <div class="pixel-campus"><div class="pixel-floor"><canvas width="1520" height="824" data-floor-art aria-hidden="true"></canvas>
      <div class="loft-people">${groups.flatMap(room=>[...room.members.map((d,i)=>avatar(d,data,room.id,i,stationLink)),...room.codex.map((a,i)=>codexAvatar(a,room.id,room.members.length+i)),...room.cursor.map((a,i)=>cursorAvatar(a,room.members.length+room.codex.length+i))]).join('')}</div>
    </div></div>
    <div class="loft-presence"><div data-room-caption>${selected?`<strong>${selected.name}</strong> · ${selected.purpose}`:`<strong>${active.length+codex.length+cursor.size} dans le loft</strong>`}</div>
      <a href="${loftUrl(query,{liste:'1'}).replace(/#loft$/,'#postes-locaux')}">Liste des postes ↓</a></div>
    <div class="cursor-legend">${cursor.size?`<p>Cursor · ${cursor.size} session(s) liée(s) à une PR ouverte ou en brouillon au dernier relevé. Au café, activité inconnue. Cliquez sur un avatar pour ouvrir sa session Cursor.</p>`:''}</div>
    <div class="codex-directory">${codex.length?`<details><summary>Agents Codex · ${codex.length}</summary><p>Sessions de ce dossier observées depuis 24 h. Un signal de travail récent place l’agent au bureau. Après un tour terminé ou sans signal récent, il apparaît au café.</p><ul>${codex.map(a=>`<li id="codex-${e(a.id)}"><strong>${e(a.name)}</strong> · ${e(a.project)} · ${codexState[a.state]}</li>`).join('')}</ul></details>`:''}</div>
    ${historyPanel(data)}<span class="loft-caption" role="status"></span></section>`;
}
