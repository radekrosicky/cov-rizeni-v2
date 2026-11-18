// Generátor FIKTIVNÍCH položkových rozpočtů XLSX (vývoj a testy; R9 – žádné skutečné rozpočty).
// Záměrně „nepořádné“ jako skutečné rozpočty dodavatelů: více listů, různé názvy a pořadí sloupců,
// nadpisy dílů, mezisoučty, vzorce (s uloženým výsledkem i bez něj), chybové hodnoty, čísla zapsaná textem,
// sloučené buňky a skrytý list.
import { makeZip, type ZipFileSpec } from "./fictiveFiles.ts";

export type FictiveCell =
  | string
  | number
  | null
  | { formula: string; result?: number | string | null }
  | { error: string }
  | { date: string };

export interface FictiveSheet {
  name: string;
  rows: FictiveCell[][];
  hidden?: boolean;
  /** Sloučené oblasti, např. „A1:F1“. */
  merges?: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excelové pořadové číslo dne (1900 systém) z data RRRR-MM-DD. */
function excelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function cellXml(ref: string, c: FictiveCell): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "number") return `<c r="${ref}"><v>${c}</v></c>`;
  if (typeof c === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
  if ("error" in c) return `<c r="${ref}" t="e"><v>${esc(c.error)}</v></c>`;
  if ("date" in c) return `<c r="${ref}" s="1"><v>${excelSerial(c.date)}</v></c>`;
  const f = `<f>${esc(c.formula)}</f>`;
  if (c.result === undefined || c.result === null) return `<c r="${ref}">${f}</c>`; // vzorec BEZ uloženého výsledku
  if (typeof c.result === "string") return `<c r="${ref}" t="str">${f}<v>${esc(c.result)}</v></c>`;
  return `<c r="${ref}">${f}<v>${c.result}</v></c>`;
}

function sheetXml(sheet: FictiveSheet): string {
  const rows = sheet.rows
    .map((row, ri) => {
      const cells = row.map((c, ci) => cellXml(`${columnLetter(ci)}${ri + 1}`, c)).join("");
      return cells ? `<row r="${ri + 1}">${cells}</row>` : "";
    })
    .join("");
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData>${merges}</worksheet>`;
}

/** Sestaví XLSX ze zadaných listů (inline texty, styl 1 = datum). */
export function buildXlsx(sheets: FictiveSheet[]): Uint8Array {
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("")}</Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  // Styl 1 = datum (numFmtId 14), aby se datum dalo rozpoznat.
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`;
  const files: ZipFileSpec[] = [
    { name: "[Content_Types].xml", data: ct },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: wbRels },
    { name: "xl/styles.xml", data: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return makeZip(files);
}

/** Fiktivní položkový rozpočet ČOV – dva dodavatelé (různé struktury), rekapitulace a skrytý list. */
export function fictiveBudgetSheets(): FictiveSheet[] {
  return [
    {
      name: "Rekapitulace",
      rows: [
        ["FIKTIVNÍ POLOŽKOVÝ ROZPOČET – ČOV Fiktivín (smyšlený)"],
        ["Díl", "Celkem bez DPH"],
        ["SO 01 Technologie", { formula: "'SO 01 Technologie'!G15", result: 1458356.0 }],
        ["SO 02 Elektro", { formula: "'SO 02 Elektro'!E9" }],
      ],
      merges: ["A1:F1"],
    },
    {
      name: "SO 01 Technologie",
      rows: [
        ["Stavba: ČOV Fiktivín – intenzifikace (smyšlená)"],
        ["Datum rozpočtu:", { date: "2026-09-10" }],
        [],
        ["Č.", "Kód položky", "Popis položky", "MJ", "Množství", "Jedn. cena", "Cena celkem"],
        [null, null, "Díl 1: Čerpací stanice"],
        [1, "TECH-001", "Ponorné kalové čerpadlo Qmax 12 l/s, 4 kW (fiktivní)", "ks", 2, 145000, { formula: "E6*F6", result: 290000 }],
        [2, "TECH-002", "Těsnění příruby DN100", "kus", "12", "1 250,50", { formula: "E7*F7", result: 15006 }],
        [3, "TECH-003", "Potrubí nerez DN150", "m", 48.5, 2100, 101850],
        [4, "TECH-004", "Spojovací materiál", "bal.", "dle PD", 3500, null],
        [5, "TECH-005", "Montáž čerpadel", "hod", 24, 650, { formula: "E10*F10", result: 15600 }],
        [null, null, "Díl 2: Dmychárna"],
        [6, "TECH-006", "Dmychadlo Q=600 m3/h, 15 kW (fiktivní)", "ks", 2, 485000, { formula: "E12*F12", result: 970000 }],
        [7, "TECH-007", "Doprava technologie na stavbu", "kpl", 1, 65900, 65900],
        [8, "TECH-008", "Ventil kulový DN50", "ks", "1.250", 800, { error: "#REF!" }],
        [null, null, "Mezisoučet SO 01", null, null, null, { formula: "SUM(G6:G14)", result: 1458356 }],
      ],
      merges: ["A1:G1"],
    },
    {
      // Jiný dodavatel – jiné názvy i pořadí sloupců, záhlaví na 2. řádku.
      name: "SO 02 Elektro",
      rows: [
        ["Rozpočet elektro (fiktivní dodavatel)"],
        ["Název položky", "Počet", "M.j.", "Cena/MJ", "Cena"],
        ["Rozvaděč RM1 pro čerpací stanici", 1, "ks", 98000, 98000],
        ["Kabel CYKY 5x4", 120, "m", 85, 10200],
        ["Kabel CYKY 5x4 – rezerva", 20, "m", 85, { formula: "B5*D5" }],
        ["Revize elektroinstalace", 1, "kpl", 12500, 12500],
        ["Zemní práce pro kabelové vedení", 35, "m", 420, 14700],
        [],
        ["Celkem", null, null, null, { formula: "SUM(E3:E7)", result: 135400 }],
      ],
    },
    { name: "Pomocný výpočet", hidden: true, rows: [["skrytý pomocný list (fiktivní)"], [1, 2, 3]] },
  ];
}

export function fictiveBudgetXlsx(): Uint8Array {
  return buildXlsx(fictiveBudgetSheets());
}
