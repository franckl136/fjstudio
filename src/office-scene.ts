import type { CodexAgent } from './codex-office.ts';
import type { Desk, AssignmentRecord } from './product-workspace.ts';
import { officePopulation, rooms, taskRoom, type OfficeData, type Resident } from './office-population.ts';
import { date,e } from './views.ts';
export { deskName } from './office-population.ts';
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


const profileId=(r:Resident)=>'profil-'+encodeURIComponent(r.key).replaceAll('%','_');
const labelOf=(r:Resident)=>r.provider==='Codex'?'Codex · '+r.name:r.name;
const stages:Record<string,string>={running:'En cours',active:'En cours',completed:'Terminée',succeeded:'Réussie',failed:'Échec',expired:'Bail expiré',cancelled:'Annulée',interrupted:'Interrompue'};
const pullStates={draft:'Brouillon',open:'Ouverte',closed:'Fermée',merged:'Fusionnée'};
function missionPath(record:AssignmentRecord){
  return '/projects/'+encodeURIComponent(record.project_id)+(record.engine==='control'?'/control/':'/missions/')+encodeURIComponent(record.mission_id);
}
function avatar(r:Resident,seat:number,stationLink:(d:Desk)=>string,project:string) {
  const id=profileId(r),title=labelOf(r)+' · '+project+' · '+r.status;
  const recent=r.desk?.records.filter(t=>t.finished).map(t=>({id:t.id,area:taskRoom(t),at:Number(t.finished)}))??[];
  const fallback=r.desk?stationLink(r.desk):'#'+id;
  return `<a class="pixel-person loft-person" data-member="${e(r.key)}" data-area="${r.room}" data-pose="${r.pose}"
    id="visuel-${id}" data-profile-link="${id}" data-seat="${seat}" data-live="${e(r.desk?.records.find(t=>t.live)?.id??'')}" data-recent="${e(JSON.stringify(recent))}" title="${e(title)}" aria-label="Ouvrir la fiche · ${e(title)}" href="${e(fallback)}"><span class="pixel-label">${e(labelOf(r))}<small class="fallback-room"> · ${e(r.status)}</small></span></a>`;
}
function profile(r:Resident,project:string,stationLink:(d:Desk)=>string){
  const id=profileId(r),projectPath='/projects/'+encodeURIComponent(r.project),desk=r.desk;
  const records=desk?.records??[],room=rooms.find(room=>room.id===r.room);
  const mission=records.find(t=>t.live);
  return `<details data-profile="${id}" id="${id}" data-provider="${r.provider}" data-location="${r.room??'away'}">
    <summary><strong>${e(labelOf(r))}</strong> · ${e(project)} · ${e(r.status)}</summary>
    <div class="loft-profile-body"><dl class="facts">
    <dt>Identité</dt><dd>${desk?'Runner · '+e(desk.id):'Session '+r.provider+' · '+e(r.codex?.id??r.pulls?.[0].agent_id)}</dd>
    <dt>Source</dt><dd>${e(r.source)}</dd>
    <dt>Projet</dt><dd><a href="${e(projectPath)}">${e(project)}</a></dd>
    <dt>Emplacement</dt><dd>${room?e(room.name):'Hors scène'}</dd>
    ${r.stamp?`<dt>${r.pulls?'Relevé GitHub':r.codex?'Dernier signal':'Dernier contact'}</dt><dd>${date(r.stamp)}</dd>`:''}
    ${mission?`<dt>Mission en cours</dt><dd><a href="${e(missionPath(mission))}">${e(mission.objective??mission.mission_id)}</a></dd>`:''}</dl>
    ${records.length?`<h4>Affectations observées</h4><ul>${records.map(t=>`<li><a href="${e(missionPath(t))}">${e(t.objective??t.mission_id)}</a> · ${e(taskNames[t.task]??t.task)} · ${e(stages[t.state]??t.state)} · ${date(t.finished??t.began)}</li>`).join('')}</ul>`:''}
    ${r.pulls?`<ul>${r.pulls.map(p=>`<li><a href="https://github.com/${e(p.repository)}/pull/${p.pr_number}" rel="noopener noreferrer" target="_blank">PR #${p.pr_number} · ${e(p.title)}</a> · ${pullStates[p.state]}</li>`).join('')}</ul><a href="https://cursor.com/agents/${e(r.pulls[0].agent_id)}" rel="noopener noreferrer" target="_blank">Ouvrir la session Cursor ↗</a>`:''}
    <div class="actions">${desk?`<a href="${e(stationLink(desk))}">Ouvrir le poste</a>`:''}
    <a href="/activity?project=${encodeURIComponent(r.project)}">Journal du projet</a>
    ${mission?`<a href="${e(missionPath(mission))}">Mission et preuves</a><a href="/workspace?project=${encodeURIComponent(r.project)}">Command Center</a>`:''}
    ${room?`<a data-return-agent="${id}" href="#visuel-${id}">Retrouver le personnage</a>`:''}</div></div></details>`;
}
const metricNames={
  connected:'Connectés au Studio',busy:'En mission Studio',available:'Disponibles',paused:'En pause',
  offline:'Hors ligne',historical:'Sessions historiques',unknown:'État inconnu',
};
export function officeScene(data:OfficeData,stationLink:(d:Desk)=>string,query:URLSearchParams,codex:CodexAgent[]=[]) {
  const focus=rooms.find(r=>r.slug===query.get('salle'))?.id??'plan';
  const {residents,metrics}=officePopulation(data,codex);
  const projects=new Map(data.projects.map(p=>[p.id,p.name]));
  const groups=rooms.map(room=>({...room,members:residents.filter(r=>r.room===room.id)}));
  const roomLink=(slug:string|null)=>loftUrl(query,{salle:slug});
  const selected=groups.find(room=>room.id===focus);
  const total=groups.reduce((count,room)=>count+room.members.length,0);
  return `<section id="loft" class="loft panel pixel-loft" data-focus="${focus}">
    <link rel="stylesheet" href="/office-assets/pixel-office.css"><script src="/office-assets/pixel-office.js" defer></script>
    <header class="section-head"><div><h2>Le loft du Studio</h2><p>Cliquez sur un personnage pour consulter sa fiche et ses affectations.</p></div>
    <button class="loft-expand" type="button" aria-pressed="false" hidden>⛶ Agrandir</button></header>
    <div class="loft-toolbar" aria-label="Mode de représentation"><button type="button" hidden data-mode="real" aria-pressed="true">Activité réelle</button><button type="button" hidden data-mode="ambient" aria-pressed="false">Ambiance simulée</button><span>Figurants · <strong data-ambient-count>0</strong></span></div>
    <dl class="loft-metrics">${Object.entries(metricNames).map(([key,name])=>`<div><dt>${name}</dt><dd data-metric="${key}">${metrics[key as keyof typeof metrics]??'Non renseigné'}</dd></div>`).join('')}</dl>
    <nav class="room-tabs" aria-label="Pièces du loft"><a data-camera="plan" href="${roomLink(null)}"${focus==='plan'?' aria-current="page"':''}>Plan complet</a>
    ${groups.map(room=>`<a data-camera="${room.id}" data-name="${e(room.name)}" data-purpose="${e(room.purpose)}" href="${roomLink(room.slug)}"${focus===room.id?' aria-current="page"':''}>${room.name} <span data-count="${room.id}">${room.members.length}</span></a>`).join('')}</nav>
    <div class="pixel-campus"><div class="pixel-floor"><canvas width="1520" height="824" data-floor-art aria-hidden="true"></canvas>
      <div class="loft-people">${groups.flatMap(room=>room.members.map((r,i)=>avatar(r,i,stationLink,projects.get(r.project)??r.project))).join('')}</div>
    </div></div>
    <div class="loft-presence"><div data-room-caption>${selected?`<strong>${selected.name}</strong> · ${selected.purpose}`:`<strong>${total} dans le loft</strong>`}</div>
      <a href="#annuaire-loft" data-show-directory>Liste des agents</a>
      <a href="${loftUrl(query,{liste:'1'}).replace(/#loft$/,'#postes-locaux')}">Liste des postes ↓</a></div>
    <div class="loft-occupants">${groups.map(room=>`<div data-room-occupants="${room.id}"${room.id!==focus?' hidden':''}><strong>${e(room.name)} · occupants</strong>
    ${room.members.length?`<ul>${room.members.map(r=>`<li><a data-profile-link="${profileId(r)}" href="#${profileId(r)}">${e(labelOf(r))}</a> · ${e(r.status)}</li>`).join('')}</ul>`:'<p>Aucune présence observée.</p>'}</div>`).join('')}</div>
    <details id="annuaire-loft" class="loft-directory"><summary>Agents et sessions · <span data-directory-total>${residents.length}</span></summary>
    <label hidden data-provider-control>Outil <select data-provider-filter><option value="">Tous les outils</option><option>Studio</option><option>Codex</option><option>Cursor</option></select></label>
    <div class="loft-profiles">${residents.map(r=>profile(r,projects.get(r.project)??r.project,stationLink)).join('')}</div><p data-empty-directory ${residents.length?'hidden':''}>Aucune fiche dans cette sélection.</p></details>
    ${historyPanel(data)}<span class="loft-caption" role="status"></span></section>`;
}
