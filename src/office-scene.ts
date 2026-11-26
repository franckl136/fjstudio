import type { Desk, Workspace } from './product-workspace.ts';
import { date,e } from './views.ts';

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
export function officeScene(data:Workspace,stationLink:(d:Desk)=>string,query:URLSearchParams) {
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
  // A replay uses accepted attempts of one completed synthesis, including its own project and mission.
  const records=data.agents.flatMap(d=>d.records.filter(r=>r.engine==='control' && r.state==='completed'));
  const last=records.filter(r=>r.task==='synthesis').sort((a,b)=>Number(b.finished)-Number(a.finished))[0];
  const replay=last?records.filter(r=>r.project_id===last.project_id && r.mission_id===last.mission_id)
    .sort((a,b)=>Number(a.began)-Number(b.began)): [];
  return `<section id="loft" class="loft panel"><header class="section-head"><div><h2>Le loft du Studio</h2>
    <p>Les agents locaux dans l’atelier</p></div><button class="loft-expand" type="button" aria-pressed="false" hidden>⛶ Agrandir</button></header>
    <div class="loft-stage"><div class="loft-floor" aria-label="Atelier parisien · plateau des agents">
    <i class="coffee-steam" aria-hidden="true"></i><div class="loft-people">${people}</div></div></div>
    <div class="loft-presence"><ul class="loft-legend"><li><i></i><b>${rooms.coffee.length}</b> au café</li>
    <li><i></i><b>${rooms.desks.length}</b> au bureau</li><li><i></i><b>${rooms.meeting.length}</b> en synthèse</li></ul>
    <p class="loft-count">${visible.length} sur ${online.length} à l’image. Sélectionnez un personnage pour ouvrir son poste.</p>
    ${pages>1?`<nav aria-label="Groupes du plateau"><a href="${page(group===1?pages:group-1)}" aria-label="Groupe précédent">←</a>
      Groupe ${group} / ${pages} <a href="${page(group===pages?1:group+1)}" aria-label="Groupe suivant">→</a></nav>`:''}</div>
    <div class="loft-history" data-mission="${last && replay.length===3?e(last.mission_id):''}">${last && replay.length===3?`<details><summary>Dernière mission · ${e(last.objective)}</summary>
      <ol>${replay.map(r=>`<li data-look="${outfit(r.project_id,r.role)}" data-member="${e(r.project_id+'/'+r.runner_id+'/'+r.role)}" data-area="${r.task==='synthesis'?'meeting':'desks'}">${e(taskNames[r.task]??r.task)} · ${e(r.runner_id)} · ${date(r.finished)}</li>`).join('')}</ol>
      <a href="/projects/${e(last.project_id)}/control/${e(last.mission_id)}">Lire les trois checkpoints</a></details>
      <button type="button" class="loft-replay" hidden>Rejouer les trois étapes</button>`:''}</div>
    <span class="loft-caption" role="status"></span></section>`;
}
