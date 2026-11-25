// Each receipt describes a committed checkout. Output paths must be new.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const [mode, source, destination] = process.argv.slice(2);
assert.ok(['mobile', 'studio'].includes(mode) && source && destination,
  'Usage: node scripts/g52-codechecks.mjs <mobile|studio> <checkout> <new-receipt.json>');
const cwd = resolve(source);
const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
function run(binary, args) {
  return execFileSync(binary, args, { cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
if (mode === 'mobile' && process.platform === 'win32') {
  const git = run('where.exe', ['git.exe']).split(/\r?\n/);
  const bin = git.map(path => join(dirname(dirname(path)), 'bin')).find(path => existsSync(join(path, 'bash.exe')));
  assert.ok(bin, 'Git Bash requis pour les garde-fous historiques sur Windows.');
  env.PATH = bin + ';' + process.env.PATH;
}
const git = (...args) => run('git', args);
assert.equal(git('diff', 'HEAD', '--name-only', '--', 'src', 'scripts', 'test', 'apps', 'packages',
  'supabase', 'package.json', 'package-lock.json', 'pnpm-lock.yaml'), '', 'Tester un checkout propre du code.');
const receipt = { schema: 'fjstudio-g52-codechecks-v1', mode, commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'), at: new Date().toISOString(), platform: process.platform,
  node: process.version, checks: {} };
function fixedCommand(line) {
  // Only constants defined below are executed by the Windows command processor.
  if (process.platform === 'win32') return run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', line]);
  const [binary, ...args] = line.split(' ');
  return run(binary, args);
}
function nodeTestCounts(log) {
  const count = name => Number(log.match(new RegExp('(?:^|\\n)(?:ℹ |# )' + name + ' (\\d+)', 'm'))?.[1] ?? NaN);
  const result = { total: count('tests'), passed: count('pass'), failed: count('fail'),
    skipped: count('skipped'), cancelled: count('cancelled') };
  assert.ok(Object.values(result).every(Number.isFinite));
  return result;
}
if (mode === 'mobile') {
  fixedCommand('pnpm lint');
  receipt.checks.lint = 'passed';
  fixedCommand('pnpm typecheck');
  receipt.checks.typecheck = 'passed';
  const test = JSON.parse(run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json']));
  receipt.checks.vitest = { total: test.numTotalTests, passed: test.numPassedTests, failed: test.numFailedTests,
    skipped: test.numPendingTests + (test.numTodoTests ?? 0), files: test.testResults.map(suite => ({
      file: relative(cwd, suite.name).replaceAll('\\', '/'), passed: suite.assertionResults.filter(x => x.status === 'passed').length,
      total: suite.assertionResults.length,
    })) };
  receipt.checks.webShell = nodeTestCounts(run(process.execPath, ['--test', 'apps/homeos/scripts/offline-web.test.mjs']));
} else {
  fixedCommand('npm run typecheck');
  receipt.checks.typecheck = 'passed';
  receipt.checks.studio = nodeTestCounts(fixedCommand('npm test'));
}
receipt.finishedAt = new Date().toISOString();
await writeFile(resolve(destination), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ commit: receipt.commit, checks: Object.keys(receipt.checks) }));
