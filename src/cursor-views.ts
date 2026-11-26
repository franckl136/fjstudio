import type { CursorPull } from './cursor-sessions.ts';
import { date, e } from './views.ts';

const states={draft:'Brouillon',open:'Ouverte',merged:'Fusionnée',closed:'Fermée'};
export function cursorDirectory(rows:CursorPull[],projects:readonly {id:string;name:string}[]) {
  if(!rows.length) return '';
  const pending=rows.filter(r=>r.state==='open'||r.state==='draft');
  const past=rows.filter(r=>r.state==='merged'||r.state==='closed');
  function entries(list:CursorPull[]) {
    return '<ul class="cursor-list">'+list.map(r=>{
      const name=projects.find(p=>p.id===r.project_id)?.name??r.project_id;
      return `<li><div><small>${e(name)} · <span>${states[r.state]}</span></small><strong>${e(r.title)}</strong>
        <code>${e(r.branch)}</code></div><div class="cursor-links"><a href="https://cursor.com/agents/${e(r.agent_id)}" target="_blank" rel="noopener noreferrer">Ouvrir la session ↗</a>
        <a href="https://github.com/${e(r.repository)}/pull/${r.pr_number}" target="_blank" rel="noopener noreferrer">PR #${r.pr_number} ↗</a></div></li>`;
    }).join('')+'</ul>';
  }
  return `<section class="panel cursor-directory" id="cursor"><header class="section-head"><div><h2>Sessions Cursor</h2>
    <p>${new Set(rows.map(r=>r.agent_id)).size} sessions identifiées par leurs liens GitHub. La présence en direct est disponible dans Cursor.</p></div></header>
    <details open><summary>À reprendre · ${pending.length} PR</summary>${pending.length?entries(pending):'<p>Toutes les PR relevées sont closes.</p>'}</details>
    ${past.length?`<details><summary>Historique · ${past.length} PR</summary>${entries(past)}</details>`:''}
    <p class="cursor-source">Dernier relevé GitHub importé le ${date(new Date(Math.max(...rows.map(r=>r.observed_at.getTime()))))}. Les liens s’ouvrent dans un nouvel onglet.</p></section>`;
}
