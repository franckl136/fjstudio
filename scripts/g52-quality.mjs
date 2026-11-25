import { fileURLToPath } from 'node:url';
import { assess, compareRuns, readCatalog } from '../src/qualification-lab.ts';

const root = fileURLToPath(new URL('../docs/evidence/g52/', import.meta.url));
const [action = 'verify', ...ids] = process.argv.slice(2);
const catalog = await readCatalog(root);
if (action === 'verify' && !ids.length) {
  console.table(catalog.runs.map(run => ({
    passage: run.id, source: run.version.slice(0, 12), verdict: assess(catalog, run.id).verdict,
  })));
  console.log(Object.keys(catalog.artifacts).length + ' pièces vérifiées par SHA-256.');
} else if (action === 'show' && ids.length === 1) {
  console.log(JSON.stringify(assess(catalog, ids[0]), null, 2));
} else if (action === 'compare' && ids.length === 2) {
  const comparison = compareRuns(catalog, ids[0], ids[1]);
  const sameSource = assess(catalog, ids[0]).run.version === assess(catalog, ids[1]).run.version;
  console.table(comparison.map(row => sameSource && row.before !== row.after
    ? { ...row, change: 'variation entre passages au même commit' } : row));
} else {
  throw new Error('Utiliser verify, show <passage> ou compare <avant> <après>.');
}
