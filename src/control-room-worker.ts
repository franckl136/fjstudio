import { isObject, type JsonObject } from './contracts.ts';
import { assertDirectHttp } from './runner.ts';
import { executeControl, type ControlAssignment } from './control-room-adapters.ts';

export async function runControlOnce(base: string, token: string, signal?: AbortSignal) {
  const url = URL.parse(base);
  if (
    !url ||
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.hash ||
    url.search
  )
    throw new Error('Origine locale requise.');
  assertDirectHttp();
  async function post(action: string, body: JsonObject) {
    const timeout = AbortSignal.timeout(5000);
    const response = await fetch(url!.origin + '/api/runner/control/' + action, {
      method: 'POST',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('Core HTTP ' + response.status);
    return response.json() as Promise<JsonObject>;
  }
  const { assignment } = await post('claim', {});
  if (assignment === null) return false;
  if (
    !isObject(assignment) ||
    !isObject(assignment.input) ||
    typeof assignment.attemptId !== 'string' ||
    typeof assignment.generation !== 'number' ||
    typeof assignment.leaseUntil !== 'string' ||
    !(Date.parse(assignment.leaseUntil) > Date.now())
  )
    throw new Error('Attribution invalide ou expirée.');
  const ticket = { attemptId: assignment.attemptId, generation: assignment.generation };
  await post('heartbeat', ticket);
  const result = executeControl(assignment as unknown as ControlAssignment);
  signal?.throwIfAborted();
  await post('complete', { ...ticket, result });
  return true;
}
