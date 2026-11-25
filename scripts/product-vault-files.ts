import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, link, lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join, posix, resolve, win32 } from 'node:path';
import { localPath } from './archive.ts';
import { windowsPrivate } from './windows-private.ts';

export function vaultPath(value: string) {
  if (
    /^[a-z]:(?![\\/])/i.test(value) ||
    (process.platform === 'win32' && value.replace(/^[a-z]:/i, '').includes(':'))
  )
    throw new Error('Un chemin local direct est requis.');
  return localPath(value);
}

function windows(source: string, destination: string, command: string) {
  const root = process.env.SystemRoot;
  if (!root) throw new Error('Windows requis.');
  const ps = join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  execFileSync(
    ps,
    ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; " + command],
    {
      env: { SystemRoot: root, STUDIO_VAULT_SOURCE: source, STUDIO_VAULT_DESTINATION: destination },
      stdio: 'ignore',
      windowsHide: true,
      timeout: 10000,
    },
  );
}

function requirePrivateVolume(path: string) {
  if (process.platform !== 'win32') return;
  try {
    windows(
      path,
      '',
      "if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($env:STUDIO_VAULT_SOURCE)).DriveFormat -ne 'NTFS') {exit 1}",
    );
  } catch {
    throw new Error('Un volume NTFS local est requis pour la clé ou les données en clair.');
  }
}

export async function unused(path: string) {
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw Object.assign(new Error('Destination déjà présente. Choisir un nouveau nom.'), { code: 'EEXIST' });
}

export function archiveName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('.') ||
    /[. ]$/.test(value) ||
    Buffer.byteLength(value) > 240 ||
    value !== win32.basename(value) ||
    value !== posix.basename(value) ||
    /[<>:"/\\|?*\x00-\x1f\x7f]/.test(value) ||
    /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/i.test(value)
  )
    throw new Error('Nom de fichier du manifeste incompatible avec un dossier local Windows.');
  return value;
}

export const defaultKeyFile = () => resolve('.env.archive.local');
export async function setupVaultKey(file = defaultKeyFile()) {
  const path = vaultPath(file);
  if (basename(path) !== '.env.archive.local') throw new Error('Fichier de clé d’archive inattendu.');
  requirePrivateVolume(path);
  const key = randomBytes(32);
  try {
    const contents = 'STUDIO_ARCHIVE_KEY=' + key.toString('base64url') + '\n';
    if (process.platform === 'win32') windowsPrivate('PublishConfig', path, contents);
    else await writeFile(path, contents, { flag: 'wx', mode: 0o600 });
  } finally {
    key.fill(0);
  }
}

export async function readVaultKey(file = defaultKeyFile()) {
  const path = vaultPath(file);
  if (basename(path) !== '.env.archive.local') throw new Error('Fichier de clé d’archive inattendu.');
  requirePrivateVolume(path);
  const fh = await open(path, 'r');
  try {
    const info = await fh.stat();
    if (!info.isFile() || info.size > 128) throw new Error('Format de la clé d’archive incorrect.');
    if (process.platform === 'win32') {
      try {
        windows(
          path,
          '',
          `
          $acl=[IO.File]::GetAccessControl($env:STUDIO_VAULT_SOURCE)
          $me=[Security.Principal.WindowsIdentity]::GetCurrent().User
          if (!$acl.GetOwner([Security.Principal.SecurityIdentifier]).Equals($me)) {exit 2}
          $allowed=@($me.Value,'S-1-5-18','S-1-5-32-544')
          foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if ($ace.AccessControlType -eq 'Allow' -and $allowed -notcontains $ace.IdentityReference.Value) {exit 3}
          }`,
        );
      } catch {
        throw new Error('Autorisations du fichier de clé insuffisamment privées.');
      }
    } else if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
      throw new Error('Autorisations du fichier de clé insuffisamment privées.');
    }
    const data = Buffer.alloc(129);
    try {
      const { bytesRead } = await fh.read(data, 0, data.length, 0);
      if (bytesRead !== info.size) throw new Error('Lecture de la clé d’archive incohérente.');
      const match = /^STUDIO_ARCHIVE_KEY=([A-Za-z0-9_-]{43})\r?\n?$/.exec(
        data.toString('utf8', 0, bytesRead),
      );
      if (!match) throw new Error('Clé d’archive incorrecte.');
      const key = Buffer.from(match[1], 'base64url');
      if (key.length !== 32 || key.toString('base64url') !== match[1])
        throw new Error('Clé d’archive incorrecte.');
      return key;
    } finally {
      data.fill(0);
    }
  } finally {
    await fh.close();
  }
}

// Keep staging on the destination volume. The private flag is mandatory when staging decrypted bytes.
export async function staging(destination: string, privateData: boolean) {
  if (privateData) requirePrivateVolume(destination);
  const scratch = await mkdtemp(join(dirname(destination), '.fjstudio-backup-'));
  try {
    if (privateData && process.platform === 'win32') windowsPrivate('ProtectEmptyScratch', scratch);
    return scratch;
  } catch (error) {
    await rm(scratch, { recursive: true, force: true });
    throw error;
  }
}

// File.Move/Directory.Move fail on collisions, including an existing empty directory on Windows.
export async function publish(source: string, destination: string, directory: boolean) {
  if (process.platform === 'win32') {
    try {
      windows(
        source,
        destination,
        directory
          ? '[IO.Directory]::Move($env:STUDIO_VAULT_SOURCE,$env:STUDIO_VAULT_DESTINATION)'
          : '[IO.File]::Move($env:STUDIO_VAULT_SOURCE,$env:STUDIO_VAULT_DESTINATION)',
      );
    } catch {
      await unused(destination);
      throw new Error('Publication locale impossible. Vérifiez les autorisations et le volume.');
    }
  } else if (directory) {
    await mkdir(destination, { mode: 0o700 });
    for (const name of await readdir(source))
      await copyFile(join(source, name), join(destination, name), constants.COPYFILE_EXCL);
  } else {
    await link(source, destination);
  }
}
