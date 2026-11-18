// SAMOSTATNÝ PROCES pro čtení Excelového rozpočtu (spouští ho reader.ts, nikdy běžící aplikace přímo).
// Pád, vyčerpání paměti nebo zaseknutí tohoto procesu neohrozí aplikaci – ta ho jen ukončí a ohlásí chybu.
//
// Použití: node readerProcess.ts <preview|extract> <cesta k souboru>   (u „extract“ mapování na stdin jako JSON)
// Výstup: jediný řádek JSON na stdout: { ok: true, ... } nebo { ok: false, kind, message }.
import fs from "node:fs";
import readExcelFile from "read-excel-file/node";
import { classifyRow, summarize, type ClassifiedRow } from "../../domain/budget/classify.ts";
import { BUDGET_LIMITS } from "../../domain/budget/limits.ts";
import { suggestMapping, validateMapping } from "../../domain/budget/mapping.ts";
import type { Cell, Row, SheetMapping } from "../../domain/budget/types.ts";
import { BudgetFormatError, BudgetLimitError, readStructure, scanSheetFlags, type CellFlags } from "./xlsxStructure.ts";

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function toCell(v: unknown, flags: CellFlags | undefined): Cell | null {
  let cell: Cell;
  if (v instanceof Date) cell = { value: v.toISOString().slice(0, 10), date: true };
  else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") cell = { value: v };
  else cell = { value: null };
  if (flags?.formula) {
    cell.formula = true;
    if (!flags.hasValue) cell.value = null; // výsledek není v souboru uložen – nevymýšlet
  }
  if (flags?.error) {
    cell.error = flags.error;
    cell.value = null;
  }
  return cell.value === null && !cell.formula && !cell.error ? null : cell;
}

interface ReadSheet {
  name: string;
  hidden: boolean;
  rowCount: number;
  colCount: number;
  rows: { rowNumber: number; cells: Row }[];
}

async function readAll(file: string, onlySheets?: Set<string>): Promise<ReadSheet[]> {
  const buf = fs.readFileSync(file);
  const structure = readStructure(buf); // limity celého souboru PŘED čtením knihovnou
  const data = await readExcelFile(buf);
  const out: ReadSheet[] = [];
  let totalRows = 0;
  let totalCells = 0;
  for (const info of structure.sheets) {
    const sheet = data.find((s) => s.sheet === info.name);
    if (!sheet) continue;
    const width = sheet.data.reduce((w, r) => Math.max(w, r.length), 0);
    if (sheet.data.length > BUDGET_LIMITS.maxRowsPerSheet) throw new BudgetLimitError(`list „${info.name}“ má ${sheet.data.length} řádků, nejvýše ${BUDGET_LIMITS.maxRowsPerSheet}`);
    if (width > BUDGET_LIMITS.maxColumnsPerSheet) throw new BudgetLimitError(`list „${info.name}“ má ${width} sloupců, nejvýše ${BUDGET_LIMITS.maxColumnsPerSheet}`);
    totalRows += sheet.data.length;
    totalCells += sheet.data.length * width;
    if (totalRows > BUDGET_LIMITS.maxRowsTotal) throw new BudgetLimitError(`celkem více než ${BUDGET_LIMITS.maxRowsTotal} řádků ve všech listech`);
    if (totalCells > BUDGET_LIMITS.maxCellsTotal) throw new BudgetLimitError(`celkem více než ${BUDGET_LIMITS.maxCellsTotal} buněk ve všech listech`);
    if (onlySheets && !onlySheets.has(info.name)) {
      out.push({ name: info.name, hidden: info.hidden, rowCount: sheet.data.length, colCount: width, rows: [] });
      continue;
    }
    const flags = scanSheetFlags(buf, info.path);
    const rows: ReadSheet["rows"] = [];
    sheet.data.forEach((r, ri) => {
      const cells: Row = {};
      const rowNumber = ri + 1;
      for (let ci = 0; ci < width; ci++) {
        const letter = columnLetter(ci);
        const c = toCell(r[ci] ?? null, flags.get(`${letter}${rowNumber}`));
        if (c) cells[letter] = c;
      }
      // Buňky, které knihovna vynechala úplně (např. vzorec bez výsledku na konci řádku).
      for (const [ref, f] of flags) {
        const m = /^([A-Z]+)(\d+)$/.exec(ref);
        if (m && Number(m[2]) === rowNumber && !cells[m[1]!]) {
          const c = toCell(null, f);
          if (c) cells[m[1]!] = c;
        }
      }
      if (Object.keys(cells).length) rows.push({ rowNumber, cells });
    });
    out.push({ name: info.name, hidden: info.hidden, rowCount: sheet.data.length, colCount: width, rows });
  }
  return out;
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!file || (mode !== "preview" && mode !== "extract")) throw new BudgetFormatError("Neplatné volání čtečky rozpočtu.");
  if (mode === "preview") {
    const sheets = await readAll(file);
    return {
      ok: true,
      sheets: sheets.map((s) => ({
        name: s.name,
        hidden: s.hidden,
        rowCount: s.rowCount,
        colCount: s.colCount,
        nonEmptyRows: s.rows.length,
        suggestion: suggestMapping(s.name, s.rows),
        previewRows: s.rows.slice(0, BUDGET_LIMITS.previewRows),
      })),
    };
  }
  const mappings = JSON.parse(fs.readFileSync(0, "utf8")) as SheetMapping[];
  const errors = mappings.flatMap(validateMapping);
  if (!mappings.length) errors.push("Vyberte alespoň jeden list.");
  if (errors.length) return { ok: false, kind: "mapping", message: errors.join(" ") };
  const sheets = await readAll(file, new Set(mappings.map((m) => m.sheetName)));
  const rows: ClassifiedRow[] = [];
  for (const m of mappings) {
    const s = sheets.find((x) => x.name === m.sheetName);
    if (!s) return { ok: false, kind: "mapping", message: `List „${m.sheetName}“ v souboru není.` };
    for (const r of s.rows) {
      if (r.rowNumber < m.firstDataRow) continue;
      const c = classifyRow(s.name, r.rowNumber, r.cells, m);
      if (c) rows.push(c);
    }
  }
  return { ok: true, rows, summary: summarize(rows) };
}

main()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((e: unknown) => {
    const kind = e instanceof BudgetLimitError ? "limit" : e instanceof BudgetFormatError ? "format" : "format";
    const message = e instanceof BudgetLimitError || e instanceof BudgetFormatError ? e.message : "Soubor se nepodařilo přečíst jako sešit Excel (může být poškozený).";
    process.stdout.write(JSON.stringify({ ok: false, kind, message }));
  });
