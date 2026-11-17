// Bezpečný rozbor struktury ZIP kontejneru XLSX/DOCX (bez rozbalování na disk).
// Čisté funkce nad bajty: najdou konec centrálního adresáře a přečtou seznam položek.
// Skutečné rozbalení s limity provádí server (inspectOoxml) – deklarovaným velikostem se nevěří.

export interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ZipDirectory {
  entryCount: number;
  centralDirSize: number;
  centralDirOffset: number;
}

/** Limity kontejneru Office (ochrana proti „zip bombám“ a podvrženým souborům). */
export const OOXML_LIMITS = {
  maxEntries: 2000,
  maxCentralDirBytes: 4 * 1024 * 1024,
  /** Součet SKUTEČNĚ rozbalených dat. */
  maxTotalUncompressed: 300 * 1024 * 1024,
  maxEntryUncompressed: 150 * 1024 * 1024,
  /** Maximální poměr rozbaleno / zabaleno u jedné položky. */
  maxRatio: 200,
  maxNameLength: 512,
} as const;

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/** Najde záznam „End of Central Directory“ v posledních bajtech souboru. */
export function parseEndOfCentralDirectory(tail: Uint8Array, fileSize: number): ZipDirectory | string {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) !== 0x06054b50) continue;
    const disk = u16(tail, i + 4);
    const cdDisk = u16(tail, i + 6);
    const entriesThisDisk = u16(tail, i + 8);
    const entryCount = u16(tail, i + 10);
    const centralDirSize = u32(tail, i + 12);
    const centralDirOffset = u32(tail, i + 16);
    if (disk !== 0 || cdDisk !== 0 || entriesThisDisk !== entryCount) return "Vícedílný archiv není podporován.";
    if (entryCount === 0xffff || centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff) return "Formát ZIP64 není podporován.";
    if (entryCount > OOXML_LIMITS.maxEntries) return "Soubor obsahuje příliš mnoho částí.";
    if (centralDirSize > OOXML_LIMITS.maxCentralDirBytes) return "Neplatná struktura souboru.";
    if (centralDirOffset + centralDirSize > fileSize) return "Neplatná struktura souboru.";
    return { entryCount, centralDirSize, centralDirOffset };
  }
  return "Soubor není platný dokument Office.";
}

export function parseCentralDirectory(cd: Uint8Array, expectedEntries: number, fileSize: number): ZipEntry[] | string {
  const entries: ZipEntry[] = [];
  let o = 0;
  for (let n = 0; n < expectedEntries; n++) {
    if (o + 46 > cd.length || u32(cd, o) !== 0x02014b50) return "Neplatná struktura souboru.";
    const flags = u16(cd, o + 8);
    const method = u16(cd, o + 10);
    const compressedSize = u32(cd, o + 20);
    const uncompressedSize = u32(cd, o + 24);
    const nameLen = u16(cd, o + 28);
    const extraLen = u16(cd, o + 30);
    const commentLen = u16(cd, o + 32);
    const localHeaderOffset = u32(cd, o + 42);
    if (nameLen === 0 || nameLen > OOXML_LIMITS.maxNameLength || o + 46 + nameLen > cd.length) return "Neplatná struktura souboru.";
    const name = new TextDecoder("utf-8", { fatal: false }).decode(cd.subarray(o + 46, o + 46 + nameLen));
    if (localHeaderOffset + 30 > fileSize) return "Neplatná struktura souboru.";
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localHeaderOffset });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Kontrola seznamu položek – vrací důvod odmítnutí, nebo null. */
export function checkOoxmlEntries(entries: readonly ZipEntry[], kind: "xlsx" | "docx"): string | null {
  const names = new Set<string>();
  let declaredTotal = 0;
  for (const e of entries) {
    if (e.flags & 0x1) return "Šifrované (heslem chráněné) soubory nejsou povolené.";
    if (e.method !== 0 && e.method !== 8) return "Nepodporovaný způsob komprese.";
    if (e.name.startsWith("/") || e.name.includes("\\") || e.name.split("/").includes("..") || /[\u0000-\u001f]/.test(e.name)) {
      return "Soubor obsahuje nebezpečné názvy částí.";
    }
    if (/(^|\/)vbaProject\.bin$/i.test(e.name) || /vbaData\.xml$/i.test(e.name)) return "Soubory s makry nejsou povolené.";
    if (e.uncompressedSize > OOXML_LIMITS.maxEntryUncompressed) return "Obsah souboru je po rozbalení příliš velký.";
    if (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > OOXML_LIMITS.maxRatio) return "Podezřele vysoký poměr komprese.";
    if (names.has(e.name)) return "Soubor obsahuje duplicitní části.";
    names.add(e.name);
    declaredTotal += e.uncompressedSize;
  }
  if (declaredTotal > OOXML_LIMITS.maxTotalUncompressed) return "Obsah souboru je po rozbalení příliš velký.";
  if (!names.has("[Content_Types].xml")) return "Soubor není platný dokument Office.";
  const main = kind === "xlsx" ? "xl/workbook.xml" : "word/document.xml";
  if (!names.has(main)) return kind === "xlsx" ? "Soubor není platný sešit Excel (XLSX)." : "Soubor není platný dokument Word (DOCX).";
  return null;
}

/** Kontrola [Content_Types].xml: hlavní část musí odpovídat XLSX/DOCX bez maker. */
export function checkContentTypesXml(xml: string, kind: "xlsx" | "docx"): string | null {
  if (/macroEnabled|vbaProject/i.test(xml)) return "Soubory s makry nejsou povolené.";
  const expected =
    kind === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  return xml.includes(expected) ? null : kind === "xlsx" ? "Soubor není platný sešit Excel (XLSX)." : "Soubor není platný dokument Word (DOCX).";
}
