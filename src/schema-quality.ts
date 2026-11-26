import type { Pool } from 'pg';
import type { Operator } from './contracts.ts';
import { sources,snapshot } from './explorer-store.ts';
import { schemaSignals,type SchemaModel } from './explorer-model.ts';
import { date,e,layout } from './views.ts';
import { listWorkspaceProjects } from './product-workspace-projects.ts';

export function auditSchema(model:SchemaModel) {
  const findings:{object:string;category:string;observation:string}[]=[];
  const tables=new Map(model.tables.map(t=>[JSON.stringify([t.schema,t.name]),t]));
  for(const t of model.tables) {
    const object=t.schema+'.'+t.name;
    const note=(category:string,observation:string)=>findings.push({object,category,observation});
    if(t.kind==='table' && !t.constraints.some(c=>c.kind==='primary'))note('Identité','Aucune clé primaire déclarée dans cette version.');
    if(t.rls===true&&!t.policies.length) note('RLS','RLS activée et aucune policy relevée. Examiner les rôles et le contexte d’accès.');
    if(t.policies.length&&t.rls===false)note('RLS','Une policy est déclarée sur une table dont la RLS est désactivée.');
    for(const c of t.constraints) if(c.kind==='foreign'&&c.target) {
      const other=tables.get(JSON.stringify([c.target.schema,c.target.table]));
      if(!other||c.target.columns.some(name=>!other.columns.some(col=>col.name===name)))
        note('Relation',c.name+' · cible partiellement ou entièrement hors du catalogue observé.');
    }
    for(const i of t.indexes)if(i.valid===false)note('Index',i.name+' · index déclaré invalide par PostgreSQL.');
  }
  for(const f of model.functions)if(f.definer)findings.push({object:f.schema+'.'+f.name,category:'Privilèges',observation:'SECURITY DEFINER déclaré. Examiner le propriétaire et les droits d’appel.'});
  return {signals:schemaSignals(model),findings,warnings:model.warnings};
}
export async function schemaQuality(pool:Pool,actor:Operator,project:string,params:URLSearchParams) {
  const catalog=await sources(pool,actor,project);
  const selected=params.get('source');
  const shot=selected?await snapshot(pool,actor,project,selected,params.get('snapshot')??undefined):null;
  const report=shot?auditSchema(shot.structure):null;
  return {catalog,shot:shot?{id:shot.id,source_id:shot.source_id,captured_at:shot.captured_at,digest:shot.digest,reference:shot.reference}:null,report};
}
export async function schemaQualityPage(pool:Pool,actor:Operator,project:string,data:Awaited<ReturnType<typeof schemaQuality>>) {
  const base='/projects/'+e(project);
  const {catalog,shot,report}=data;
  return layout('Contrôles du schéma',`<header class="heading"><h1>Contrôles du schéma</h1><a href="${base}/quality">Quality Lab</a></header>
    <section class="panel"><h2>Sources du projet</h2>${catalog.length?`<ul>${catalog.map(s=>`<li><a href="${base}/quality/schema?source=${e(s.id)}">${e(s.label)}</a> · ${e(s.environment)} · ${e(s.origin)}</li>`).join('')}</ul>`:'<p>Aucune source autorisée pour ce projet.</p>'}<a href="${base}/database">Ouvrir Database Explorer</a></section>
    ${report&&shot?`<section class="panel"><h2>Audit statique de la version</h2><p>Capturée le ${date(shot.captured_at)} · ${e(shot.reference)} · <code class="digest">${e(shot.digest)}</code></p>
    <p>${report.signals.tables} tables · ${report.signals.foreignKeys} relations · ${report.signals.indexes} index · ${report.signals.policies} policies · ${report.signals.triggers} triggers.</p>
    <p>Ces constats portent sur les déclarations disponibles. L’efficacité des contrôles d’accès demande une recette par rôle.</p>
    ${report.warnings.map(w=>`<p>${e(w)}</p>`).join('')}
    ${report.findings.length?`<ul class="quality-results">${report.findings.map(f=>`<li><strong>${e(f.category)} · ${e(f.object)}</strong><span>${e(f.observation)}</span></li>`).join('')}</ul>`:'<p>Aucun point à examiner pour les règles statiques appliquées.</p>'}
    <a href="${base}/database?source=${e(shot.source_id)}&amp;snapshot=${e(shot.id)}&amp;view=security">Consulter cette version et ses policies</a></section>`:''}`,
    await listWorkspaceProjects(pool,actor),project,true,'quality');
}
