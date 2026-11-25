import type { JsonObject } from './contracts.ts';
import { isObject } from './contracts.ts';
import type { Core } from './core.ts';
import { RUBRIC_VERSION, criteria, expectations } from './plan.ts';


export type CheckState = 'passed' | 'failed' | 'not_run' | 'not_applicable' | 'uncertain';
export const checkLabels: Record<CheckState,string> = {
  passed:'Réussi', failed:'Échoué', not_run:'Non exécuté', not_applicable:'Non applicable', uncertain:'Incertain',
};
export function qualityReview(report?: JsonObject) {
  const checks = Object.entries(criteria).map(([id,label]) => {
    const measured = Array.isArray(report?.checks) ? report.checks.find(c => isObject(c) && c.id === id) : undefined;
    let state: CheckState = 'not_run';
    if (report && report.rubricVersion !== RUBRIC_VERSION) state = 'uncertain';
    else if (measured) state = measured.passed === true ? 'passed' : measured.passed === false ? 'failed' : 'uncertain';
    return {id,label,state,expected:expectations[id as keyof typeof criteria],detail:typeof measured?.detail === 'string' ? measured.detail : ''};
  });
  const outcome: CheckState = checks.some(c=>c.state==='failed') ? 'failed'
    : report?.passed===true && checks.every(c=>c.state==='passed') ? 'passed'
    : report ? 'uncertain' : 'not_run';
  return {rubric:report?.rubricVersion ?? RUBRIC_VERSION,checks,outcome};
}

export function missionQuality(mission: Awaited<ReturnType<Core['getMission']>>) {
  const producer = mission.steps.find(s=>s.role==='preparer')?.checkpoint;
  const verifier = mission.steps.find(s=>s.role==='verifier');
  const evidence = verifier?.checkpoint;
  const review = qualityReview(evidence?.artifact);
  const attempt = verifier?.attempts.find(a=>a.id===evidence?.attemptId);
  return {
    ...review,
    recordedAt: evidence?.recordedAt ?? null,
    runnerId: attempt?.runnerId ?? null,
    evidence: evidence ? {attemptId:evidence.attemptId, sha256:evidence.digest, candidateSha256:producer?.digest ?? null} : null,
  };
}
