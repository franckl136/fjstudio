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

const reasons={
  engine:'Le moteur Docker local ne répond pas.',
  image:'L’image épinglée est absente ou illisible sur le moteur local.',
  start:'Le moteur possède l’image mais n’a pas démarré le conteneur avec les paramètres imposés.',
  deadline:'Le délai du runner isolé a expiré.',
  killed:'Le processus isolé a été interrompu. La cause de cet arrêt forcé est indéterminée.',
  input:'Le pilote a refusé la taille de la source HTML.',
  browser:'Le navigateur isolé a quitté le processus ou fermé son canal de contrôle.',
  protocol:'Le navigateur a refusé une commande du pilote.',
  navigation:'Le chargement du document local n’a pas été confirmé.',
  pids:'Le compteur de la limite de processus du conteneur a enregistré un refus pendant le passage.',
  memory:'Le contrôleur mémoire du conteneur a enregistré un arrêt pour mémoire insuffisante.',
  output:'La capture ou la sortie dépasse le volume maximal autorisé.',
  receipt:'Le reçu du runner est incomplet ou invalide.',
  driver:'Le pilote isolé a échoué avant de produire un reçu exploitable.',
} as const;
type FailureCode=keyof typeof reasons;
class LabFailure extends Error {
  readonly code:FailureCode;
  constructor(code:FailureCode) { super(code);this.code=code; }
}
class CommandExit extends Error {
  readonly status:number|null;
  constructor(status:number|null) { super('runner_exit');this.status=status; }
}
export function labFailureReason(error:unknown) {
  if(error instanceof LabFailure)return {code:error.code,observed:reasons[error.code]};
  if(error instanceof Error && error.message==='snapshot')return {code:'snapshot',observed:'Le profil ou les octets figés ne correspondent pas au passage.'};
  return {code:'unavailable',observed:'L’exécution n’a pas produit de preuve exploitable.'};
}

async function command(args: string[], input?: Buffer, duration = 35000): Promise<Buffer> {
  const child = spawn(docker, ['--host', endpoint, ...args], {
    windowsHide: true, stdio: ['pipe','pipe','pipe'],
    env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, PATH: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') } : { PATH: '/usr/bin:/bin' },
  });
  let length = 0;
  const parts: Buffer[] = [];
  let failure:FailureCode|undefined;
  const timer = setTimeout(() => { failure ??= 'deadline'; child.kill(); }, duration);
  child.stdout.on('data', (b: Buffer) => {
    length += b.length;
    if (length > 740000) { failure ??= 'output'; child.kill(); } else parts.push(b);
  });
  child.stderr.resume(); // Candidate metadata and engine errors never enter project logs.
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', () => reject(new LabFailure('engine')));
      child.once('close', code => {
        if(failure)reject(new LabFailure(failure));
        else if(code!==0)reject(new CommandExit(code));
        else resolve();
      });
    });
    return Buffer.concat(parts);
  } finally { clearTimeout(timer); }
}

async function containerFailure(error:unknown,kind:'browser'|'typescript',pinned:string) {
  if(!(error instanceof CommandExit))return error;
  if(error.status===125) {
    try {await command(['version','--format','{{.Server.Version}}'],undefined,4000);} catch {return new LabFailure('engine');}
    try {await command(['image','inspect','--format','{{.Id}}',pinned],undefined,4000);} catch {return new LabFailure('image');}
    return new LabFailure('start');
  }
  if(error.status===124)return new LabFailure('deadline');
  if(error.status===137||error.status===143||error.status===null)return new LabFailure('killed');
  // The trusted browser driver assigns these codes. The candidate cannot supply the driver or its argv.
  const browserCodes:Readonly<Record<number,FailureCode>>={81:'input',82:'browser',83:'protocol',84:'navigation',85:'output',86:'pids',87:'memory'};
  return new LabFailure((kind==='browser' && browserCodes[error.status])||'driver');
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
  const pinned=kind==='browser'?image:compilerImage;
  try {
    const raw = await command(['run', '--rm', '-i', '--pull=never', '--name', name, '--label', 'fjstudio.product.lab=1',
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--user', '65534:65534', '--init', '--cpus', String(limits.cpu), '--memory', '768m', '--memory-swap', '768m',
      '--pids-limit', String(limits.pids), '--shm-size','32m', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=96m',
      '--ulimit', 'nofile=256:256', '--log-driver','none', '--entrypoint', '/usr/bin/timeout', pinned,
      '--kill-after=2s', '30s', 'node', '-e', driver], payload);
    try{return {value:JSON.parse(raw.toString()),driverSha256:labDigest(normalized)};}
    catch {throw new LabFailure('receipt');}
  } catch(error) {
    throw await containerFailure(error,kind,pinned);
  } finally {
    await command(['rm','--force',name], undefined, 4000).catch(() => {});
  }
}
export async function renderLab(html: Buffer, runId: string): Promise<Rendered> {
  const {value,driverSha256} = await isolatedRun('browser',html,runId);
  return decodeBrowserReceipt(value,driverSha256);
}
export function decodeBrowserReceipt(value:unknown,driverSha256:string):Rendered {
  if(!value||typeof value!=='object'||!('screenshot' in value)||typeof value.screenshot!=='string'||value.screenshot.length>699052)throw new LabFailure('receipt');
  const screenshot = Buffer.from(value.screenshot, 'base64');
  const metrics=value as Partial<Metrics>;
  if (screenshot.length<45 || screenshot.toString('base64')!==value.screenshot ||
      !screenshot.subarray(0,16).equals(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')) ||
      !screenshot.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex')) ||
      screenshot.length > 524288 || screenshot.readUInt32BE(16) !== 960 || screenshot.readUInt32BE(20) !== 600 ||
      typeof metrics.version !== 'string' || !/^HeadlessChrome\/\d+(?:\.\d+){1,4}$/.test(metrics.version) ||
      typeof metrics.hasTitle !== 'boolean' || typeof metrics.language !== 'boolean' ||
      ![metrics.h1, metrics.main, metrics.forbiddenScripts].every(n => typeof n==='number' && Number.isSafeInteger(n) && n >= 0)) throw new LabFailure('receipt');
  const { version, hasTitle, language, h1, main, forbiddenScripts } = metrics as Metrics;
  return { metrics: { version, hasTitle, language, h1, main, forbiddenScripts }, screenshot, driverSha256 };
}
type Diagnostic = { code:number; line:number|null; column:number|null };
export async function checkTypeScript(source: Buffer, runId: string) {
  const {compiler,libraries,digest}=await trustedCompiler();
  const payload=gzipSync(JSON.stringify({compiler,libraries,source:source.toString('utf8')}),{level:1});
  const {value,driverSha256}=await isolatedRun('typescript',payload,runId);
  if (!value || typeof value!=='object' || !['checked','dependencies','directives'].includes(value.reason) || !['passed','failed','not_run'].includes(value.status) || !Number.isSafeInteger(value.count) || value.count < 0 ||
    typeof value.version!=='string' || !/^\d+\.\d+\.\d+$/.test(value.version) || !Array.isArray(value.diagnostics) || value.diagnostics.length>12 ||
    !value.diagnostics.every((d: Diagnostic)=>d && Number.isInteger(d.code) && [d.line,d.column].every(n=>n===null||Number.isInteger(n)))) throw new LabFailure('receipt');
  return {driverSha256,toolchainSha256:digest,version:value.version as string,status:value.status as 'passed'|'failed'|'not_run',
    reason:value.reason as 'checked'|'dependencies'|'directives',count:value.count as number,diagnostics:value.diagnostics as Diagnostic[]};
}
