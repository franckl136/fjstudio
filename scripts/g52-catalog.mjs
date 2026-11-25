// Build a portable Quality Lab catalog from the observed receipts, without rerunning the application.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../src/qualification-lab.ts';

const root = fileURLToPath(new URL('../docs/evidence/g52/', import.meta.url));
const candidate = 'd0d8f110c7ebb6b3a0a354dd97ba8574dc3ba86e';
const catalog = { schema: 'fjstudio-qualification-v1', profiles: [], runs: [], artifacts: {} };
const json = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const names = (await readdir(root)).filter(n => n !== 'catalog.json' && /\.(json|png)$/.test(n)).sort();
for (const file of names) {
  catalog.artifacts[file] = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
}
function profile(id, title, source, environment, version, level, checks, runId = id + '-g52') {
  if (!catalog.profiles.some(p => p.id === id)) catalog.profiles.push({ id, title, scenarios: checks.map(check => ({
    id: check.id, title: check.title, fault: check.fault ?? check.title, critical: true,
    minimum: level, prerequisites: environment, steps: [check.step], expected: check.expected,
  })) });
  const fingerprint = createHash('sha256').update('G5.2:' + runId + ':' + version).digest('hex');
  const mission = [fingerprint.slice(0, 8), fingerprint.slice(8, 12), '4' + fingerprint.slice(13, 16),
    '8' + fingerprint.slice(17, 20), fingerprint.slice(20, 32)].join('-');
  catalog.runs.push({ id: runId, profile: id, version, variant: 'Code committé', environment,
    fixture: 'Données synthétiques G5.2', project: 'Courses', mission,
    results: checks.map(c => ({ scenario: c.id, state: c.state, level: c.state === 'not_run' ? 1 : level,
      observed: c.observed, evidence: [{ file: source, step: c.step }] })) });
}
const sql = await json('sql.json');
assert.equal(sql.commit, candidate);
assert.ok(sql.allSourcesMatchCommit && sql.passed === sql.cases.length);
profile('sql', 'Transactions PostgreSQL et deux clients', 'sql.json', 'PostgreSQL isolé et deux magasins sur fichiers', candidate, 4,
  sql.cases.map(c => ({ id: c.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: c.description,
    step: c.id, expected: 'Toutes les assertions SQL et client de cette étape réussissent.',
    state: c.status, observed: JSON.stringify(c.observed) })));
for (const mode of ['preview', 'authenticated']) {
  const file = 'web-' + mode + '.json';
  const web = await json(file);
  assert.equal(web.commit, candidate);
  assert.equal(web.profile, mode);
  profile('web-' + mode, 'Chromium · ' + mode, file, 'Chromium hors réseau, export Expo, profil ' + mode, candidate, 4,
    web.steps.map(s => ({ id: s.step, title: s.step.replaceAll('-', ' '), step: s.step,
      expected: 'Le contrôle du parcours réussit dans sa fenêtre de mesure.',
      state: s.status === 'PASS' ? 'passed' : 'failed',
      observed: s.reason ?? (s.windowSeconds ? s.status + ' en ' + s.windowSeconds + ' secondes' : s.status) })));
}
for (const outcome of ['delayed', 'converged']) {
  const file = 'web-initial-wakeup-' + outcome + '.json';
  const receipt = await json(file);
  assert.equal(receipt.commit, candidate);
  assert.ok(['FAIL','PASS'].includes(receipt.status));
  profile('reveil', 'Réveil automatique pendant une connexion stable', file,
    'Chromium, session synthétique et PostgreSQL 17.12, fenêtre de 15 secondes', candidate, 4, [{
      id: 'envoi', title: 'Synchroniser la coche avec la connexion disponible', step: receipt.scenario,
      expected: 'Les cinq opérations sont en base et le journal est vide.',
      observed: receipt.status + ' · opérations en attente : ' + receipt.journalBeforeNetworkCut.reduce((n, d) => n + d.pending, 0),
      state: receipt.status === 'PASS' ? 'passed' : 'failed',
    }], 'reveil-' + outcome);
}
const reviewed = await json('client-review.json');
assert.equal(reviewed.commit, candidate);
const observations = reviewed.rawEvidence;
const checks = [
  ['page-complete', 'Réponse partielle', 'Conserver les sept articles du serveur', 'shortPage', observations.shortPage.cacheAfter === 7],
  ['liste-accessible', 'Réponse vide ambiguë', 'Conserver le cache tant que la portée de la liste reste ambiguë', 'emptyRlsShape', observations.emptyRlsShape.cacheAfter === 7],
  ['erreur-reseau', 'Erreur réseau', 'Conserver les sept articles connus', 'networkFailure', observations.networkFailure.cacheAfter === 7],
  ['expiration', 'Réveil avant dispatch du timer', 'Verrouiller dès la première lecture après expiration', 'ordinaryExpiration', !observations.ordinaryExpiration.scopeVisibleBeforeTimerDispatch],
  ['expiration-longue', 'Session synthétique de trente jours', 'Verrouiller aussi après un délai supérieur au plafond du timer', 'longExpiration', !observations.longExpiration.scopeVisibleAfterTimerDispatch],
];
profile('revue', 'Limites du client sur fonctions committées', 'client-review.json', reviewed.profile, candidate, 3,
  checks.map(([id, title, expected, step, ok]) => ({ id, title, expected, step,
    state: ok ? 'passed' : 'failed', observed: JSON.stringify(observations[step]) })));
const mobile = await json('mobile-checks.json');
assert.equal(mobile.commit, candidate);
profile('automatisation', 'Suites mobiles', 'mobile-checks.json', 'Windows, Node et Git Bash', candidate, 3,
  [['vitest', mobile.checks.vitest], ['shell', mobile.checks.webShell]].map(([id, result]) => ({
    id, title: id, step: id, expected: 'Tous les tests réussissent.', observed: result.passed + '/' + result.total,
    state: result.total === result.passed ? 'passed' : 'failed' })));
const device = await json('device.json');
profile('telephone', 'Relance sur appareil physique', 'device.json', 'Inventaire du poste Windows', candidate, 5, [{
  id: 'mode-avion', title: 'Cocher en mode avion et relancer après arrêt complet', step: 'Inventaire matériel',
  expected: 'La liste et la coche réapparaissent sur téléphone.', observed: 'Appareils USB candidats : ' + device.pnpCandidates +
    '. Aucun essai terrain dans cette campagne.', state: 'not_run' }]);
validateCatalog(catalog);
const bytes = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--write')) await writeFile(join(root, 'catalog.json'), bytes);
else assert.equal(await readFile(join(root, 'catalog.json'), 'utf8'), bytes, 'Reconstituer le catalogue après revue des pièces.');
console.log(catalog.runs.length + ' passages, ' + names.length + ' pièces.');
