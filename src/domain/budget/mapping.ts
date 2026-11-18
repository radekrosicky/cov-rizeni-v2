// NÁVRH řádku záhlaví a významu sloupců podle slov v záhlaví. Jen návrh – potvrzuje vždy uživatel.
import type { Role, Row, SheetMapping } from "./types.ts";

const PATTERNS: [Role, RegExp][] = [
  ["unitPrice", /(jedn\.?\s*cena|j\.?\s*cena|cena\s*\/\s*m\.?\s*j|cena\s*za\s*(m\.?j|jedn)|jednotkov)/i],
  ["totalPrice", /(cena\s*celkem|celkem|celková\s*cena|^cena$|^cena\s*\(|cena\s*bez\s*dph|cena\s*s\s*dph)/i],
  ["quantity", /(množ|^počet|výměra|^mn\.?$|^qty)/i],
  ["unit", /(^m\.?\s*j\.?$|^mj$|jednotka|^jedn\.?$|^unit$)/i],
  ["code", /(kód|^číslo\s*pol|^č\.\s*pol|^pol\.?\s*č|^kod$|^code$)/i],
  ["description", /(popis|název|^text|^položka$|^description$)/i],
];

const textOf = (row: Row, col: string) => {
  const v = row[col]?.value;
  return typeof v === "string" ? v.trim() : "";
};

/** Kolik rolí řádek „vypadá jako záhlaví“. */
function headerScore(row: Row): { score: number; columns: Partial<Record<Role, string>> } {
  const columns: Partial<Record<Role, string>> = {};
  for (const col of Object.keys(row)) {
    const t = textOf(row, col);
    if (!t || t.length > 40) continue;
    for (const [role, re] of PATTERNS) {
      if (!columns[role] && re.test(t)) {
        columns[role] = col;
        break;
      }
    }
  }
  return { score: Object.keys(columns).length, columns };
}

/** Navrhne mapování pro list: řádek záhlaví s nejvíce rozpoznanými rolemi (min. popis + 1 další). */
export function suggestMapping(sheetName: string, rows: { rowNumber: number; cells: Row }[], scanRows = 30): SheetMapping {
  let best: { rowNumber: number; score: number; columns: Partial<Record<Role, string>> } | null = null;
  for (const r of rows.slice(0, scanRows)) {
    const h = headerScore(r.cells);
    if (h.columns.description && h.score >= 2 && (!best || h.score > best.score)) best = { rowNumber: r.rowNumber, ...h };
  }
  if (!best) return { sheetName, headerRow: null, firstDataRow: rows[0]?.rowNumber ?? 1, columns: {} };
  return { sheetName, headerRow: best.rowNumber, firstDataRow: best.rowNumber + 1, columns: best.columns };
}

/** Kontrola mapování před importem (srozumitelné chyby pro formulář). */
export function validateMapping(m: SheetMapping): string[] {
  const errors: string[] = [];
  if (!m.columns.description) errors.push(`List „${m.sheetName}“: vyberte sloupec s popisem položky.`);
  const used = Object.values(m.columns).filter(Boolean) as string[];
  if (new Set(used).size !== used.length) errors.push(`List „${m.sheetName}“: jeden sloupec je vybrán pro více významů.`);
  if (!Number.isInteger(m.firstDataRow) || m.firstDataRow < 1) errors.push(`List „${m.sheetName}“: neplatný první řádek s daty.`);
  for (const c of used) if (!/^[A-Z]{1,3}$/.test(c)) errors.push(`List „${m.sheetName}“: neplatný sloupec ${c}.`);
  return errors;
}
