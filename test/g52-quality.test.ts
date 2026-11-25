import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { assess, readCatalog, verifiedArtifact } from '../src/qualification-lab.ts';

const root = fileURLToPath(new URL('../docs/evidence/g52/', import.meta.url));
test('G5.2 · la campagne conserve les échecs mesurés et le statut terrain', async () => {
  const catalog = await readCatalog(root);
  assert.equal(assess(catalog, 'sql-g52').verdict, 'PASS');
  assert.equal(assess(catalog, 'revue-g52').verdict, 'FAIL');
  assert.equal(assess(catalog, 'telephone-g52').verdict, 'NOT QUALIFIED');
  assert.equal(catalog.runs.every(run => run.version === 'd0d8f110c7ebb6b3a0a354dd97ba8574dc3ba86e'), true);
});
test('G5.2 · une copie altérée du reçu SQL est refusée', async () => {
  const catalog = await readCatalog(root);
  const copy = await mkdtemp(join(tmpdir(), 'fjstudio-g52-digest-'));
  try {
    await writeFile(join(copy, 'sql.json'), '{}');
    await assert.rejects(verifiedArtifact(catalog, 'sql.json', copy), /empreinte/);
  } finally {
    await rm(copy, { recursive: true, force: true });
  }
});
