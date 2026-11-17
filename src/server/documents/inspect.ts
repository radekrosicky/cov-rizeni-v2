// Ověření nahraného souboru PODLE OBSAHU před uložením.
// XLSX/DOCX (ZIP kontejner): rozbor struktury + SKUTEČNÉ rozbalení po částech v paměti s limity
// (deklarovaným velikostem se nevěří) – ochrana proti „zip bombám“ a podvrženým souborům. Nic se nerozbaluje na disk.
import zlib from "node:zlib";
import { extensionMatches, extensionOf, ooxmlKindForExtension, sniffFileKind } from "../../domain/documents/fileKinds.ts";
import {
  checkContentTypesXml,
  checkOoxmlEntries,
  OOXML_LIMITS,
  parseCentralDirectory,
  parseEndOfCentralDirectory,
  type ZipEntry,
} from "../../domain/documents/zip.ts";
import type { FileKind } from "../../domain/values.ts";
import type { FileStorage, ReceivedFile } from "../storage/fileStorage.ts";

export type InspectResult = { ok: true; kind: FileKind } | { ok: false; message: string };

const fail = (message: string): InspectResult => ({ ok: false, message });
const CHUNK = 1024 * 1024;

export async function inspectUploadedFile(storage: FileStorage, file: ReceivedFile, filename: string): Promise<InspectResult> {
  if (file.sizeBytes === 0) return fail("Soubor je prázdný.");
  const sniffed = sniffFileKind(file.head);
  if (sniffed === null) return fail(`Tento typ souboru není povolený (zjištěno podle obsahu${extensionOf(filename) ? `, přípona .${extensionOf(filename)}` : ""}). Povolené: PDF, XLSX, DOCX, JPG, PNG, WEBP, HEIC, TIFF, DWG, DXF.`);
  if (sniffed === "ooxml") {
    const expected = ooxmlKindForExtension(filename);
    if (!expected) return fail("Archivy ZIP nejsou povolené. Nahrajte jednotlivé soubory.");
    const problem = await inspectOoxml(storage, file, expected);
    return problem ? fail(problem) : { ok: true, kind: expected };
  }
  if (!extensionMatches(sniffed, filename)) {
    return fail("Přípona souboru neodpovídá jeho skutečnému obsahu. Soubor byl odmítnut.");
  }
  return { ok: true, kind: sniffed };
}

async function inspectOoxml(storage: FileStorage, file: ReceivedFile, kind: "xlsx" | "docx"): Promise<string | null> {
  const size = file.sizeBytes;
  const tailLen = Math.min(size, 22 + 0xffff);
  const tail = await storage.readTempRange(file.tempId, size - tailLen, tailLen);
  const dir = parseEndOfCentralDirectory(tail, size);
  if (typeof dir === "string") return dir;
  const cd = await storage.readTempRange(file.tempId, dir.centralDirOffset, dir.centralDirSize);
  const entries = parseCentralDirectory(cd, dir.entryCount, size);
  if (typeof entries === "string") return entries;
  const structural = checkOoxmlEntries(entries, kind);
  if (structural) return structural;

  let total = 0;
  let contentTypesXml = "";
  for (const e of entries) {
    const r = await inflateEntry(storage, file, e, OOXML_LIMITS.maxTotalUncompressed - total, e.name === "[Content_Types].xml");
    if (typeof r === "string") return r;
    total += r.size;
    if (r.text !== null) contentTypesXml = r.text;
  }
  return checkContentTypesXml(contentTypesXml, kind);
}

/** Rozbalí jednu položku po částech a jen počítá bajty (u [Content_Types].xml uschová text, max. 1 MB). */
async function inflateEntry(
  storage: FileStorage,
  file: ReceivedFile,
  e: ZipEntry,
  remainingBudget: number,
  keepText: boolean,
): Promise<{ size: number; text: string | null } | string> {
  const lh = await storage.readTempRange(file.tempId, e.localHeaderOffset, 30);
  if (lh.length < 30 || (lh[0]! | (lh[1]! << 8) | (lh[2]! << 16) | (lh[3]! << 24)) >>> 0 !== 0x04034b50) return "Neplatná struktura souboru.";
  const nameLen = lh[26]! | (lh[27]! << 8);
  const extraLen = lh[28]! | (lh[29]! << 8);
  const start = e.localHeaderOffset + 30 + nameLen + extraLen;
  if (start + e.compressedSize > file.sizeBytes) return "Neplatná struktura souboru.";
  const limit = Math.min(e.uncompressedSize, OOXML_LIMITS.maxEntryUncompressed, remainingBudget);

  let produced = 0;
  const textParts: Buffer[] = [];
  const tooBig = "Obsah souboru je po rozbalení větší, než soubor uvádí, nebo příliš velký.";

  if (e.method === 0) {
    if (e.compressedSize !== e.uncompressedSize || e.compressedSize > limit) return tooBig;
    if (keepText) textParts.push(Buffer.from(await storage.readTempRange(file.tempId, start, Math.min(e.compressedSize, 1024 * 1024))));
    return { size: e.compressedSize, text: keepText ? Buffer.concat(textParts).toString("utf8") : null };
  }

  const inflater = zlib.createInflateRaw();
  let aborted = false;
  const done = new Promise<string | null>((resolve) => {
    inflater.on("data", (chunk: Buffer) => {
      produced += chunk.length;
      if (produced > limit) {
        aborted = true;
        inflater.destroy();
        resolve(tooBig);
        return;
      }
      if (keepText && produced <= 1024 * 1024) textParts.push(chunk);
    });
    inflater.on("end", () => resolve(null));
    inflater.on("error", () => resolve(aborted ? tooBig : "Poškozený nebo neplatný dokument Office."));
  });
  for (let off = 0; off < e.compressedSize && !aborted; off += CHUNK) {
    const part = await storage.readTempRange(file.tempId, start + off, Math.min(CHUNK, e.compressedSize - off));
    // Čekání na „drain“ končí i při přerušení (destroy), aby se nic nezaseklo.
    if (!inflater.write(part)) await Promise.race([new Promise((r) => inflater.once("drain", r)), done]);
  }
  if (!aborted) inflater.end();
  const problem = await done;
  if (problem) return problem;
  if (produced !== e.uncompressedSize) return "Poškozený nebo neplatný dokument Office.";
  return { size: produced, text: keepText ? Buffer.concat(textParts).toString("utf8") : null };
}
