import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { windowsPrivate } from '../scripts/windows-private.ts';

test('NTFS · la DACL privée peut être réappliquée deux fois sans privilège d’audit', {skip:process.platform!=='win32'},async()=>{
  const scratch=await mkdtemp(join(tmpdir(),'.fjstudio-backup-'));
  try {
    windowsPrivate('ProtectEmptyScratch',scratch);
    windowsPrivate('ProtectEmptyScratch',scratch);
    assert.throws(()=>windowsPrivate('ProtectBackupRoot',scratch));
  } finally {
    await rm(scratch,{recursive:true,force:true});
  }
});
