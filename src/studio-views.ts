import { documentOptions } from './product-documents.ts';
import { controlAdapters, documentPlan } from './control-room-adapters.ts';
import { capabilityLabels, type visibleAgents } from './agents.ts';
import type { Core } from './core.ts';
import { confidenceLevels, kinds, origins, scopes, statuses, type KnowledgeRow } from './knowledge.ts';
import { date, e, layout, state, eventLabels } from './views.ts';

type Projects = Awaited<ReturnType<Core['listProjects']>>;
type Overview = Awaited<ReturnType<Core['overview']>>;
type Detail = Awaited<ReturnType<Core['knowledge']['detail']>>;

function options(labels: Record<string,string>, selected = '') {
  return Object.entries(labels).map(([key,label])=>`<option value="${e(key)}" ${key === selected ? 'selected' : ''}>${e(label)}</option>`).join('');
}
function missionLink(project: string, id: string, label: string) {
  return `<a href="/projects/${e(project)}/missions/${e(id)}">${e(label)}</a>`;
}
export function commandPage(data: Overview) {
  const {projects,recent,counts,events,contacts,proposals} = data;
  const metrics = ['ready','running','paused','succeeded','failed','cancelled'].map(key=>
    `<div>${state(key)}<strong>${counts.find(c=>c.status===key)?.count ?? 0}</strong></div>`).join('');
  return layout('Command Center',`<div class="heading"><div><h1>Command Center</h1><p>Activité des projets accessibles</p></div>
    <a class="button" href="/">Actualiser</a></div>

    <div class="overview"><section class="panel"><h2>À examiner</h2>
      ${proposals.map(p=>`<p><a href="/projects/${e(p.project_id)}/knowledge?status=proposed">Projet ${e(p.project_id.toUpperCase())} · ${p.count} fiche(s) à valider</a></p>`).join('')}
      ${data.conflicts.map(c=>`<p><a href="/projects/${e(c.project_id)}/knowledge/${e(c.first_id)}">Désaccord à examiner · ${e(c.first_title)}</a></p>`).join('')}
      ${data.failures.map(m=>`<p>${missionLink(m.projectId,m.id,'Projet '+m.projectId.toUpperCase()+' · '+(m.reason==='quality_rejected'?'Contrôle qualité négatif':'Mission en échec'))} · ${date(m.createdAt)}</p>`).join('')}
      ${!proposals.length && !data.failures.length && !data.conflicts.length ? '<p>Aucune proposition ni mission en échec.</p>' : ''}
    </section><section class="panel"><h2>Services locaux</h2><p>Core accessible · Lecture PostgreSQL réussie</p>
      <p>Dernier appel de chaque rôle. Un contact récent date de moins de 20 secondes.</p>
      ${projects.map(p=>['preparer','verifier'].map(role=>{
        const items=contacts.filter(c=>c.project_id===p.id && c.role===role);
        return items.length ? items.map(c=>`<p><strong>${e(c.runner_id)}</strong> · ${c.fresh?'Contact récent':'Contact ancien'} · ${date(c.last_seen)}
          ${c.mission_id ? missionLink(c.project_id,c.mission_id,'Tentative attribuée') : ''}</p>`).join('')
          : `<p>Projet ${e(p.id.toUpperCase())} · ${role==='preparer'?'préparateur':'vérificateur'} · Aucun contact enregistré</p>`;
      }).join('')).join('')}
    </section></div>
    <section class="panel"><h2>Missions par état</h2><div class="metrics">${metrics}</div></section>
    <section class="panel"><h2>Missions récentes et en cours</h2><ul class="mission-list">${recent.map(m=>`<li>${missionLink(m.projectId,m.id,'Projet '+m.projectId.toUpperCase()+' · '+(m.fixtureId==='nominal'?'Cas nominal':'Cas incorrect'))} ${date(m.createdAt)} ${state(m.status)}</li>`).join('')}</ul>
    ${recent.length?'':'<p>Aucune mission enregistrée.</p>'}</section>
    <section class="panel"><h2>Derniers événements</h2><ol class="history">${events.map(ev=>`<li>${date(ev.at)}<span>${missionLink(ev.project_id,ev.mission_id,'Projet '+ev.project_id.toUpperCase()+' · '+(eventLabels[ev.type]??ev.type))}${ev.role?' · '+e(ev.role):''}</span></li>`).join('')}</ol></section>`,projects,'',true);
}

type AgentEntry = ReturnType<typeof visibleAgents>[number] & {
  activity: Awaited<ReturnType<Core['agentActivity']>>[number] | null;
};

export function agentPage(projects: Projects, agents: AgentEntry[]) {
  const sections = projects.map(project => {
    const rows=agents.filter(a=>a.project===project.id).map(a=>{
      const activity = a.activity;
      const availability = !activity?.last_seen ? 'Aucun contact' : activity.fresh ? 'Contact récent' : 'Contact ancien';
      return `<li><header><strong>${e(a.name)}</strong> · ${e(a.id)}</header><p>${e(a.description)}</p>
        <p>${availability}${activity?.last_seen ? ' · '+date(activity.last_seen) : ''}${activity?.mission_id ? ' · '+missionLink(a.project,activity.mission_id,'Mission attribuée') : ''}</p>
        <p>${activity?.attempts ?? 0} tentative(s) · ${activity?.completed ?? 0} remise(s) terminée(s)</p>
        <details><summary>Capacités et runtime</summary><p>${e(a.runtime)} · Contrat ${e(a.version)} · Plafond IA 0 €</p>
        <ul>${a.capabilities.map(key=>`<li>${e(capabilityLabels[key])}</li>`).join('')}</ul></details></li>`;
    }).join('');
    return `<section class="panel"><h2>${e(project.name)}</h2><ul class="agent-list">${rows}</ul></section>`;
  });
  const adapters=documentPlan.map(task=>`<li><strong>${e(task.label)}</strong><span>${e(controlAdapters[task.key].id)} · ${e(task.capability)}</span></li>`).join('');
  return layout('Catalogue des agents',`<div class="heading"><div><h1>Catalogue des agents</h1>
    <p>Rôles autorisés et activité constatée par le Core</p></div><a class="button" href="/agents">Actualiser</a></div>
    <section class="panel"><h2>Adaptateurs du Control Room</h2><ul class="mission-list">${adapters}</ul>
    <p>Ces adaptateurs traitent les documents sur ce poste. Codex, ChatGPT et Cursor requièrent une intégration et une politique de coût avant de pouvoir recevoir une mission.</p></section>
    <div class="overview">${sections.join('')}</div>`,projects,'',true);
}

function contentFields(item?: KnowledgeRow) {
  return `<label>Titre<input name="title" required maxlength="140" value="${e(item?.title??'')}"></label>
    <label>Contenu<textarea name="content" required maxlength="2400" rows="4">${e(item?.content??'')}</textarea></label>
    <label>Confiance déclarée<select name="confidence"><option value="">Non renseignée</option>${options(confidenceLevels,item?.confidence??'')}</select></label>
    <label>Version ou domaine de validité<input name="validity" maxlength="160" value="${e(item?.validity??'')}"></label>
    <details><summary>Affirmation à comparer (facultatif)</summary>
      <label>Sujet commun<input name="claimKey" maxlength="80" value="${e(item?.claim_key??'')}"></label>
      <label>Valeur déclarée<input name="claimValue" maxlength="160" value="${e(item?.claim_value??'')}"></label>
      <p>Deux fiches portant des valeurs différentes sur le même sujet sont signalées pour examen.</p></details>
    <label>Utilisation après validation<select name="scope">${options(scopes,item?.scope??'reference')}</select></label>`;
}
export function knowledgePage(projects: Projects, project: string, items: KnowledgeRow[], filters: URLSearchParams, canOperate = true) {
  const path='/projects/'+e(project)+'/knowledge';
  return layout('Project Intelligence',`<a class="back" href="/projects/${e(project)}">← Projet ${e(project.toUpperCase())}</a>
    <div class="heading"><div><h1>Project Intelligence</h1><p>Connaissances du projet ${e(project.toUpperCase())}</p></div></div>
    <section class="panel"><h2>Rechercher une connaissance</h2><form method="get" action="${path}" class="filters">
    <label>Recherche<input name="q" maxlength="160" value="${e(filters.get('q')??'')}"></label>
    <label>Type<select name="kind"><option value="">Tous</option>${options(kinds,filters.get('kind')??'')}</select></label>
    <label>Statut<select name="status"><option value="">Tous</option>${options(statuses,filters.get('status')??'')}</select></label>
    <label>Origine<select name="origin"><option value="">Toutes</option>${options(origins,filters.get('origin')??'')}</select></label>
    <label>Fiches liées à l’identifiant<input name="relatedTo" maxlength="36" value="${e(filters.get('relatedTo')??'')}"></label>
    <button>Rechercher</button></form>
    ${items.length ? `<ul class="mission-list">${items.map(r=>`<li><a href="${path}/${e(r.id)}"><strong>${e(r.title)}</strong><span>${e(kinds[r.kind])} · v${r.version}</span></a><span class="badge">${e(statuses[r.status])}</span></li>`).join('')}</ul>` : '<p>Aucune fiche pour cette recherche.</p>'}</section>
    ${canOperate ? `<div class="overview"><section class="panel"><h2>Nouvelle proposition</h2><form action="${path}" method="post" class="stack">
    ${contentFields()}<label>Type<select name="kind">${options(kinds)}</select></label>
    <label>Origine déclarée<select name="origin">${options(Object.fromEntries(Object.entries(origins).filter(([key])=>key!=='imported')))}</select></label>
    <label>Source ou auteur d’origine<input name="reference" maxlength="320"></label>
    <label>Identifiant d’une fiche liée (facultatif)<input name="relatedId" maxlength="36"></label><button>Enregistrer la proposition</button></form></section>
    <section class="panel"><h2>Document Markdown du projet</h2><p>Le commit et l’empreinte du document accompagnent la proposition.</p>
    <form action="${path}/import" method="post"><label>Source autorisée<select name="document">${documentOptions(project).map(d=>`<option value="${e(d.id)}">${e(d.entry)}</option>`).join('')}</select></label><button>Importer le document</button></form></section></div>` : ''}`,projects,project,true);
}

export function knowledgeDetail(projects: Projects, detail: Detail, canOperate = true) {
  const {item:r,history,uses,related}=detail;
  const base='/projects/'+e(r.project_id)+'/knowledge';
  const path=base+'/'+e(r.id);
  const actions: Record<string,string> = {validate:'Valider',reject:'Rejeter',obsolete:'Marquer obsolète',revoke:'Révoquer'};
  const allowed = r.status==='proposed' ? ['validate','reject'] : r.status==='validated' ? ['obsolete','revoke'] : r.status==='obsolete'?['revoke']:[];
  const version=`<input type="hidden" name="version" value="${r.version}">`;
  return layout(r.title,`<a class="back" href="${base}">← Connaissances du projet</a>
    <div class="heading"><div><h1>${e(r.title)}</h1><p>${e(kinds[r.kind])} · v${r.version}</p></div><span class="badge">${e(statuses[r.status])}</span></div>
    <section class="panel"><h2>Contenu et provenance</h2><p class="prose">${e(r.content)}</p>
    <p>${e(origins[r.origin])} · Saisie par ${e(r.author)} le ${date(r.created_at)}</p>
    ${r.reference ? `<p class="digest">${e(r.reference)}</p>`:''}<p>${e(scopes[r.scope])}</p>${r.confidence?`<p>Confiance déclarée · ${e(confidenceLevels[r.confidence])}</p>`:''}${r.validity?`<p>Validité · ${e(r.validity)}</p>`:''}
    ${r.related_id ? `<a href="${base}/${e(r.related_id)}">Fiche de référence</a>`:''}
    ${related.map(x=>`<p><a href="${base}/${e(x.id)}">${e(x.title)}</a> cite cette fiche.</p>`).join('')}</section>
    ${r.claim_key ? `<p class="panel">Affirmation · <strong>${e(r.claim_key)}</strong> · ${e(r.claim_value)}</p>` : ''}
    ${detail.conflicts.length ? `<section class="panel review-warning"><h2>Désaccords à examiner</h2>
    ${detail.conflicts.map(c=>{
      const first=c.first_id===r.id;
      return `<p>${c.reason==='assertion'?'Valeurs déclarées différentes':'Versions documentaires divergentes'} ·
        <a href="${base}/${e(first?c.second_id:c.first_id)}">${e(first?c.second_title:c.first_title)} · v${first?c.second_version:c.first_version}</a></p>`;
    }).join('')}</section>` : ''}
    ${canOperate && allowed.length ? `<section class="panel"><h2>Décision opérateur</h2><form class="stack" method="post" action="${path}">${version}
    <label><input type="checkbox" required name="confirm" value="yes"> Confirmer la décision sur la version ${r.version}</label><div class="actions">
    ${allowed.map(a=>`<button name="action" value="${a}">${e(actions[a])}</button>`).join('')}</div></form></section>`:''}
    ${canOperate && r.status!=='revoked'?`<details class="panel"><summary>Proposer une modification</summary><form class="stack" method="post" action="${path}">${version}
    ${contentFields(r)}<button name="action" value="edit">Soumettre à validation</button></form></details>`:''}
    <section class="panel"><h2>Missions ayant utilisé cette fiche</h2>${uses.map(u=>`<p>${missionLink(r.project_id,u.mission_id,u.mission_id)} · v${u.version}</p>`).join('')||'<p>Aucune utilisation enregistrée.</p>'}</section>
    <section class="panel"><h2>Historique des versions</h2>${history.map(h=>`<details id="v${h.version}"><summary>v${h.version} · ${e(statuses[h.status])} · ${e(h.actor)} · ${date(h.at)}</summary>
    <strong>${e(h.title)}</strong><p class="prose">${e(h.content)}</p><p>${e(scopes[h.scope])}${h.confidence?' · '+e(confidenceLevels[h.confidence]):''} ${e(h.validity)}</p>${h.claim_key?`<p>${e(h.claim_key)} · ${e(h.claim_value)}</p>`:''}</details>`).join('')}</section>`,projects,r.project_id,true);
}
