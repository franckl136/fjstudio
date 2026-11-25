import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPool, validPort } from '../src/config.ts';
import { localPath } from '../scripts/archive.ts';
import { qualityReview } from '../src/quality.ts';
import { getFixture, prepare, verify } from '../src/plan.ts';

test('G3 · un contrôle absent ou une version inconnue interdit un verdict positif',()=>{
  assert.equal(qualityReview().outcome,'not_run');
  const fixture=getFixture('a','nominal'), report=verify(fixture,prepare(fixture));
  assert.equal(qualityReview(report).outcome,'passed');
  const incomplete=qualityReview({...report,checks:[]});
  assert.equal(incomplete.outcome,'uncertain');
  assert(incomplete.checks.every(c=>c.state==='not_run'));
  assert.equal(qualityReview({...report,rubricVersion:'unknown'}).outcome,'uncertain');
});
test('G3 · configuration hors profil et chemin réseau de sauvegarde refusés',()=>{
  assert.throws(()=>validPort('0'),/Port/);
  assert.throws(()=>createPool('postgresql://fjstudio:synthetic@example.invalid:55432/fjstudio_a1'),/locale/);
  assert.throws(()=>localPath('//serveur/partage/archive.dump'),/disque local/);
});
