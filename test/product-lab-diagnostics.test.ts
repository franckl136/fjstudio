import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { decodeBrowserReceipt, labFailureReason, renderLab } from '../src/product-lab-render.ts';

test('App Lab · un reçu incomplet ou contenant du texte libre retourne un diagnostic borné',()=>{
  for(const candidate of [null,{screenshot:'sensitive-fixture-text'},{screenshot:'iVBORw0KGgo='},{screenshot:42}]) {
    assert.throws(()=>decodeBrowserReceipt(candidate,'fixture'),error=>{
      const failure=labFailureReason(error);
      assert.equal(failure.code,'receipt');
      assert.doesNotMatch(failure.observed,/sensitive-fixture-text|iVBOR/);
      return true;
    });
  }
  assert.equal(labFailureReason(Error('snapshot')).code,'snapshot');
  assert.deepEqual(labFailureReason(Error('sensitive-fixture-text')),{
    code:'unavailable',observed:'L’exécution n’a pas produit de preuve exploitable.',
  });
});

test('App Lab · le conteneur signale une source vide sans diffuser les sorties du navigateur',async()=>{
  await assert.rejects(renderLab(Buffer.alloc(0),randomUUID()),error=>{
    const failure=labFailureReason(error);
    assert.equal(failure.code,'input');
    assert.match(failure.observed,/taille de la source HTML/);
    return true;
  });
});
