import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { labDigest } from './product-lab-source.ts';

export const image = 'mcr.microsoft.com/playwright@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d';
export const limits = { cpu: 1, memoryMiB: 768, pids: 100, seconds: 30, storageMiB: 96, width: 960, height: 600 };
type Metrics = { version: string; hasTitle: boolean; h1: number; main: number; language: boolean; forbiddenScripts: number };
export type Rendered = { metrics: Metrics; screenshot: Buffer; driverSha256: string };
const docker = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe') : '/usr/bin/docker';
const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : 'unix:///var/run/docker.sock';

async function command(args: string[], input?: Buffer, duration = 35000): Promise<Buffer> {
  const child = spawn(docker, ['--host', endpoint, ...args], {
    windowsHide: true, stdio: ['pipe','pipe','pipe'],
    env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') } : { PATH: '/usr/bin:/bin' },
  });
  let length = 0;
  const parts: Buffer[] = [];
  let invalid = false;
  const timer = setTimeout(() => { invalid = true; child.kill(); }, duration);
  child.stdout.on('data', (b: Buffer) => {
    length += b.length;
    if (length > 740000) { invalid = true; child.kill(); } else parts.push(b);
  });
  child.stderr.resume(); // Candidate metadata and engine errors never enter project logs.
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => code === 0 && !invalid ? resolve() : reject(Error('browser_unavailable')));
    });
    return Buffer.concat(parts);
  } finally { clearTimeout(timer); }
}

export const compilerImage = 'node@sha256:873f586f3794f52281bd039bf02c048a0be08fde619338f9941bad1eb6b34530';
const compilerLibraries = /^lib\.(?:es5|es20[0-9]{2}(?:\.[a-z.0-9]+)?|decorators(?:\.legacy)?)\.d\.ts$/;
let compilerFiles: Promise<{compiler: string; libraries: Record<string,string>; digest: string}> | undefined;
function trustedCompiler() {
  return compilerFiles ??= (async () => {
    const compilerPath = createRequire(import.meta.url).resolve('typescript');
    const dir = dirname(compilerPath);
    const compiler = await readFile(compilerPath,'utf8');
    const names = (await readdir(dir)).filter(n=>compilerLibraries.test(n)).sort();
    const libraries: Record<string,string> = {};
    for (const name of names) libraries[name] = await readFile(join(dir,name),'utf8');
    return { compiler, libraries, digest:labDigest(JSON.stringify([compiler,libraries])) };
  })().catch(error=>{ compilerFiles=undefined; throw error; });
}

// Both drivers get a bounded payload over stdin. The candidate never controls argv or a host mount.
async function isolatedRun(kind: 'browser'|'typescript', payload: Buffer, runId: string) {
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw Error('invalid_run');
  const script = await readFile(new URL('../scripts/product-lab-'+kind+'.cjs', import.meta.url), 'utf8');
  const name = 'fjstudio-product-preview-' + runId;
  const normalized = script.replaceAll('\r\n', '\n');
  const driver = 'eval(Buffer.from("' + Buffer.from(normalized).toString('base64') + '","base64").toString("utf8"))';
  try {
    const raw = await command(['run', '--rm', '-i', '--pull=never', '--name', name, '--label', 'fjstudio.product.lab=1',
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--user', '65534:65534', '--init', '--cpus', String(limits.cpu), '--memory', '768m', '--memory-swap', '768m',
      '--pids-limit', String(limits.pids), '--shm-size','32m', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=96m',
      '--ulimit', 'nofile=256:256', '--log-driver','none', '--entrypoint', '/usr/bin/timeout', kind==='browser'?image:compilerImage,
      '--kill-after=2s', '30s', 'node', '-e', driver], payload);
    return {value:JSON.parse(raw.toString()),driverSha256:labDigest(normalized)};
  } finally {
    await command(['rm','--force',name], undefined, 4000).catch(() => {});
  }
}
export async function renderLab(html: Buffer, runId: string): Promise<Rendered> {
  const {value,driverSha256} = await isolatedRun('browser',html,runId);
  const screenshot = Buffer.from(value.screenshot, 'base64');
  if (!screenshot.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
      screenshot.length > 524288 || screenshot.readUInt32BE(16) !== 960 || screenshot.readUInt32BE(20) !== 600 ||
      typeof value.version !== 'string' || !/^HeadlessChrome\/\d+(?:\.\d+){1,4}$/.test(value.version) ||
      typeof value.hasTitle !== 'boolean' || typeof value.language !== 'boolean' ||
      ![value.h1, value.main, value.forbiddenScripts].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('browser_receipt');
  const { version, hasTitle, language, h1, main, forbiddenScripts } = value;
  return { metrics: { version, hasTitle, language, h1, main, forbiddenScripts }, screenshot, driverSha256 };
}
type Diagnostic = { code:number; line:number|null; column:number|null };
export async function checkTypeScript(source: Buffer, runId: string) {
  const {compiler,libraries,digest}=await trustedCompiler();
  const payload=gzipSync(JSON.stringify({compiler,libraries,source:source.toString('utf8')}),{level:1});
  const {value,driverSha256}=await isolatedRun('typescript',payload,runId);
  if (!['checked','dependencies','directives'].includes(value.reason) || !['passed','failed','not_run'].includes(value.status) || !Number.isSafeInteger(value.count) || value.count < 0 ||
    typeof value.version!=='string' || !/^\d+\.\d+\.\d+$/.test(value.version) || !Array.isArray(value.diagnostics) || value.diagnostics.length>12 ||
    !value.diagnostics.every((d: Diagnostic)=>Number.isInteger(d.code) && [d.line,d.column].every(n=>n===null||Number.isInteger(n)))) throw Error('compiler_receipt');
  return {driverSha256,toolchainSha256:digest,version:value.version as string,status:value.status as 'passed'|'failed'|'not_run',
    reason:value.reason as 'checked'|'dependencies'|'directives',count:value.count as number,diagnostics:value.diagnostics as Diagnostic[]};
}
