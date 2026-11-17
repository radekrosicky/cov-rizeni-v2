// Místní úložiště pro VÝVOJ s fiktivními soubory: složka data/dev/files (mimo Git).
// Dočasné soubory: <root>/.tmp/<náhodné id>.part ; uložené soubory: <root>/<klíč>.
import { createHash, randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, StorageKeyExistsError, UploadTooLargeError, type FileStorage, type ReceivedFile } from "./fileStorage.ts";

export const DEFAULT_FILES_DIR = "data/dev/files";
const HEAD_BYTES = 4096;
const TEMP_RE = /^[0-9a-f-]{36}$/;

/** Složka souborů z FILES_DIR; smí ležet jen uvnitř ./data projektu. */
export function resolveFilesDir(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): string {
  const dataRoot = path.resolve(cwd, "data");
  const dir = path.resolve(cwd, env.FILES_DIR || DEFAULT_FILES_DIR);
  if (!dir.startsWith(dataRoot + path.sep)) throw new Error(`FILES_DIR musí ležet ve složce data/ projektu (zadáno: ${dir}).`);
  return dir;
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;
  private readonly tmpDir: string;

  constructor(root: string) {
    this.root = root;
    this.tmpDir = path.join(root, ".tmp");
  }

  private tempPath(tempId: string): string {
    if (!TEMP_RE.test(tempId)) throw new Error("Neplatný dočasný soubor.");
    return path.join(this.tmpDir, `${tempId}.part`);
  }

  private keyPath(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error(`Neplatný klíč souboru: ${key}`);
    return full;
  }

  async receive(body: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, limitBytes: number): Promise<ReceivedFile> {
    await fsp.mkdir(this.tmpDir, { recursive: true });
    const tempId = randomUUID();
    const file = this.tempPath(tempId);
    // „wx“ = vytvořit nový, nikdy nepřepsat.
    const handle = await fsp.open(file, "wx", 0o600);
    const hash = createHash("sha256");
    const head: number[] = [];
    let size = 0;
    try {
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > limitBytes) throw new UploadTooLargeError(limitBytes);
        if (head.length < HEAD_BYTES) head.push(...chunk.subarray(0, HEAD_BYTES - head.length));
        hash.update(chunk);
        let written = 0;
        while (written < chunk.byteLength) {
          const r = await handle.write(chunk, written, chunk.byteLength - written);
          written += r.bytesWritten;
        }
      }
      await handle.sync();
      await handle.close();
    } catch (e) {
      // Přerušené / příliš velké nahrání: dočasný soubor hned pryč.
      await handle.close().catch(() => {});
      await fsp.rm(file, { force: true });
      throw e;
    }
    return { tempId, sizeBytes: size, sha256: hash.digest("hex"), head: Uint8Array.from(head) };
  }

  async readTempRange(tempId: string, start: number, length: number): Promise<Uint8Array> {
    const handle = await fsp.open(this.tempPath(tempId), "r");
    try {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buf, 0, length, start);
      return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async commit(tempId: string, key: string): Promise<void> {
    const target = this.keyPath(key);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    try {
      // link() selže s EEXIST, pokud cíl existuje → existující soubor se nikdy nepřepíše.
      await fsp.link(this.tempPath(tempId), target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new StorageKeyExistsError(key);
      throw e;
    }
    await fsp.rm(this.tempPath(tempId), { force: true });
  }

  async discard(tempId: string): Promise<void> {
    await fsp.rm(this.tempPath(tempId), { force: true });
  }

  async rollbackCommitted(key: string): Promise<void> {
    await fsp.rm(this.keyPath(key), { force: true });
  }

  async openRead(key: string) {
    // Soubor se otevře hned – chybějící soubor se ohlásí zde, ne až při čtení.
    const handle = await fsp.open(this.keyPath(key), "r");
    const stat = await handle.stat();
    return { stream: handle.createReadStream({ autoClose: true }), sizeBytes: stat.size };
  }

  async cleanupStaleTemp(olderThanMs: number): Promise<number> {
    let removed = 0;
    const entries = await fsp.readdir(this.tmpDir).catch(() => [] as string[]);
    const now = Date.now();
    for (const name of entries) {
      if (!name.endsWith(".part")) continue;
      const file = path.join(this.tmpDir, name);
      const stat = await fsp.stat(file).catch(() => null);
      if (stat && now - stat.mtimeMs > olderThanMs) {
        await fsp.rm(file, { force: true });
        removed++;
      }
    }
    return removed;
  }

  async putNew(key: string, data: Uint8Array) {
    const received = await this.receive([data], data.byteLength + 1);
    await this.commit(received.tempId, key);
    return { sizeBytes: received.sizeBytes, sha256: received.sha256 };
  }
}
