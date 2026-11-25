import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { isDeepStrictEqual } from 'node:util';
import { verifyArchive } from './archive.ts';
import {
  archiveName,
  publish,
  readVaultKey,
  setupVaultKey,
  staging,
  unused,
  vaultPath,
} from './product-vault-files.ts';

const magic = Buffer.from('FJVAULT1');
const headerLength = magic.length + 12,
  tagLength = 16,
  maxManifest = 256 * 1024;
const maxPlain = 2 ** 36 - 32;

async function readExactly(file: FileHandle, position: number, length: number) {
  const bytes = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const result = await file.read(bytes, offset, length - offset, position + offset);
    if (!result.bytesRead) throw new Error('Archive tronquée.');
    offset += result.bytesRead;
  }
  return bytes;
}

async function checkDump(file: FileHandle) {
  if ((await readExactly(file, 0, 5)).toString('ascii') !== 'PGDMP')
    throw new Error('Dump PostgreSQL personnalisé requis.');
}

async function manifestBytes(path: string) {
  const file = await open(vaultPath(path + '.json'), 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxManifest || !info.size)
      throw new Error('Taille de manifeste incorrecte.');
    return await readExactly(file, 0, info.size);
  } finally {
    await file.close();
  }
}

export async function packVault(input: string, output: string, key: Buffer) {
  const source = vaultPath(input),
    target = vaultPath(output);
  await unused(target);
  const file = await open(source, 'r');
  let scratch: string | undefined;
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size < 5 || info.size > maxPlain)
      throw new Error('Taille du dump hors format.');
    await checkDump(file);
    const verified = await verifyArchive(source, file);
    if (!verified.manifest || verified.manifest.format !== 'fjstudio-backup-v2')
      throw new Error('Manifeste Studio v2 requis.');
    archiveName(verified.manifest.file);
    const metadata = await manifestBytes(source);
    if (!isDeepStrictEqual(JSON.parse(metadata.toString('utf8')), verified.manifest))
      throw new Error('Le manifeste a changé pendant la lecture.');
    if (verified.bytes + metadata.length + 4 > maxPlain)
      throw new Error('Taille maximale du format chiffré dépassée.');

    scratch = await staging(target, false);
    const temporary = join(scratch, 'encrypted.fjvault');
    const handle = await open(temporary, 'wx', 0o600);
    try {
      const iv = randomBytes(12),
        head = Buffer.concat([magic, iv]);
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: tagLength });
      cipher.setAAD(head);
      await handle.writeFile(head);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(metadata.length);
      await handle.writeFile(cipher.update(Buffer.concat([length, metadata])));
      const hash = createHash('sha256');
      let bytes = 0;
      // Recheck the exact bytes supplied to the cipher even if the source changes after its initial verification.
      for await (const chunk of file.createReadStream({
        start: 0,
        end: verified.bytes - 1,
        autoClose: false,
      })) {
        bytes += chunk.length;
        hash.update(chunk);
        await handle.writeFile(cipher.update(chunk));
      }
      if (
        bytes !== verified.bytes ||
        (await file.stat()).size !== bytes ||
        hash.digest('hex') !== verified.sha256
      )
        throw new Error('Le dump a changé pendant le chiffrement.');
      await handle.writeFile(Buffer.concat([cipher.final(), cipher.getAuthTag()]));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await publish(temporary, target, false);
    return { file: basename(target), dumpBytes: verified.bytes, dumpSha256: verified.sha256 };
  } finally {
    await file.close();
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

async function authenticateTo(file: FileHandle, size: number, path: string, key: Buffer) {
  const head = await readExactly(file, 0, headerLength);
  if (!head.subarray(0, magic.length).equals(magic)) throw new Error('Format de coffre inconnu.');
  const decipher = createDecipheriv('aes-256-gcm', key, head.subarray(magic.length), {
    authTagLength: tagLength,
  });
  decipher.setAAD(head);
  decipher.setAuthTag(await readExactly(file, size - tagLength, tagLength));
  try {
    await pipeline(
      file.createReadStream({ start: headerLength, end: size - tagLength - 1, autoClose: false }),
      decipher,
      createWriteStream(path, { flags: 'wx', mode: 0o600 }),
    );
  } catch {
    throw new Error(
      'Lecture et authentification du coffre impossibles. Vérifier le fichier, la clé et l’espace libre.',
    );
  }
}

export async function unpackVault(input: string, output: string, key: Buffer) {
  const source = vaultPath(input),
    destination = vaultPath(output);
  await unused(destination);
  const file = await open(source, 'r');
  let scratch: string | undefined;
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.size <= headerLength + tagLength + 4 ||
      info.size - headerLength - tagLength > maxPlain
    )
      throw new Error('Taille du coffre incorrecte.');
    scratch = await staging(destination, true);
    const payload = join(scratch, '.decrypted');
    // No path or size from the encrypted payload is used before the complete GCM tag has been verified.
    await authenticateTo(file, info.size, payload, key);
    if ((await file.stat()).size !== info.size)
      throw new Error('La taille du coffre a changé pendant la lecture.');
    const plain = await open(payload, 'r');
    let name: string;
    try {
      const length = (await readExactly(plain, 0, 4)).readUInt32BE();
      if (!length || length > maxManifest || 4 + length + 5 > info.size - headerLength - tagLength)
        throw new Error('Enveloppe de manifeste incorrecte.');
      const raw = await readExactly(plain, 4, length);
      const metadata: unknown = JSON.parse(raw.toString('utf8'));
      if (metadata === null || typeof metadata !== 'object' || !('file' in metadata))
        throw new Error('Manifeste du coffre incorrect.');
      name = archiveName(metadata.file);
      await pipeline(
        plain.createReadStream({ start: 4 + length, autoClose: false }),
        createWriteStream(join(scratch, name), { flags: 'wx', mode: 0o600 }),
      );
      await writeFile(join(scratch, name + '.json'), raw, { flag: 'wx', mode: 0o600 });
    } finally {
      await plain.close();
    }
    await rm(payload);
    const path = join(scratch, name);
    const dump = await open(path, 'r');
    let verified;
    try {
      await checkDump(dump);
      verified = await verifyArchive(path, dump);
      if (verified.manifest?.format !== 'fjstudio-backup-v2') throw new Error('Manifeste Studio v2 requis.');
    } finally {
      await dump.close();
    }
    await publish(scratch, destination, true);
    if (process.platform === 'win32') scratch = undefined; // The private directory itself has moved atomically.
    return { file: name, dumpBytes: verified.bytes, dumpSha256: verified.sha256 };
  } finally {
    await file.close();
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'key' && !args.length) {
      await setupVaultKey();
      console.log('Clé d’archive locale créée dans .env.archive.local.');
    } else if ((mode === 'pack' || mode === 'unpack') && args.length === 2) {
      const key = await readVaultKey();
      try {
        const result = await (mode === 'pack' ? packVault : unpackVault)(args[0], args[1], key);
        console.log(JSON.stringify({ event: 'vault.' + mode, ...result }));
      } finally {
        key.fill(0);
      }
    } else
      throw new Error('Utiliser key, pack <dump> <nouveau-coffre>, ou unpack <coffre> <nouveau-dossier>.');
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
