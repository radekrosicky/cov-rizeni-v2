// Převod čísel z rozpočtu. NIC SE NEVYMÝŠLÍ: nejednoznačný zápis zůstane bez čísla a jde k ruční kontrole.
import type { QuantityStatus } from "../values.ts";

export interface ParsedNumber {
  status: QuantityStatus;
  /** Desetinné číslo jako text (pro přesné uložení), jen u status = numeric. */
  value: string | null;
  /** Původní text (nebo číslo převedené na text), null = prázdné. */
  raw: string | null;
}

/** Zaokrouhlí artefakty plovoucí čárky (např. 15006.000000000002) na daný počet míst. */
function fixed(n: number, scale: number): string {
  const s = n.toFixed(scale);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/**
 * Česká i anglická čísla: „2“, „48,5“, „1 250,50“, „1.250,50“, „1,250.50“, „-3“.
 * Nejednoznačné: „1.250“ / „1,250“ (tisíce, nebo desetiny?) → ambiguous.
 * Text bez čísla („dle PD“, „cca 5“) → non_numeric.
 */
export function parseNumber(input: string | number | boolean | null | undefined, scale = 4): ParsedNumber {
  if (input === null || input === undefined || input === "") return { status: "missing", value: null, raw: null };
  if (typeof input === "boolean") return { status: "non_numeric", value: null, raw: String(input) };
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { status: "non_numeric", value: null, raw: String(input) };
    return { status: "numeric", value: fixed(input, scale), raw: String(input) };
  }
  const raw = input;
  let s = input.replace(/[  \s]/g, "").replace(/(Kč|CZK|EUR|€)$/i, "");
  if (s === "") return { status: "missing", value: null, raw: null };
  if (!/^[-+]?[\d.,]+$/.test(s)) return { status: "non_numeric", value: null, raw };
  const neg = s.startsWith("-");
  s = s.replace(/^[-+]/, "");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized: string;
  if (hasDot && hasComma) {
    // Poslední oddělovač je desetinný, ten druhý tisícový.
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    if (s.split(dec).length !== 2) return { status: "ambiguous", value: null, raw };
    const [intPart, decPart] = s.split(dec) as [string, string];
    if (!/^\d{1,3}([.,]\d{3})*$/.test(intPart) || intPart.includes(dec) || !intPart.split(thou).slice(1).every((g) => g.length === 3)) {
      return { status: "ambiguous", value: null, raw };
    }
    normalized = intPart.split(thou).join("") + "." + decPart;
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = s.split(sep);
    if (parts.length > 2) {
      // „1.250.000“ – jen tisíce, pokud všechny skupiny mají 3 číslice.
      if (parts.slice(1).every((p) => p.length === 3) && parts[0]!.length <= 3) normalized = parts.join("");
      else return { status: "ambiguous", value: null, raw };
    } else if (parts[1]!.length === 3 && parts[0]!.length <= 3 && parts[0] !== "0") {
      // „1.250“ nebo „1,250“ – tisíce, nebo desetinné číslo? Nevymýšlet.
      return { status: "ambiguous", value: null, raw };
    } else {
      normalized = parts[0] + "." + parts[1];
    }
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || normalized === "." || normalized === "") return { status: "non_numeric", value: null, raw };
  return { status: "numeric", value: fixed(neg ? -n : n, scale), raw };
}
