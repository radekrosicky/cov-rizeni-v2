// Rozpoznání řádku rozpočtu podle potvrzeného mapování: druh řádku, hodnoty a důvody ruční kontroly.
// Zásada: nic se nevymýšlí. Chybějící / nejednoznačné = prázdné + důvod. Druh řádku je jen NÁVRH (člověk ho může změnit).
import type { BudgetRowKind, QuantityStatus } from "../values.ts";
import { parseNumber } from "./numbers.ts";
import type { Cell, Row, SheetMapping } from "./types.ts";
import { normalizeUnit } from "./units.ts";

export interface ClassifiedRow {
  sheetName: string;
  rowNumber: number;
  rawCells: Row;
  kind: BudgetRowKind;
  code: string | null;
  description: string | null;
  unitRaw: string | null;
  unit: string | null;
  quantityRaw: string | null;
  quantity: string | null;
  quantityStatus: QuantityStatus;
  unitPriceRaw: string | null;
  unitPrice: string | null;
  totalPriceRaw: string | null;
  totalPrice: string | null;
  reviewReasons: string[];
}

const SUBTOTAL = /^(mezi)?součet|^celkem|^součet|rekapitulace|^total|^suma\b|^cena\s*celkem/i;
const WORK = /(montáž|demontáž|osazení|zemní\s*práce|výkop|zához|betonáž|svařování|instalace|práce|hodinová|přesun\s*hmot)/i;
const SERVICE = /(doprava|přeprava|revize|zkouš|projekt|dokumentace|geodet|zaměření|uvedení\s*do\s*provozu|zaškolení|školení|vrn|kompletační|inženýrská|dozor|zařízení\s*staveniště)/i;

function cellText(c: Cell | undefined): string | null {
  if (!c || c.value === null || c.value === "") return null;
  return String(c.value).trim() || null;
}

/** Hodnota buňky pro čísla: vzorec bez výsledku nebo chyba = nepoužitelná hodnota. */
function numericCell(c: Cell | undefined, label: string, reasons: string[], scale: number) {
  if (c?.error) {
    reasons.push(`${label}: chyba v Excelu ${c.error}`);
    return { status: "non_numeric" as QuantityStatus, value: null, raw: c.error };
  }
  if (c?.formula && (c.value === null || c.value === "")) {
    reasons.push(`${label}: vzorec bez uloženého výsledku`);
    return { status: "missing" as QuantityStatus, value: null, raw: null };
  }
  if (c?.date) {
    reasons.push(`${label}: obsahuje datum místo čísla`);
    return { status: "non_numeric" as QuantityStatus, value: null, raw: String(c.value) };
  }
  return parseNumber(c?.value ?? null, scale);
}

export function classifyRow(sheetName: string, rowNumber: number, cells: Row, m: SheetMapping): ClassifiedRow | null {
  const col = (role: keyof SheetMapping["columns"]) => (m.columns[role] ? cells[m.columns[role]!] : undefined);
  const reasons: string[] = [];
  const description = cellText(col("description"));
  const code = cellText(col("code"));
  const unitInfo = normalizeUnit(col("unit")?.value ?? null);
  const qty = numericCell(col("quantity"), "Množství", reasons, 4);
  const up = numericCell(col("unitPrice"), "Jednotková cena", reasons, 2);
  const tp = numericCell(col("totalPrice"), "Cena celkem", reasons, 2);

  const hasAny = Object.values(cells).some((c) => c.value !== null && c.value !== "" ) || Object.values(cells).some((c) => c.error || c.formula);
  if (!hasAny) return null; // prázdný řádek se neimportuje

  const hasNumbers = qty.status !== "missing" || up.status !== "missing" || tp.status !== "missing";
  let kind: BudgetRowKind;
  if (description && SUBTOTAL.test(description)) kind = "subtotal";
  else if (description && !hasNumbers && !unitInfo.raw) kind = "heading";
  else if (!description) kind = hasNumbers || unitInfo.raw ? "other" : "heading";
  // Služba dřív než práce: „Revize elektroinstalace“ je služba, i když obsahuje „instalace“.
  else if (SERVICE.test(description) && unitInfo.unit !== "h") kind = "service";
  else if (unitInfo.unit === "h" || WORK.test(description)) kind = "work";
  else kind = "material";

  const isItem = kind === "material" || kind === "work" || kind === "service" || kind === "other";
  // Důvody ruční kontroly jen u skutečných položek (nadpisy a mezisoučty se nesledují).
  const review = isItem ? reasons : [];
  if (isItem) {
    if (!description) review.push("Chybí popis položky");
    if (qty.status === "missing" && !reasons.some((r) => r.startsWith("Množství"))) review.push("Množství chybí");
    if (qty.status === "non_numeric" && !reasons.some((r) => r.startsWith("Množství"))) review.push(`Množství není číslo („${qty.raw}“)`);
    if (qty.status === "ambiguous") review.push(`Nejednoznačné množství „${qty.raw}“ (tisíce, nebo desetiny?)`);
    if (!unitInfo.raw) review.push("Chybí měrná jednotka");
    else if (!unitInfo.known) review.push(`Neznámá jednotka „${unitInfo.raw}“`);
    if (up.status === "ambiguous") review.push(`Nejednoznačná jednotková cena „${up.raw}“`);
    if (tp.status === "ambiguous") review.push(`Nejednoznačná cena celkem „${tp.raw}“`);
    if (up.status === "non_numeric" && !reasons.some((r) => r.startsWith("Jednotková"))) review.push(`Jednotková cena není číslo („${up.raw}“)`);
    if (tp.status === "non_numeric" && !reasons.some((r) => r.startsWith("Cena celkem"))) review.push(`Cena celkem není číslo („${tp.raw}“)`);
    if (qty.status === "numeric" && up.status === "numeric" && tp.status === "numeric") {
      const diff = Math.abs(Number(qty.value) * Number(up.value) - Number(tp.value));
      if (diff > 1) review.push("Množství × jednotková cena neodpovídá ceně celkem");
    }
    if (Number(qty.value) < 0) review.push("Záporné množství");
  }

  return {
    sheetName,
    rowNumber,
    rawCells: cells,
    kind,
    code,
    description,
    unitRaw: unitInfo.raw,
    unit: unitInfo.unit,
    quantityRaw: qty.status === "missing" ? null : qty.raw,
    quantity: qty.status === "numeric" ? qty.value : null,
    quantityStatus: qty.status,
    unitPriceRaw: up.raw,
    unitPrice: up.status === "numeric" ? up.value : null,
    totalPriceRaw: tp.raw,
    totalPrice: tp.status === "numeric" ? tp.value : null,
    reviewReasons: [...new Set(review)],
  };
}

export interface ImportSummary {
  items: number;
  material: number;
  work: number;
  service: number;
  other: number;
  headings: number;
  subtotals: number;
  needsReview: number;
}

export function summarize(rows: ClassifiedRow[]): ImportSummary {
  const by = (k: BudgetRowKind) => rows.filter((r) => r.kind === k).length;
  return {
    items: rows.filter((r) => !["heading", "subtotal"].includes(r.kind)).length,
    material: by("material"),
    work: by("work"),
    service: by("service"),
    other: by("other"),
    headings: by("heading"),
    subtotals: by("subtotal"),
    needsReview: rows.filter((r) => r.reviewReasons.length > 0).length,
  };
}
