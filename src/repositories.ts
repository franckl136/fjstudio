import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { DomainError, isProjectId, type Operator, type ProjectId } from './contracts.ts';
import { assertId, assertProject, notFound, transaction } from './database.ts';

export interface RepositoryPolicy {
  project: ProjectId;
  key: string;
  directory: string;
  remote: string;
}
type Worktree = { staged: number; unstaged: number; untracked: number };
type LocalState = { branch: string | null; local_commit: string; worktree: Worktree };
type Comparison = { branch: string; commit: string; ahead: number; behind: number; changedFiles: number };
type RemoteState =
  | { state: 'unavailable'; requestedBranch: string | null }
  | { state: 'observed'; fetchedAt: string; branches: { name: string; commit: string }[];
      requestedBranch: string | null; comparison: Comparison | null };
export type RepositoryObservation = LocalState & {
  id: string; repository_key: string; observed_at: Date; recorded_at: Date; observed_by: string;
  operation: 'local' | 'fetch'; remote_state: RemoteState | null;
};
const execute = promisify(execFile);
const sha1 = /^[a-f0-9]{40}$/;
const builtin: RepositoryPolicy = {
  project: 'a', key: 'fjstudio', directory: fileURLToPath(new URL('../', import.meta.url)),
  remote: 'https://github.com/franckl136/fjstudio.git',
};

function configurationError(): never {
  throw new DomainError(409, 'repository_configuration', 'Vérifiez le répertoire Git local et son origine HTTPS autorisée.');
}

function policies(): RepositoryPolicy[] {
  let extra: unknown;
  try { extra = JSON.parse(process.env.STUDIO_GIT_REPOSITORIES ?? '[]'); } catch { configurationError(); }
  if (!Array.isArray(extra)) configurationError();
  const result: RepositoryPolicy[] = [];
  for (const item of [builtin, ...extra]) {
    if (!item || !isProjectId(item.project) || typeof item.key !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(item.key) ||
        typeof item.directory !== 'string' || !isAbsolute(item.directory) || /^(?:\\\\|\/\/)/.test(item.directory) ||
        typeof item.remote !== 'string' || (item.remote !== '' && !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\.git$/.test(item.remote)) ||
        result.some(p => p.key === item.key)) configurationError();
    result.push({ project: item.project, key: item.key, directory: resolve(item.directory), remote: item.remote });
  }
  return result;
}

export async function linkedRepositoryDirectory(db:PoolClient,actor:Operator,project:ProjectId) {
  assertProject(actor,project);
  const target=(await db.query<{repository_key:string;remote_url:string}>('SELECT repository_key,remote_url FROM project_repositories WHERE project_id=$1',[project])).rows[0];
  if(!target)return null;
  const policy=policies().find(p=>p.project===project && p.key===target.repository_key && p.remote===target.remote_url);
  if(!policy)configurationError();
  return policy.directory;
}

export function gitProgram(source: string) {
  const windows = process.platform === 'win32';
  const name = windows ? 'git.exe' : 'git';
  // Resolve from the host installation, never from the repository or its node_modules.
  const dirs = windows ? (process.env.PATH ?? '').split(delimiter) : ['/usr/bin','/usr/local/bin','/bin'];
  for (const directory of dirs) {
    if (!isAbsolute(directory) || /(?:^|[\\/])node_modules(?:[\\/]|$)/i.test(directory)) continue;
    const candidate = join(directory, name);
    if (!existsSync(candidate)) continue;
    const installed = realpathSync(candidate);
    const inCheckout = [source,builtin.directory].some(checkout => {
      const path = relative(checkout, installed);
      return !isAbsolute(path) && path !== '..' && !path.startsWith('..'+sep);
    });
    if (!inCheckout) return installed;
  }
  throw new DomainError(503, 'git_unavailable', 'Le binaire Git local est indisponible.');
}

function branchName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes('..') && value.split('/').every(segment => segment && !segment.startsWith('.') && !segment.endsWith('.lock')) &&
    !value.endsWith('.');
}

async function sourceFile(gitDir: string, name: string, optional = false) {
  const path = join(gitDir,name);
  try {
    const resolved = await realpath(path);
    if (relative(gitDir, resolved) !== name.split('/').join(sep)) configurationError();
    const info = await lstat(path);
    if (!info.isFile() || info.size > 16 * 1024 * 1024) configurationError();
    return path;
  } catch (err) {
    if (optional && (err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    configurationError();
  }
}

async function studioCommonDirectory() {
  const marker=join(builtin.directory,'.git');
  if((await lstat(marker)).isDirectory())return realpath(marker);
  const pointer=await sourceFile(builtin.directory,'.git');
  const match=/^gitdir: ([^\r\n]+)$/.exec((await readFile(pointer!,'utf8')).trim());
  if(!match || !isAbsolute(match[1]))configurationError();
  const dir=await realpath(match[1]);
  const common=await realpath(resolve(dir,(await readFile((await sourceFile(dir,'commondir'))!,'utf8')).trim()));
  const back=(await readFile((await sourceFile(dir,'gitdir'))!,'utf8')).trim();
  if(relative(join(common,'worktrees'),dirname(dir)) || relative(marker,resolve(dir,back)))configurationError();
  return common;
}

async function inspect(policy: RepositoryPolicy, fetch: boolean, reference?: string): Promise<LocalState & {
  observed_at: Date; remote_state: RemoteState | null;
}> {
  if (fetch && !policy.remote) throw new DomainError(403,'local_repository','Ce dépôt est relié en lecture locale uniquement.');
  if (reference !== undefined && !branchName(reference)) {
    throw new DomainError(400,'git_branch','Nom de branche non pris en charge.');
  }
  const temp = await mkdtemp(join(tmpdir(),'fjstudio-observe-'));
  try {
    const root = await realpath(policy.directory);
    if (relative(policy.directory, root) !== '') configurationError();
    const git = gitProgram(root);
    const marker = await realpath(join(root,'.git'));
    if (relative(root,marker) !== '.git') configurationError();
    let gitDir = marker, common = marker;
    const metadata = await lstat(marker);
    if (metadata.isFile()) {
      if (metadata.size>1024) configurationError();
      const match = /^gitdir: ([^\r\n]+)$/.exec((await readFile(marker,'utf8')).trim());
      if (!match || !isAbsolute(match[1])) configurationError();
      const trustedCommon=await studioCommonDirectory();
      if(relative(join(trustedCommon,'worktrees'),dirname(resolve(match[1])))!=='')configurationError();
      gitDir = await realpath(match[1]);
      if (relative(resolve(match[1]),gitDir) !== '') configurationError();
      const pointer = await sourceFile(gitDir,'commondir');
      common = await realpath(resolve(gitDir,(await readFile(pointer!,'utf8')).trim()));
      const backref = await sourceFile(gitDir,'gitdir');
      if (relative(trustedCommon,common) !== '' || relative(join(common,'worktrees'),dirname(gitDir)) !== '' ||
          relative(marker,resolve(gitDir,(await readFile(backref!,'utf8')).trim())) !== '') configurationError();
    } else if (!metadata.isDirectory() || await sourceFile(gitDir,'commondir',true)) configurationError();
    const objects = join(common,'objects');
    if (relative(objects,await realpath(objects)) !== '' || await sourceFile(common,'objects/info/alternates',true) ||
        await sourceFile(common,'objects/info/http-alternates',true)) configurationError();
    const env: NodeJS.ProcessEnv = {
      PATH: [dirname(git), process.platform==='win32' ? join(process.env.SystemRoot ?? 'C:\\Windows','System32') : '/usr/bin'].join(delimiter),
      SystemRoot: process.env.SystemRoot, TEMP: temp, TMP: temp, HOME: temp, XDG_CONFIG_HOME: temp,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(temp,'empty-config'), GIT_TERMINAL_PROMPT: '0',
      GIT_ALLOW_PROTOCOL: 'https', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH:'1', GIT_ATTR_NOSYSTEM: '1',
      GIT_CEILING_DIRECTORIES: dirname(temp), GIT_LFS_SKIP_SMUDGE: '1', LC_ALL: 'C',
    };
    await writeFile(env.GIT_CONFIG_GLOBAL!, '', {flag:'wx'});
    async function command(args: string[], alternates = false) {
      const {stdout} = await execute(git, ['--no-optional-locks','-c','core.hooksPath='+join(temp,'disabled-hooks'),
        '-c','core.fsmonitor=false','-c','credential.helper=','-c','http.followRedirects=false',
        '-c','protocol.version=2','-c','submodule.recurse=false', ...args], {
        cwd:temp, env: alternates ? {...env,GIT_ALTERNATE_OBJECT_DIRECTORIES:objects} : env,
        encoding:'utf8', timeout:30_000, maxBuffer:2*1024*1024, windowsHide:true,
      });
      return stdout;
    }
    if (policy.remote) {
      const config = await sourceFile(common,'config');
      const urls = await command(['config','--no-includes','--file',config!,'--get-all','remote.origin.url']);
      if (urls.trimEnd() !== policy.remote) configurationError();
    }
    const headFile = await sourceFile(gitDir,'HEAD');
    const head = (await readFile(headFile!,'utf8')).trim();
    const branch = head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : null;
    let commit = head;
    if (branch !== null) {
      if (!branchName(branch)) configurationError();
      const ref = 'refs/heads/'+branch;
      const loose = await sourceFile(common,ref,true);
      if (loose) commit = (await readFile(loose,'utf8')).trim();
      else {
        const packed = await sourceFile(common,'packed-refs');
        commit = (await readFile(packed!,'utf8')).split(/\r?\n/).find(line=>line.slice(41)===ref)?.slice(0,40) ?? '';
      }
    }
    if (!sha1.test(commit)) configurationError();
    const local = join(temp,'local.git');
    await command(['init','--bare','--template=',local]);
    await writeFile(join(local,'HEAD'),commit+'\n');
    const index = await sourceFile(gitDir,'index');
    await copyFile(index!,join(local,'index'));
    const exclude = await sourceFile(common,'info/exclude',true);
    if (exclude) {
      await mkdir(join(local,'info'),{recursive:true});
      await copyFile(exclude,join(local,'info','exclude'));
    }
    const state = await command(['--git-dir='+local,'--work-tree='+root,'-c','core.bare=false',
      '-c','core.autocrlf='+(process.platform==='win32'?'true':'false'),'-c','core.filemode=false',
      'status','--porcelain=v1','-z','--no-renames','--untracked-files=normal','--ignore-submodules=all'],true);
    const worktree = {staged:0,unstaged:0,untracked:0};
    for (const entry of state.split('\0').filter(Boolean)) {
      if (entry.startsWith('??')) worktree.untracked++;
      else {
        if (entry[0]!==' ') worktree.staged++;
        if (entry[1]!==' ') worktree.unstaged++;
      }
    }
    const observed_at = new Date();
    let remote_state: RemoteState | null = null;
    if (fetch) {
      const remote = join(temp,'remote.git');
      const requestedBranch = reference ?? branch;
      await command(['init','--bare','--template=',remote]);
      try {
        // Empty reference store and no alternates while negotiating with the remote.
        await command(['--git-dir='+remote,'-c','fetch.fsckObjects=true','fetch','--no-tags','--no-recurse-submodules',
          '--no-write-fetch-head','--no-auto-maintenance','--no-progress',policy.remote,'+refs/heads/*:refs/remotes/observed/*']);
        const refs = await command(['--git-dir='+remote,'for-each-ref','--format=%(refname:lstrip=3)%09%(objectname)','refs/remotes/observed/']);
        const branches = refs.trimEnd().split(/\r?\n/).filter(Boolean).map(line=>{
          const [name,hash]=line.split('\t');
          if (!sha1.test(hash)) configurationError();
          return {name,commit:hash};
        });
        const match = branches.find(b=>b.name===requestedBranch);
        let comparison: Comparison | null = null;
        if (match) {
          const counts = (await command(['--git-dir='+remote,'rev-list','--left-right','--count',commit+'...'+match.commit],true)).trim().split(/\s+/).map(Number);
          const changed = await command(['--git-dir='+remote,'diff','--no-ext-diff','--no-textconv','--no-renames',
            '--ignore-submodules=all','--name-only','-z',commit,match.commit,'--'],true);
          comparison = {branch:match.name,commit:match.commit,ahead:counts[0],behind:counts[1],changedFiles:changed.split('\0').filter(Boolean).length};
        }
        remote_state={state:'observed',requestedBranch,branches,comparison,fetchedAt:new Date().toISOString()};
      } catch {
        remote_state={state:'unavailable',requestedBranch};
      }
    }
    return {local_commit:commit,branch,worktree,observed_at,remote_state};
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw new DomainError(503,'repository_unavailable','Observation Git indisponible. Vérifiez le checkout, son index et l’installation locale de Git.');
  } finally {
    await rm(temp,{recursive:true,force:true});
  }
}

export class Repositories {
  private pool: Pool;
  private active = new Set<string>();
  constructor(pool: Pool) { this.pool=pool; }

  private async inspectSource(policy: RepositoryPolicy, fetch: boolean, reference?: string) {
    if (this.active.has(policy.key) || this.active.size >= 2) {
      throw new DomainError(409,'repository_busy','Une observation est en cours. Réessayez après sa fin.');
    }
    this.active.add(policy.key);
    try { return await inspect(policy,fetch,reference); }
    finally { this.active.delete(policy.key); }
  }

  async state(actor: Operator, project: ProjectId, observation?: string) {
    assertProject(actor,project);
    if (observation !== undefined) assertId(observation);
    const available = policies().filter(p=>p.project===project).map(p=>({key:p.key,remote:p.remote,directory:p.directory}));
    const target = (await this.pool.query<{ repository_key:string;remote_url:string; registered_by:string;registered_at:Date }>(
      'SELECT repository_key,remote_url,registered_by,registered_at FROM project_repositories WHERE project_id=$1',[project])).rows[0] ?? null;
    const observations=(await this.pool.query<RepositoryObservation>('SELECT * FROM repository_observations WHERE project_id=$1 AND ($2::uuid IS NULL OR id=$2) ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 20',[project,observation??null])).rows;
    if (observation && !observations.length) throw notFound();
    return {available,target,observations};
  }

  async register(actor: Operator, project: ProjectId, key: string) {
    assertProject(actor,project);
    const source = policies().find(p=>p.project===project && p.key===key);
    if (!source) throw notFound();
    await this.inspectSource(source,false);
    await this.pool.query(`INSERT INTO project_repositories(project_id,repository_key,remote_url,registered_by)
      VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO NOTHING`,[project,key,source.remote,actor.id]);
    const state=await this.state(actor,project);
    if (state.target?.repository_key!==key || state.target.remote_url!==source.remote) configurationError();
    return state;
  }

  async observe(actor: Operator, project: ProjectId, operation: 'local'|'fetch', reference?: string) {
    assertProject(actor,project);
    const target=(await this.pool.query<{repository_key:string;remote_url:string}>(
      'SELECT repository_key,remote_url FROM project_repositories WHERE project_id=$1',[project])).rows[0];
    if (!target) throw notFound();
    const source=policies().find(p=>p.key===target.repository_key && p.project===project && p.remote===target.remote_url);
    if (!source) configurationError();
    const view=await this.inspectSource(source,operation==='fetch',reference);
    const id=randomUUID();
    await transaction(this.pool,async client=>{
      await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[project]);
      await client.query(`INSERT INTO repository_observations(id,project_id,repository_key,observed_at,observed_by,operation,local_commit,branch,worktree,remote_state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,project,source.key,view.observed_at,actor.id,operation,view.local_commit,view.branch,view.worktree,view.remote_state]);
    });
    return {id,...view};
  }
}

export async function freezeRepository(client: PoolClient, project: ProjectId, mission: string) {
  await client.query(`INSERT INTO mission_repositories(project_id,mission_id,observation_id)
    SELECT project_id,$2,id FROM repository_observations WHERE project_id=$1 ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1`,[project,mission]);
}

export async function readMissionRepository(client: PoolClient, project: ProjectId, mission: string) {
  return (await client.query<{repository_key:string;remote_url:string;local_commit:string;branch:string|null;worktree:Worktree;observed_at:Date;observation_id:string}>(
    `SELECT r.repository_key,r.remote_url,o.local_commit,o.branch,o.worktree,o.observed_at,s.observation_id
    FROM mission_repositories s JOIN repository_observations o ON (o.project_id,o.id)=(s.project_id,s.observation_id)
    JOIN project_repositories r ON (r.project_id,r.repository_key)=(o.project_id,o.repository_key)
    WHERE s.project_id=$1 AND s.mission_id=$2`,[project,mission])).rows[0] ?? null;
}
