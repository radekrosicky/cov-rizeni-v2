// Struktura sešitu XLSX čtená PŘÍMO z kontejneru (bez knihovny): listy, skryté listy, kontrola limitů,
// vzorce (s uloženým výsledkem / bez něj) a chybové hodnoty buněk. Knihovna read-excel-file tyto informace nevrací
// (chybu i vzorec bez výsledku vrací jako prázdnou buňku) – proto je zjišťujeme sami.
import zlib from "node:zlib";
import { BUDGET_LIMITS, LIMIT_MESSAGE } from "../../domain/budget/limits.ts";
import { parseCentralDirectory, parseEndOfCentralDirectory, type ZipEntry } from "../../domain/documents/zip.ts";

export class BudgetLimitError extends Error {
  constructor(detail: string) {
    super(`${LIMIT_MESSAGE} (${detail})`);
    this.name = "BudgetLimitError";
  }
}

export class BudgetFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetFormatError";
  }
}

export interface SheetInfo {
  name: string;
  hidden: boolean;
  path: string;
}

export interface CellFlags {
  formula: boolean;
  /** Vzorec má v souboru uložený výsledek. */
  hasValue: boolean;
  error?: string;
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeXml = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : XML_ENTITIES[e] ?? _,
);
const attrs = (tag: string) => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]!] = decodeXml(m[2]!);
  return out;
};

function entriesOf(buf: Uint8Array): Map<string, ZipEntry> {
  const tailLen = Math.min(buf.length, 22 + 0xffff);
  const dir = parseEndOfCentralDirectory(buf.subarray(buf.length - tailLen), buf.length);
  if (typeof dir === "string") throw new BudgetFormatError(dir);
  const entries = parseCentralDirectory(buf.subarray(dir.centralDirOffset, dir.centralDirOffset + dir.centralDirSize), dir.entryCount, buf.length);
  if (typeof entries === "string") throw new BudgetFormatError(entries);
  return new Map(entries.map((e) => [e.name, e]));
}

/** Rozbalí jednu položku kontejneru se stropem velikosti (skutečná velikost, ne údaj v souboru). */
function inflate(buf: Uint8Array, e: ZipEntry, maxBytes: number): Buffer {
  const nameLen = buf[e.localHeaderOffset + 26]! | (buf[e.localHeaderOffset + 27]! << 8);
  const extraLen = buf[e.localHeaderOffset + 28]! | (buf[e.localHeaderOffset + 29]! << 8);
  const start = e.localHeaderOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) {
    if (data.length > maxBytes) throw new BudgetLimitError("list je po rozbalení příliš velký");
    return Buffer.from(data);
  }
  try {
    return zlib.inflateRawSync(data, { maxOutputLength: Math.max(maxBytes, 1) });
  } catch (err) {
    if ((err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" || err instanceof RangeError) throw new BudgetLimitError("list je po rozbalení příliš velký");
    throw new BudgetFormatError("Soubor je poškozený a nelze ho přečíst.");
  }
}

export interface WorkbookStructure {
  sheets: SheetInfo[];
  /** Rozbalená velikost listů + sdílených textů (podle kontejneru). */
  uncompressedBytes: number;
}

/** Listy sešitu + kontrola limitů CELÉHO souboru (počet listů, rozbalená velikost). */
export function readStructure(buf: Uint8Array): WorkbookStructure {
  const entries = entriesOf(buf);
  const wb = entries.get("xl/workbook.xml");
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  if (!wb || !rels) throw new BudgetFormatError("Soubor není platný sešit Excel (XLSX).");
  const workbookXml = inflate(buf, wb, 4 * 1024 * 1024).toString("utf8");
  const relsXml = inflate(buf, rels, 4 * 1024 * 1024).toString("utf8");
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) targets.set(a.Id, a.Target.startsWith("/") ? a.Target.slice(1) : `xl/${a.Target}`);
  }
  const sheets: SheetInfo[] = [];
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const path = targets.get(a["r:id"] ?? "");
    if (!a.name || !path || !entries.has(path)) continue; // např. list s grafem – neobsahuje data
    sheets.push({ name: a.name, hidden: a.state === "hidden" || a.state === "veryHidden", path });
  }
  if (sheets.length === 0) throw new BudgetFormatError("Sešit neobsahuje žádný list s daty.");
  if (sheets.length > BUDGET_LIMITS.maxSheets) throw new BudgetLimitError(`${sheets.length} listů, nejvýše ${BUDGET_LIMITS.maxSheets}`);
  let total = entries.get("xl/sharedStrings.xml")?.uncompressedSize ?? 0;
  for (const s of sheets) total += entries.get(s.path)!.uncompressedSize;
  if (total > BUDGET_LIMITS.maxUncompressedBytes) {
    throw new BudgetLimitError(`${Math.round(total / 1024 / 1024)} MB dat po rozbalení, nejvýše ${BUDGET_LIMITS.maxUncompressedBytes / 1024 / 1024} MB`);
  }
  return { sheets, uncompressedBytes: total };
}

/** Vzorce a chybové hodnoty v listu: odkaz buňky (např. „G6“) → příznaky. */
export function scanSheetFlags(buf: Uint8Array, sheetPath: string): Map<string, CellFlags> {
  const entries = entriesOf(buf);
  const e = entries.get(sheetPath);
  if (!e) throw new BudgetFormatError("List v sešitu chybí.");
  const xml = inflate(buf, e, BUDGET_LIMITS.maxUncompressedBytes).toString("utf8");
  const flags = new Map<string, CellFlags>();
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(m[1] ?? "");
    const inner = m[2] ?? "";
    const isFormula = /<f\b/.test(inner);
    const isError = a.t === "e";
    if (!isFormula && !isError) continue;
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
    flags.set(a.r ?? "", {
      formula: isFormula,
      hasValue: !!v && v[1] !== "",
      ...(isError ? { error: v ? decodeXml(v[1]!) : "#CHYBA" } : {}),
    });
  }
  return flags;
}
