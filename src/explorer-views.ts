import type { CodeScan } from './explorer-code.ts';
import type { connectionChoices } from './explorer-connections.ts';
import { e,date } from './views.ts';
import { cardinality,differences,schemaSignals,type SchemaModel,type Table } from './explorer-model.ts';
import type { Snapshot,Source,Version } from './explorer-store.ts';
export const origins:Record<string,string>={maintenance:'Introspection PostgreSQL par la maintenance',postgresql:'Introspection PostgreSQL locale',sql:'Import SQL',migration:'Import de migration SQL',prisma:'Import Prisma'};
export const envs:Record<string,string>={studio:'Studio interne',local:'Locale',development:'Développement',test:'Test',staging:'Préproduction',production:'Production · import hors ligne'};
const td=(s:unknown)=>'<td>'+e(s)+'</td>';
const field=(s:string,value:unknown)=>'<dt>'+e(s)+'</dt><dd>'+e(value)+'</dd>';
function grid(titles:string[],rows:unknown[][]) {
  return rows.length?'<div class="table-wrap"><table><thead><tr>'+titles.map(s=>'<th scope="col">'+e(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(td).join('')+'</tr>').join('')+'</tbody></table></div>':'<p>Aucun élément relevé.</p>';
}
export function configure(base:string,options:ReturnType<typeof connectionChoices>) {
  return `<section class="panel"><details><summary>Importer un schéma de projet</summary>
    <p>Le Studio analyse le texte localement et conserve une photographie de sa structure. Pour compléter une source SQL, choisissez « Migration » et reprenez son nom et son environnement.</p>
    <form id="schema-import" method="post" action="${base}/import"><label>Nom de la source<input name="label" maxlength="100" required></label>
    <label>Environnement<select name="environment">${Object.entries(envs).filter(([k])=>k!=='studio').map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')}</select></label>
    <label>Format<select name="origin"><option value="sql">Schéma SQL complet</option><option value="migration">Migration SQL</option><option value="prisma">Modèle Prisma PostgreSQL</option></select></label>
    <label>Commit ou nom de fichier (facultatif)<input name="reference" maxlength="115"></label>
    <label><input type="checkbox" name="demonstration" value="yes"> Cette nouvelle source sert de démonstration</label>
    <label>Définition du schéma<textarea name="document" rows="8" required spellcheck="false"></textarea></label><button>Importer la structure</button></form></details>
    ${options.map(o=>`<form method="post" action="${base}/capture"><input type="hidden" name="environment" value="${e(o.environment)}"><input type="hidden" name="label" value="${e(o.label)}"><p><strong>Source configurée</strong> · ${e(o.label)} · ${e(envs[o.environment])}. ${o.attempt?(o.attempt.ok?'Connexion confirmée':'Source inaccessible')+' lors de la tentative du '+date(o.attempt.at)+'.':'Aucune tentative observée depuis le démarrage du Studio.'}</p><button>Introspecter ${e(o.label)} · ${e(envs[o.environment])}</button></form>`).join('')}</section>`;
}
export function provenance(s:Source){
  if(s.from_code)return 'Métadonnées extraites du code · '+(s.origin==='prisma'?'Prisma':'SQL');
  if(s.origin==='postgresql'||s.origin==='maintenance')return 'Connexion confirmée au moment de la capture · '+origins[s.origin];
  return (s.demonstration?'Source de démonstration · ':'')+'Schéma importé · '+(origins[s.origin]??s.origin);
}
export function overview(base:string,list:Source[],scan?:CodeScan,canImport=false) {
  const internal=base==='/database';
  let message='';
  if(!internal && scan?.state==='detected'){
    message=scan.status+'. Aucun schéma SQL ou Prisma exploitable dans les fichiers locaux observés. '+
      (scan.status.includes('Notion')?'L’accès au compte Notion n’a pas été vérifié.':'La déclaration dans le dépôt ne confirme pas la connexion au service.');
  }else if(!internal && scan?.state==='unavailable'){
    message='Source indisponible. Vérifiez que le dossier relié est accessible sur ce PC, puis actualisez depuis le code.';
  }else if(!internal && scan?.state==='unreadable'){
    message='Fichier illisible. Vérifiez le format et les permissions des définitions SQL, Prisma et du manifeste, puis actualisez depuis le code.';
  }else if(!list.length){
    if(internal)message='Aucune photographie de la base interne du Studio. La maintenance peut en effectuer une capture.';
    else if(scan?.state==='empty')message='La lecture du dépôt n’a fourni aucune structure SQL ou Prisma consultable.';
    else if(scan?.state==='unlinked')message='Ce projet ne dispose pas de dossier local relié.';
    else message='Aucune photographie de structure disponible pour ce projet.';
  }
  const notice=message?'<section class="panel"><h2>Disponibilité du schéma</h2><p>'+e(message)+'</p>'+
    (!internal && canImport?'<p>Si vous disposez d’une définition PostgreSQL ou Prisma PostgreSQL, vous pouvez <a href="#schema-import">importer un schéma de ce projet</a>.</p>':'')+'</section>':'';
  return notice+(list.length?'<section class="panel"><h2>'+(internal?'Catalogue interne du Studio':'Sources du projet')+'</h2><ul class="work-feed">'+list.map(s=>`<li><a href="${base}?source=${s.id}">${e(s.label)}</a><small>${e(envs[s.environment])} · ${e(provenance(s))}${s.synthetic_project?' · Projet de démonstration synthétique':''}</small></li>`).join('')+'</ul></section>':'');
}
export function renderSnapshot(base:string,s:Source,h:Snapshot,history:Version[],params:URLSearchParams,prior?:Snapshot) {
  const m=h.structure,signal=schemaSignals(m);
  const query=(extra:Record<string,string>)=>base+'?'+e(new URLSearchParams({source:s.id,snapshot:h.id,...extra}).toString());
  const hidden='<input type="hidden" name="source" value="'+s.id+'"><input type="hidden" name="snapshot" value="'+h.id+'">';
  const nav=`<section class="panel"><h2>${e(s.label)}</h2><p>${e(envs[s.environment])} · ${e(provenance(s))}${s.synthetic_project?' · Projet de démonstration synthétique':''} · ${e(m.engine)} ${e(m.version)} · ${date(h.captured_at)}</p>
    <p>${m.schemas.length} schéma(s) · ${signal.tables} table(s) · ${signal.views} vue(s) · ${signal.foreignKeys} clés étrangères · ${signal.indexes} index · ${signal.triggers} triggers · ${m.functions.length} fonctions</p>
    ${h.reference?'<p>'+(s.from_code?'Empreinte SHA-256 des fichiers locaux':'Référence')+' · '+e(h.reference)+'</p>':''}
    <nav class="actions" aria-label="Vues du schéma"><a class="button" href="${query({})}">Tables et vues</a><a class="button" href="${query({view:'erd'})}">Diagramme relationnel</a>
    <a class="button" href="${query({view:'security'})}">Sécurité et RLS</a><a class="button" href="${query({view:'history'})}">Historique</a></nav>
    ${m.warnings.length?'<details><summary>Limites de cette photographie ('+m.warnings.length+')</summary><ul>'+m.warnings.map(w=>'<li>'+e(w)+'</li>').join('')+'</ul></details>':''}</section>`;
  const refs=m.tables.flatMap((t,i)=>t.constraints.filter(c=>c.kind==='foreign').map(c=>({from:i,to:m.tables.findIndex(r=>r.schema===c.target?.schema&&r.name===c.target?.table),columns:c.columns.join(', '),target:c.target?.columns.join(', ')??'',count:cardinality(t,c)})));
  const tableLink=(i:number)=>query({table:String(i)});
  const ti=params.get('table');
  if(ti!==null&&/^\d+$/.test(ti)&&m.tables[Number(ti)]) {
    const i=Number(ti),t=m.tables[i];
    const sensitivity=(col:string)=>/(?:password|secret|token|credential|private|cipher|email|phone|otp|passphrase)/i.test(col)?'Nom possiblement sensible':'';
    return nav+`<section class="panel"><h2>${e(t.schema)}.${e(t.name)}</h2><p>${e(t.kind)} · ${t.comment?'Commentaire présent dans PostgreSQL. Son texte reste dans la source.':'Description non recueillie.'}</p>
      <a href="${query({view:'erd',focus:String(i)})}">Ouvrir le voisinage relationnel</a>
      <h3>Colonnes</h3>${grid(['Nom','Type','Nullable','Défaut','Génération','Observation'],t.columns.map(c=>[c.name,c.type,c.nullable?'oui':'non',c.default,c.generation,sensitivity(c.name)]))}
      <h3>Contraintes et relations sortantes</h3>${grid(['Nom','Type','Colonnes','Cible','ON DELETE','ON UPDATE','Condition'],t.constraints.map(c=>[c.name,c.kind,c.columns.join(', '),c.target?c.target.schema+'.'+c.target.table+'('+c.target.columns.join(', ')+')':'',c.onDelete,c.onUpdate,c.expression]))}
      <h3>Relations entrantes</h3>${refs.filter(r=>r.to===i).map(r=>'<p><a href="'+tableLink(r.from)+'">'+e(m.tables[r.from].schema+'.'+m.tables[r.from].name)+'</a> · '+e(r.columns)+' → '+e(r.target)+' · '+r.count+'</p>').join('')||'<p>Aucune référence entrante relevée.</p>'}
      <h3>Index</h3>${grid(['Nom','Méthode','Colonnes ou expressions','Unique','Valide','Prédicat'],t.indexes.map(x=>[x.name,x.method,x.columns.join(', '),x.unique?'oui':'non',x.valid===null?'inconnu':x.valid?'oui':'non',x.predicate]))}
      <h3>Permissions et comportements</h3><dl class="facts">${field('RLS',rls(t))}${field('Privilèges relevés',t.privileges.join(', ')||'non fournis')}${field('Dépendances de vue',t.depends.join(', ')||'aucune relevée')}</dl>
      ${policies(t)}${grid(['Trigger','Fonction','État'],t.triggers.map(x=>[x.name,x.routine,x.state]))}</section>`;
  }
  if(params.get('view')==='erd') {
    const nodes=m.tables.map((t,i)=>({i,name:t.name,schema:t.schema,url:base+'?'+new URLSearchParams({source:s.id,snapshot:h.id,table:String(i)}),
      keys:t.constraints.filter(c=>c.kind==='primary'||c.kind==='foreign').map(c=>(c.kind==='primary'?'PK ':'FK ')+c.columns.join(', '))}));
    return nav+`<section class="panel" data-schema-graph="${e(JSON.stringify({nodes,edges:refs.filter(r=>r.to>=0)}))}"><h2>Diagramme relationnel</h2>
      <form class="actions" data-graph-tools><label>Rechercher une table<input type="search" name="search" maxlength="100"></label>
      <label>Focus<select name="focus"><option value="">Vue complète</option>${nodes.map(n=>'<option value="'+n.i+'" '+(params.get('focus')===String(n.i)?'selected':'')+'>'+e(n.schema+'.'+n.name)+'</option>').join('')}</select></label>
      <label>Relations<select name="direction"><option value="both">Voisines</option><option value="in">Entrantes</option><option value="out">Sortantes</option></select></label>
      <button type="button" data-zoom="in" aria-label="Agrandir le diagramme">+</button><button type="button" data-zoom="out" aria-label="Réduire le diagramme">−</button><button type="button" data-fit>Recentrer</button><button type="button" data-export>Exporter la vue PNG</button></form>
      <p>Déplacez une table ou le fond. Double-cliquez sur une table pour lire sa fiche. Le lien porte la multiplicité du côté référençant.</p>
      <canvas class="dbx-canvas" width="1000" height="560" aria-label="Diagramme des contraintes déclarées"></canvas>
      <details><summary>Choisir un sous-ensemble de tables</summary><div class="dbx-picks">${nodes.map(n=>'<label><input type="checkbox" value="'+n.i+'">'+e(n.schema+'.'+n.name)+'</label>').join('')}</div></details>
      <details><summary>Liste accessible des relations · ${refs.length}</summary>${grid(['Source','Colonnes','Cible','Colonnes','Multiplicité'],refs.map(r=>[nodes[r.from].schema+'.'+nodes[r.from].name,r.columns,r.to>=0?nodes[r.to].schema+'.'+nodes[r.to].name:'hors photographie',r.target,r.count]))}</details>
      <script src="/database-assets/erd.js" defer></script></section>`;
  }
  if(params.get('view')==='security') return nav+`<section class="panel"><h2>Sécurité et RLS</h2><p>Le catalogue décrit la configuration déclarée. Son effet dépend aussi des rôles, des privilèges et des accès applicatifs.</p>
    ${grid(['Table','État RLS','Policies'],m.tables.filter(t=>t.kind==='table').map(t=>[t.schema+'.'+t.name,rls(t),t.policies.length]))}
    ${m.tables.filter(t=>t.policies.length).map(t=>'<h3>'+e(t.schema+'.'+t.name)+'</h3>'+policies(t)).join('')}
    <h3>Fonctions</h3>${grid(['Schéma','Nom','Arguments','Sécurité'],m.functions.map(f=>[f.schema,f.name,f.arguments,f.definer?'SECURITY DEFINER':'SECURITY INVOKER']))}
    <p>Les littéraux des expressions sont masqués. Pour qualifier une policy, examinez les rôles effectifs dans l’environnement concerné.</p></section>`;
  if(params.get('view')==='history') return nav+`<section class="panel"><h2>Historique des structures</h2><ul>${history.map(v=>'<li><a href="'+base+'?source='+s.id+'&amp;snapshot='+v.id+'">'+date(v.captured_at)+'</a> · '+e(v.reference||v.actor)+'</li>').join('')}</ul>
    ${history.length>1?`<form action="${base}">${hidden}<input type="hidden" name="view" value="history"><label>Comparer cette photographie avec<select name="from">${history.filter(v=>v.id!==h.id).map(v=>'<option value="'+v.id+'">'+e(v.captured_at.toISOString()+' '+v.reference)+'</option>').join('')}</select></label><button>Comparer</button></form>`:''}
    ${prior?grid(['Objet','Différence','Ancienne photographie','Photographie sélectionnée'],differences(prior.structure,m).map(d=>[d.path.join(' / '),d.change,d.before?.slice(0,350),d.after?.slice(0,350)])):''}
    <details><summary>Migrations connues · ${m.migrations.length}</summary><ul>${m.migrations.map(v=>'<li>'+e(v)+'</li>').join('')}</ul></details></section>`;
  const q=(params.get('q')??'').toLowerCase().slice(0,120),schema=params.get('schema')??'',kind=params.get('kind')??'';
  const matches=m.tables.map((t,i)=>({t,i})).filter(({t})=>(!schema||schema===t.schema)&&(!kind||kind===t.kind)&&(t.schema+'.'+t.name).toLowerCase().includes(q));
  return nav+`<section class="panel"><h2>Tables et vues</h2><form class="actions" action="${base}">${hidden}<label>Rechercher un objet<input name="q" value="${e(q)}"></label><label>Schéma<select name="schema"><option value="">Tous</option>${m.schemas.map(v=>'<option '+(v===schema?'selected':'')+'>'+e(v)+'</option>').join('')}</select></label>
    <label>Type<select name="kind"><option value="">Tous</option>${[...new Set(m.tables.map(t=>t.kind))].map(v=>'<option '+(v===kind?'selected':'')+'>'+e(v)+'</option>').join('')}</select></label><button>Filtrer</button></form>
    ${matches.length?'<ul class="work-feed">'+matches.map(({t,i})=>'<li><a href="'+tableLink(i)+'">'+e(t.schema+'.'+t.name)+'</a><small>'+e(t.kind)+' · '+t.columns.length+' colonnes · '+rls(t)+'</small></li>').join('')+'</ul>':'<p>Aucun objet ne correspond à ce filtre.</p>'}</section>`;
}
function rls(t:Table) {return t.rls===null?'RLS inconnue':t.forced?'RLS forcée':t.rls?'RLS activée':'RLS désactivée';}
function policies(t:Table) {return grid(['Policy','Commande','Rôles','Mode','USING','WITH CHECK'],t.policies.map(p=>[p.name,p.command,p.roles.join(', '),p.permissive?'permissif':'restrictif',p.using,p.check]));}
