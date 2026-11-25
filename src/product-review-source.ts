import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DomainError } from './contracts.ts';

const exec = promisify(execFile);
const root = resolve(fileURLToPath(new URL('../',import.meta.url)));
export const reviewBranch = 'feat/studio-product-foundation';
const sha1 = /^[a-f0-9]{40}$/;
const denied = () => new DomainError(409,'git_review_source','La source locale, la branche ou les limites de lecture ne permettent pas cette revue.');
export function checkReviewBranch(name: string) { if (name !== reviewBranch) throw denied(); }
export type Change = {path:string; change:string; visibility:'metadata'|'sensitive'|'preview'; excerpt?:string; shortened?:boolean};
const ordinary = /^(?:(?:src|test|scripts|docs|fixtures)\/(?:[A-Za-z0-9_-]+\/){0,5}[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:ts|js|mjs|cjs|css|md|html)|README\.md)$/;
const sensitive = /(?:^|[\/._-])(?:auth(?:entication)?|credentials?|accounts?|secrets?|tokens?|private|env|keys?|backup|dump|passwords?|config(?:uration)?|settings|cert(?:ificate)?|seeds?|sessions?)(?:[\/._-]|$)|\.(?:pem|key|pfx|p12|jks|kdbx|sql|env|toml|ya?ml|json|lock|sqlite|db)$/i;
export function reviewVisibility(path: string, oldMode:string, newMode:string): Change['visibility'] {
  if (sensitive.test(path)) return 'sensitive';
  if (path.length > 240 || !ordinary.test(path) || ![oldMode,newMode].every(m=>m==='000000'||m==='100644'||m==='100755')) return 'metadata';
  return 'preview';
}

// Omit the entire preview when text resembles credential material or is unsuitable for plain display.
const credentialMaterial = /-----BEGIN [^-\r\n]*PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[\w]{22,}|AKIA[A-Z0-9]{16}|sk-[\w-]{20,}|xox[baprs]-[\w-]{20,}|eyJ[\w-]{10,}\.eyJ[\w-]+\.[\w-]+)|[a-z][\w+.-]*:\/\/[^\s/]+:[^\s/]+@|\b(?:password|secret|token|api[_-]?key|authorization)\b["']?\s*[:=]\s*["'][^"'\r\n]{8,}["']/i;
export function canPreviewText(source:Buffer) {
  if (source.length>16384 || source.includes(0)) return false;
  try {
    const text = new TextDecoder('utf-8',{fatal:true}).decode(source);
    return !/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(text) && !credentialMaterial.test(text);
  } catch {return false;}
}
function cleanPath(path:string) {
  return Array.from(path).map(ch=>/[\p{C}]/u.test(ch)?'�':ch).join('').slice(0,240);
}
type Git = (...args:string[])=>Promise<Buffer>;
const worktreeMarker = join(root,'.git');
async function trustedMetadata() {
  if (relative(root,await realpath(root)) || relative(worktreeMarker,await realpath(worktreeMarker))) throw denied();
  const marker = await lstat(worktreeMarker);
  if (marker.isDirectory()) return {worktree:worktreeMarker,common:worktreeMarker};
  if (!marker.isFile() || marker.size>1024) throw denied();
  const ref = /^gitdir: ([^\r\n]+)$/.exec((await readFile(worktreeMarker,'utf8')).trim());
  if (!ref || !isAbsolute(ref[1]) || /^(?:\\\\|\/\/)/.test(ref[1])) throw denied();
  const worktree = await realpath(ref[1]);
  if (relative(resolve(ref[1]),worktree)) throw denied();
  const common = dirname(dirname(worktree));
  if (dirname(worktree)!==join(common,'worktrees')) throw denied();
  // A linked checkout must reference the same marker in both directions.
  const pointer = await smallFile(worktree,'commondir');
  const back = await smallFile(worktree,'gitdir');
  if (relative(common,resolve(worktree,pointer)) || relative(worktreeMarker,resolve(worktree,back))) throw denied();
  return {worktree,common};
}
async function smallFile(parent:string,key:string) {
  const target=join(parent,key);
  if (relative(target,await realpath(target)) || (await lstat(target)).size>2048) throw denied();
  return (await readFile(target,'utf8')).trim();
}
async function source() {
  const {worktree,common} = await trustedMetadata();
  const objects=join(common,'objects');
  if (relative(objects,await realpath(objects)) || ['alternates','http-alternates'].some(key=>existsSync(join(objects,'info',key)))) throw denied();
  const git = process.platform === 'win32'
    ? (process.env.PATH ?? '').split(delimiter).filter(p=>isAbsolute(p) && !/^(?:\\\\|\/\/)/.test(p) && !p.split(/[\\/]/).includes('node_modules'))
      .map(p=>join(p,'git.exe')).find(existsSync) : '/usr/bin/git';
  if (!git) throw denied();
  const binary = await realpath(git);
  const local = relative(root,binary);
  if (!isAbsolute(local) && local!=='..' && !local.startsWith('..'+sep)) throw denied();
  const env = {
    SystemRoot:process.env.SystemRoot,PATH:dirname(binary),GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',
    GIT_CONFIG_NOSYSTEM:'1',GIT_ATTR_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_NO_LAZY_FETCH:'1',
    GIT_ALLOW_PROTOCOL:'none',GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',LC_ALL:'C',
  };
  const gitRead: Git = async (...args)=>(await exec(binary,['--git-dir='+common,'--no-pager','-c','core.fsmonitor=false',
    '-c','diff.external=','-c','core.pager=cat',...args],{env,encoding:'buffer',timeout:5000,maxBuffer:192*1024,windowsHide:true})).stdout;
  const remote = (await gitRead('config','--local','--no-includes','--get-all','remote.origin.url')).toString().trim();
  if (remote !== 'https://github.com/franckl136/fjstudio.git') throw denied();
  const branch = (await smallFile(worktree,'HEAD')).replace(/^ref: refs\/heads\//,'');
  checkReviewBranch(branch);
  const head = (await gitRead('rev-parse','--verify','refs/heads/'+reviewBranch+'^{commit}')).toString().trim();
  if (!sha1.test(head)) throw denied();
  return {gitRead,head};
}
export async function currentReviewHead() {
  try { return (await source()).head; } catch { throw denied(); }
}
type Raw = {oldMode:string;newMode:string;before:string;after:string;change:string;path:string};
function changes(bytes:Buffer):Raw[] {
  const columns=bytes.toString('utf8').split('\0');
  if (columns.pop()!=='' || columns.length%2 || columns.length>240) throw denied();
  const rows:Raw[]=[];
  for (let i=0;i<columns.length;i+=2) {
    const fields=/^:(\d{6}) (\d{6}) ([a-f0-9]{40}) ([a-f0-9]{40}) ([ADMT])$/.exec(columns[i]);
    if (!fields) throw denied();
    rows.push({oldMode:fields[1],newMode:fields[2],before:fields[3],after:fields[4],change:fields[5],path:columns[i+1]});
  }
  return rows;
}
async function preview(git:Git,row:Raw) {
  const bytes:Buffer[]=[];
  for (const oid of [row.before,row.after]) {
    if (/^0{40}$/.test(oid)) {bytes.push(Buffer.alloc(0)); continue;}
    const size=Number((await git('cat-file','-s',oid)).toString().trim());
    if (!Number.isSafeInteger(size) || size<0 || size>16384) return;
    const data=await git('cat-file','blob',oid);
    if (data.length!==size || !canPreviewText(data)) return;
    bytes.push(data);
  }
  let lines:string[];
  if (row.change==='A'||row.change==='D') {
    const added=row.change==='A';
    lines = bytes[added?1:0].toString().split(/\r?\n/).map(line=>(added?'+':'-')+line);
  } else {
    const patch = await git('diff','--no-ext-diff','--no-textconv','--no-renames','--no-color',
      '--minimal','--unified=2',row.before,row.after,'--');
    lines=patch.toString().split(/\r?\n/);
    const hunk=lines.findIndex(s=>s.startsWith('@@'));
    lines=hunk<0?[]:lines.slice(hunk);
  }
  const excerpt=lines.slice(0,48).join('\n').slice(0,2400);
  return {excerpt,shortened:lines.length>48 || lines.slice(0,48).join('\n').length>2400};
}
export async function readStudioChanges() {
  try {
    const {gitRead,head}=await source();
    const base=(await gitRead('rev-parse','--verify',head+'^1^{commit}')).toString().trim();
    if (!sha1.test(base)) throw denied();
    const files=changes(await gitRead('diff-tree','--no-commit-id','--no-renames','--raw','--no-abbrev','-r','-z',base,head,'--'));
    const summary:Change[]=[];
    let considered=0;
    for (const row of files) {
      const visibility=reviewVisibility(row.path,row.oldMode,row.newMode);
      const change:Change={path:cleanPath(row.path),change:row.change,visibility};
      if (visibility==='preview') {
        const found=considered++<8 ? await preview(gitRead,row) : undefined;
        if (found) Object.assign(change,found); else change.visibility='metadata';
      }
      summary.push(change);
    }
    if (await currentReviewHead()!==head) throw denied();
    return {branch:reviewBranch,base,head,summary};
  } catch {throw denied();}
}
