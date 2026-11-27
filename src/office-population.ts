import type { CursorPull } from './cursor-sessions.ts';
import type { CodexAgent } from './codex-office.ts';
import type { Desk, AssignmentRecord } from './product-workspace.ts';

export type OfficeData={cursorSessions?:readonly CursorPull[];agents:readonly Desk[];projects:readonly {id:string;name:string}[]};
export const rooms=[
  {id:'desks',slug:'bureau',name:'Bureau',purpose:'Postes de préparation'},
  {id:'coffee',slug:'cafe',name:'Café',purpose:'Accueil des agents disponibles'},
  {id:'meeting',slug:'reunion',name:'Salle de réunion',purpose:'Synthèse des résultats'},
  {id:'control',slug:'controle',name:'Salle de contrôle',purpose:'Vérification des critères'},
] as const;
type Room=typeof rooms[number]['id'];
export type Resident={
  key:string;name:string;project:string;provider:'Studio'|'Codex'|'Cursor';status:string;source:string;
  room?:Room;pose?:'idle'|'work'|'screen'|'meeting';stamp?:Date|string|null;
  desk?:Desk; pulls?:CursorPull[]; codex?:CodexAgent;
};
export function deskName(d:Desk) {
  if(d.id.startsWith('scribe-')) return 'Documentaliste';
  if(d.id.startsWith('controle-')) return 'Vérificateur';
  return d.id;
}
const states={available:'Disponible',offline:'Hors ligne',unseen:'Présence inconnue',working:'En mission',verifying:'En vérification'};
export function taskRoom(record:AssignmentRecord):Room{
  if(record.task==='synthesis')return 'meeting';
  return record.role==='verifier'?'control':'desks';
}
function localResident(desk:Desk):Resident{
  const task=desk.records.find(r=>r.live);
  const lost=desk.contactFresh===false;
  const room=desk.state==='available'?'coffee':(!lost && task && ['working','verifying'].includes(desk.state)?taskRoom(task):undefined);
  const poses={coffee:'idle',desks:'work',control:'screen',meeting:'meeting'} as const;
  return {key:desk.projectId+'/'+desk.id+'/'+desk.role,name:deskName(desk),project:desk.projectId,provider:'Studio',
    status:lost && task?'Bail en cours · contact expiré':states[desk.state],room,pose:room?poses[room]:undefined,
    source:task?'Bail de la tentative et dernier contact':desk.lastSeen?'Contact du runner':desk.configured?'Registre des postes':'Historique des tentatives',
    desk,stamp:desk.lastSeen};
}
function codexResident(agent:CodexAgent):Resident{
  const recent=agent.state==='working';
  return {key:'codex/'+agent.id,name:agent.name,provider:'Codex',project:agent.project,codex:agent,
    source:'Journal de session Codex sur ce PC',status:recent?'Signal de travail récent':agent.state==='finished'?'Tour terminé':'Activité inconnue',
    room:recent?'desks':undefined,pose:recent?'work':undefined,stamp:agent.observedAt};
}
export function officePopulation(data:OfficeData,codex:readonly CodexAgent[]){
  const cursor=new Map<string,CursorPull[]>();
  for(const row of data.cursorSessions??[]){
    const key='cursor/'+row.project_id+'/'+row.agent_id;
    const pulls=cursor.get(key);
    if(pulls)pulls.push(row);else cursor.set(key,[row]);
  }
  const residents:Resident[]=[...data.agents.map(localResident),...codex.map(codexResident)];
  let pastCursor=0;
  for(const [key,pulls] of cursor){
    const row=pulls[0];
    const past=pulls.every(r=>r.state==='closed'||r.state==='merged');
    if(past)pastCursor++;
    residents.push({key,provider:'Cursor',project:row.project_id,name:'Cursor · PR #'+row.pr_number,pulls,
      status:past?'Session historique':'Activité inconnue',source:'Liens de session importés avec les pull requests GitHub',
      stamp:new Date(Math.max(...pulls.map(r=>Number(r.observed_at))))});
  }
  const metrics={
    connected:data.agents.filter(d=>d.contactFresh??(d.state==='available')).length,
    busy:data.agents.filter(d=>d.records.some(r=>r.live)).length,
    available:data.agents.filter(d=>d.state==='available').length,
    paused:null,
    offline:data.agents.filter(d=>d.state==='offline'||d.contactFresh===false).length,
    historical:pastCursor+codex.filter(c=>c.state==='finished').length,
    unknown:cursor.size-pastCursor+codex.filter(c=>c.state==='recent').length+data.agents.filter(d=>d.state==='unseen').length,
  };
  return {residents,metrics};
}
