import type { PoolClient } from 'pg';
import { digestJson } from '../src/contracts.ts';
import { quarantineProductLab } from '../src/product-lab.ts';

export async function verifyProductEvidence(client: PoolClient) {
  const proofs = await client.query(`SELECT result,sha256 AS digest FROM control_tasks WHERE state='completed'
    UNION ALL SELECT result,result_sha FROM product_lab_runs WHERE state='finished'`);
  for (const proof of proofs.rows) {
    if (digestJson(proof.result) !== proof.digest)
      throw new Error('Empreinte de preuve produit incohérente.');
  }
}

export async function quarantineRestoredProduct(client: PoolClient) {
  await client.query('DELETE FROM studio_sessions');
  await client.query(`UPDATE studio_accounts SET invite_digest=NULL,invite_until=NULL,setup_digest=NULL,setup_until=NULL,
    totp_secret=CASE WHEN enrolled_at IS NULL THEN NULL ELSE totp_secret END,
    last_counter=CASE WHEN enrolled_at IS NULL THEN NULL ELSE
      GREATEST(last_counter, floor(extract(epoch FROM clock_timestamp())/30)::bigint) END`);
  await client.query(`INSERT INTO studio_access_events(actor,action,subject)
    VALUES('restore','sessions_and_invitations_revoked','studio')`);
  await quarantineProductLab(client);
  // The historical G5 worker may only claim queued/running work. Keep evidence and the operator’s review decisions.
  await client.query(`WITH retired AS (
      UPDATE pilot_runs SET status='blocked',verdict='BLOCKED' WHERE status IN ('queued','running') RETURNING id
    ), stopped AS (
      UPDATE pilot_tasks SET state='interrupted',worker_id=NULL,lease_until=NULL,finished_at=clock_timestamp()
      WHERE state IN ('running','waiting') AND run_id IN (SELECT id FROM retired)
    ) INSERT INTO pilot_events(run_id,kind,actor,detail)
      SELECT id,'restored_quarantine','restore','{"reason":"restored"}'::jsonb FROM retired`);
  await client.query('DELETE FROM runner_contacts');
}
