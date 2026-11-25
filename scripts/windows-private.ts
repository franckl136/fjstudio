import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function windowsPrivate(operation: 'PublishConfig' | 'ProtectEmptyScratch' | 'ProtectBackupRoot', path: string, contents?: string) {
  const root = process.env.SystemRoot;
  if (!root || process.platform !== 'win32') throw new Error('Windows NTFS requis.');
  const executable = join(root,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const helper = fileURLToPath(new URL('./windows-private.ps1',import.meta.url));
  const result = spawnSync(executable,['-NoProfile','-NonInteractive','-File',helper,operation,path],{
    windowsHide: true, timeout: 15_000, input: contents, stdio:['pipe','ignore','pipe'],
    // Secret bytes are transmitted exclusively on stdin.
    env: {SystemRoot:root, TEMP:process.env.TEMP, TMP:process.env.TMP},
  });
  if (result.status === 73 && operation === 'PublishConfig') {
    throw Object.assign(new Error('Configuration existante.'),{code:'EEXIST'});
  }
  if (result.error || result.status !== 0) throw new Error('Création NTFS privée impossible. Vérifiez les droits locaux et la stratégie PowerShell.');
}
