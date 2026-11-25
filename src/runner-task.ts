import { runOnce } from './runner.ts';

const { A1_BASE_URL, A1_RUNNER_TOKEN } = process.env;
if (!A1_BASE_URL || !A1_RUNNER_TOKEN) throw new Error('Profil runner local incomplet.');

try {
  await runOnce({ baseUrl: A1_BASE_URL, token: A1_RUNNER_TOKEN });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Erreur locale.');
  process.exitCode = 1;
}
