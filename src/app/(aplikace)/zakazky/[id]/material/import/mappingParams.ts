// Výběr listů a sloupců se přenáší v adrese stránky (formulář GET) – náhled se neukládá do databáze.
import { ROLES, type Role, type SheetMapping } from "@/domain/budget/types";

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Mapování z parametrů adresy; bez parametrů = návrh aplikace (listy s rozpoznaným záhlavím). */
export function mappingsFromParams(sp: SP, sheets: { name: string; hidden: boolean; suggestion: SheetMapping }[]): { chosen: boolean[]; mappings: SheetMapping[]; touched: boolean } {
  const touched = Object.keys(sp).some((k) => /^(s|f)\d+$/.test(k));
  const chosen = sheets.map((s, i) => (touched ? one(sp[`s${i}`]) === "1" : !s.hidden && s.suggestion.headerRow !== null));
  const mappings = sheets.map((s, i) => {
    if (!touched) return s.suggestion;
    const columns: Partial<Record<Role, string>> = {};
    for (const role of ROLES) {
      const c = one(sp[`c${i}.${role}`]).toUpperCase();
      if (/^[A-Z]{1,3}$/.test(c)) columns[role] = c;
    }
    const header = Number(one(sp[`h${i}`]));
    const first = Number(one(sp[`f${i}`]));
    return { sheetName: s.name, headerRow: Number.isInteger(header) && header > 0 ? header : null, firstDataRow: Number.isInteger(first) && first > 0 ? first : 1, columns };
  });
  return { chosen, mappings, touched };
}

/** Parametry adresy pro mapování (zpět z kontroly do náhledu). */
export function paramsOf(sheets: { name: string }[], chosen: boolean[], mappings: SheetMapping[]): URLSearchParams {
  const p = new URLSearchParams();
  sheets.forEach((_, i) => {
    const m = mappings[i]!;
    if (chosen[i]) p.set(`s${i}`, "1");
    else p.set(`s${i}`, "0");
    if (m.headerRow) p.set(`h${i}`, String(m.headerRow));
    p.set(`f${i}`, String(m.firstDataRow));
    for (const [role, col] of Object.entries(m.columns)) if (col) p.set(`c${i}.${role}`, col);
  });
  return p;
}
