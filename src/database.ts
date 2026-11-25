import type { Pool, PoolClient } from 'pg';
import { DomainError, type Operator, type ProjectId } from './contracts.ts';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  readOnly = false,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Keep the original failure if the connection has already been lost.
    }
    throw error;
  } finally {
    client.release();
  }
}

export function notFound(): DomainError {
  return new DomainError(404, 'not_found', 'Ressource introuvable.');
}

export function assertProject(actor: Operator, projectId: ProjectId): void {
  if (!actor.projectIds.includes(projectId)) throw notFound();
}

export function assertId(id: string): void {
  if (!uuid.test(id)) throw notFound();
}
