import { requireCapability } from './agents.ts';
import { digestJson, type Assignment, type JsonObject } from './contracts.ts';
import { getFixture, prepare, verify } from './plan.ts';

// A runtime receives the validated assignment and a stop signal. Transport and credentials remain in the runner.
export interface AgentRuntime {
  readonly id: string;
  execute(assignment: Readonly<Assignment>, signal: AbortSignal): JsonObject | Promise<JsonObject>;
}

export const deterministicRuntime: AgentRuntime = {
  id:'deterministic-a1',
  execute(assignment,signal) {
    signal.throwIfAborted();
    const fixture=getFixture(assignment.projectId,assignment.fixtureId);
    if (assignment.role==='preparer') {
      requireCapability(assignment.role,'artifact.prepare');
      if (digestJson(fixture)!==assignment.inputDigest) {
        throw new Error('La source du préparateur ne correspond pas au jeu synthétique autorisé.');
      }
      return prepare(assignment.input,assignment.context);
    }
    requireCapability(assignment.role,'artifact.verify');
    return verify(fixture,assignment.input);
  },
};
