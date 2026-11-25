import { createHash } from 'node:crypto';

export type ProjectId = 'a' | 'b';
export type Role = 'preparer' | 'verifier';
export type FixtureId = 'nominal' | 'incorrect';
export type JsonObject = Record<string, unknown>;
export type Operator = { id: string; projectIds: readonly ProjectId[] };
export type Runner = { id: string; projectId: ProjectId; role: Role };
export type Credential = { token: string } & (
  | ({ kind: 'operator' } & Operator)
  | ({ kind: 'runner' } & Runner)
);
export type Assignment = {
  attemptId: string;
  generation: number;
  missionId: string;
  projectId: ProjectId;
  role: Role;
  fixtureId: FixtureId;
  leaseUntil: string;
  input: JsonObject;
  inputDigest: string;
  context?: { id: string; projectId: ProjectId; version: number; title: string; content: string }[];
  planVersion: string;
};

export class DomainError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isObject(value)) {
    const fields = Object.keys(value).sort().map(
      key => JSON.stringify(key) + ':' + canonicalJson(value[key])
    );
    return '{' + fields.join(',') + '}';
  }
  throw new TypeError('La valeur ne peut pas être représentée en JSON.');
}

export function digestJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isProjectId(value: unknown): value is ProjectId {
  return value === 'a' || value === 'b';
}

export function isFixtureId(value: unknown): value is FixtureId {
  return value === 'nominal' || value === 'incorrect';
}
