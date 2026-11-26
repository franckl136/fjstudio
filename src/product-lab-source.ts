import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DomainError, isProjectId, type ProjectId } from './contracts.ts';

export const labDigest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const shaPattern = /^[0-9a-f]{40}$/;
export type LabSource = { project: ProjectId; key: string; directory: string; entry: string; ref: string };
export type LabInventory = { manifests: string[]; dependencies: number | null; devDependencies: number | null; directories?:string[] };
export type LabSnapshot = { inventory: LabInventory; commit: string; entry: string; bytes: Buffer; sha256: string };
const badConfig = () => new DomainError(409, 'lab_source', 'La source Git autorisée doit être vérifiée sur le poste.');
const noSnapshot = () => new DomainError(409, 'lab_snapshot', 'Révision ou fichier indisponible dans cette source.');

export function labSources(project: ProjectId): LabSource[] {
  let extra: unknown;
  try { extra = JSON.parse(process.env.STUDIO_LAB_SOURCES ?? '[]'); } catch { throw badConfig(); }
  if (!Array.isArray(extra) || extra.length > 40) throw badConfig();
  const samples: LabSource[] = [{ project, key: 'studio-sample', directory: root, entry: 'fixtures/product-lab.html', ref: 'HEAD' }];
  samples.push({project,key:'studio-types',directory:root,entry:'fixtures/product-lab.ts',ref:'HEAD'});
  const seen = new Set(samples.map(s => project + '/' + s.key));
  for (const value of extra) {
    if (!value || !isProjectId(value.project) || typeof value.key !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value.key) ||
        ['studio-sample','studio-types'].includes(value.key) || typeof value.directory !== 'string' || !isAbsolute(value.directory) ||
        /^(?:\\\\|\/\/)/.test(value.directory) || typeof value.entry !== 'string' ||
        !/^(?:[a-zA-Z0-9_-]+\/){0,12}[a-zA-Z0-9_-]+\.(?:html|ts)$/.test(value.entry) ||
        typeof value.ref !== 'string' || !(value.ref === 'HEAD' || /^refs\/heads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(value.ref))) throw badConfig();
    const pair = value.project + '/' + value.key;
    if (seen.has(pair)) throw badConfig();
    seen.add(pair);
    if (value.project === project) samples.push({ project, key: value.key, entry: value.entry, directory: resolve(value.directory), ref: value.ref });
  }
  return samples;
}

// A source has an operator-installed checkout, an authorized ref and a single approved source file.
// The request can select a reachable commit. It cannot supply a pathname, URL or Git argument.
export async function readLabSnapshot(source: LabSource, requested?: string): Promise<LabSnapshot> {
  if (requested && !shaPattern.test(requested)) throw noSnapshot();
  try {
    const checkout = await realpath(source.directory);
    if (relative(resolve(source.directory), checkout) !== '') throw badConfig();
    const binary = process.platform === 'win32' ? 'git.exe' : 'git';
    const dirs = process.platform === 'win32' ? (process.env.PATH ?? '').split(delimiter) : ['/usr/bin', '/bin'];
    const path = dirs.filter(d => isAbsolute(d) && !d.split(/[\\/]/).includes('node_modules'))
      .map(d => join(d, binary)).find(existsSync);
    if (!path) throw badConfig();
    const git = await realpath(path);
    const fromCheckout = relative(checkout, git);
    if (!isAbsolute(fromCheckout) && fromCheckout !== '..' && !fromCheckout.startsWith('..' + sep)) throw badConfig();
    const env = {
      SystemRoot: process.env.SystemRoot, PATH: dirname(git), GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0',
      GIT_ALLOW_PROTOCOL: 'none', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0',
    };
    const call = async (...args: string[]) => (await exec(git, ['-C', checkout, '-c', 'core.fsmonitor=false', ...args], {
      env, encoding: 'buffer', maxBuffer: 132096, timeout: 4000, windowsHide: true,
    })).stdout;
    const originRoot = (await call('rev-parse', '--show-toplevel')).toString().trim();
    if (!isAbsolute(originRoot) || relative(checkout, resolve(originRoot)) !== '') throw badConfig();
    // Only the Studio's own install is allowed to use its already trusted linked worktree.
    // A registered candidate must not redirect .git into a different project's object store.
    const localGit = join(checkout,'.git');
    const linkedStudio = ['studio-sample','studio-types'].includes(source.key) && relative(root, checkout) === '';
    if (!linkedStudio && (!(await lstat(localGit)).isDirectory() || relative(localGit, await realpath(localGit)) !== '')) throw badConfig();
    const commonPath = (await call('rev-parse', '--path-format=absolute', '--git-common-dir')).toString().trim();
    if (!isAbsolute(commonPath) || /^(?:\\\\|\/\/)/.test(commonPath)) throw badConfig();
    const common = await realpath(commonPath);
    if ((!linkedStudio && relative(localGit, common) !== '') || relative(resolve(commonPath), common) !== '' ||
        relative(join(common,'objects'),await realpath(join(common,'objects'))) !== '' || ['alternates','http-alternates'].some(name => existsSync(join(common,'objects','info',name)))) throw badConfig();
    const tip = (await call('rev-parse', '--verify', source.ref + '^{commit}')).toString().trim();
    if (!shaPattern.test(tip)) throw noSnapshot();
    const commit = requested || tip;
    if (tip !== commit) await call('merge-base', '--is-ancestor', commit, tip);
    const listing = (await call('ls-tree', '-z', commit, '--', source.entry)).toString('utf8');
    const parts = /^100644 blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(listing);
    if (!parts || parts[2] !== source.entry) throw noSnapshot();
    const length = Number((await call('cat-file', '-s', parts[1])).toString().trim());
    if (!Number.isInteger(length) || length < 1 || length > 131072) throw noSnapshot();
    const bytes = await call('cat-file', 'blob', parts[1]);
    if (bytes.length !== length || bytes.includes(0)) throw noSnapshot();
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const manifests = ['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','deno.json','pyproject.toml','Cargo.toml','go.mod','Dockerfile'];
    const entries = (await call('ls-tree','-z',commit,'--',...manifests)).toString('utf8').split('\0')
      .map(line => /^100644 blob ([0-9a-f]{40})\t([^\0]+)$/.exec(line)).filter(m => m !== null && manifests.includes(m[2]));
    const inventory: LabInventory = { manifests: entries.map(m => m![2]), dependencies: null, devDependencies: null };
    const knownDirectories=['apps','assets','docs','fixtures','migrations','packages','prisma','public','scripts','src','supabase','test','tests'];
    const directories=(await call('ls-tree','-d','--name-only','-z',commit,'--',...knownDirectories)).toString('utf8').split('\0')
      .filter(name=>knownDirectories.includes(name));
    inventory.directories=directories;
    const pkg = entries.find(m => m![2] === 'package.json');
    if (pkg && Number((await call('cat-file','-s',pkg[1])).toString()) <= 65536) {
      try {
        const manifest = JSON.parse((await call('cat-file','blob',pkg[1])).toString('utf8'));
        const count = (item: unknown) => item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item).length : 0;
        if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
          inventory.dependencies=count(manifest.dependencies); inventory.devDependencies=count(manifest.devDependencies);
        }
      } catch { /* A malformed manifest cannot establish dependency counts. */ }
    }
    return { commit, entry: source.entry, bytes, sha256: labDigest(bytes), inventory };
  } catch (err) {
    if (err instanceof DomainError) throw err;
    throw noSnapshot();
  }
}
