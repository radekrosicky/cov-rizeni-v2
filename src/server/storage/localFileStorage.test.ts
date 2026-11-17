import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageKeyExistsError, UploadTooLargeError } from "./fileStorage.ts";
import { LocalFileStorage, resolveFilesDir } from "./localFileStorage.ts";

let root: string;
let storage: LocalFileStorage;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cov-storage-"));
  storage = new LocalFileStorage(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const tmpFiles = () => (fs.existsSync(path.join(root, ".tmp")) ? fs.readdirSync(path.join(root, ".tmp")) : []);
const enc = (s: string) => new TextEncoder().encode(s);

describe("místní úložiště", () => {
  it("přijme soubor, spočítá velikost a otisk, uloží na klíč a přečte zpět", async () => {
    const r = await storage.receive([enc("%PDF-"), enc("fiktivni")], 1000);
    expect(r.sizeBytes).toBe(13);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    await storage.commit(r.tempId, "projects/p1/r1");
    expect(tmpFiles()).toEqual([]);
    const { stream, sizeBytes } = await storage.openRead("projects/p1/r1");
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("%PDF-fiktivni");
    expect(sizeBytes).toBe(13);
  });

  it("NIKDY nepřepíše existující soubor", async () => {
    await storage.putNew("projects/p1/r1", enc("puvodni"));
    const r = await storage.receive([enc("nova data")], 1000);
    await expect(storage.commit(r.tempId, "projects/p1/r1")).rejects.toBeInstanceOf(StorageKeyExistsError);
    expect(fs.readFileSync(path.join(root, "projects/p1/r1"), "utf8")).toBe("puvodni");
  });

  it("překročení limitu přeruší příjem a dočasný soubor smaže", async () => {
    function* chunks() {
      for (let i = 0; i < 10; i++) yield new Uint8Array(100);
    }
    await expect(storage.receive(chunks(), 550)).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(tmpFiles()).toEqual([]);
  });

  it("přerušený přenos dočasný soubor smaže", async () => {
    async function* broken() {
      yield new Uint8Array(1000);
      throw new Error("spojení přerušeno");
    }
    await expect(storage.receive(broken(), 10_000)).rejects.toThrow(/přerušeno/);
    expect(tmpFiles()).toEqual([]);
  });

  it("klíč nemůže opustit složku úložiště", async () => {
    for (const key of ["../venku", "projects/../../venku", "/etc/passwd", "Projects/X", "projects//x", "projects/x/"]) {
      await expect(storage.putNew(key, enc("x"))).rejects.toThrow(/Neplatný klíč/);
    }
  });

  it("úklid starých dočasných souborů po pádu serveru", async () => {
    fs.mkdirSync(path.join(root, ".tmp"), { recursive: true });
    const old = path.join(root, ".tmp", "00000000-0000-0000-0000-000000000000.part");
    fs.writeFileSync(old, "x");
    fs.utimesSync(old, new Date(Date.now() - 2 * 3600_000), new Date(Date.now() - 2 * 3600_000));
    expect(await storage.cleanupStaleTemp(3600_000)).toBe(1);
    expect(tmpFiles()).toEqual([]);
  });

  it("složka úložiště musí ležet v data/ projektu", () => {
    expect(() => resolveFilesDir({ FILES_DIR: "/tmp/jinde" }, "/projekt")).toThrow(/data\//);
    expect(resolveFilesDir({}, "/projekt")).toBe("/projekt/data/dev/files");
  });
});
