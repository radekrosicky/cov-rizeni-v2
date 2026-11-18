import { describe, expect, it } from "vitest";
import { allocationOf, suggestedTake } from "./allocation.ts";
import { classifyRow } from "./classify.ts";
import { suggestMapping, validateMapping } from "./mapping.ts";
import { parseNumber } from "./numbers.ts";
import type { Row } from "./types.ts";
import { normalizeUnit } from "./units.ts";

describe("čísla z rozpočtu – nic se nevymýšlí", () => {
  it.each([
    [2, "numeric", "2"],
    ["48,5", "numeric", "48.5"],
    ["1 250,50", "numeric", "1250.5"],
    ["1.250,50", "numeric", "1250.5"],
    ["1,250.50", "numeric", "1250.5"],
    ["1.250.000", "numeric", "1250000"],
    ["0,125", "numeric", "0.125"],
    ["2100.000", "numeric", "2100"],
    ["1 250 Kč", "numeric", "1250"],
    [15006.000000000002, "numeric", "15006"],
    ["1.250", "ambiguous", null],
    ["12,500", "ambiguous", null],
    ["dle PD", "non_numeric", null],
    ["cca 5", "non_numeric", null],
    ["", "missing", null],
    [null, "missing", null],
  ])("%s → %s", (input, status, value) => {
    const r = parseNumber(input as never);
    expect([r.status, r.value]).toEqual([status, value]);
  });
});

describe("jednotky", () => {
  it("sjednotí známé, neznámé nechá původní", () => {
    expect(normalizeUnit("kus")).toEqual({ unit: "ks", known: true, raw: "kus" });
    expect(normalizeUnit("M3")).toMatchObject({ unit: "m³" });
    expect(normalizeUnit("hod")).toMatchObject({ unit: "h" });
    expect(normalizeUnit("bal.")).toEqual({ unit: null, known: false, raw: "bal." });
    expect(normalizeUnit(null)).toEqual({ unit: null, known: false, raw: null });
  });
});

describe("návrh sloupců", () => {
  const rows: { rowNumber: number; cells: Row }[] = [
    { rowNumber: 1, cells: { A: { value: "Rozpočet (fiktivní)" } } },
    { rowNumber: 3, cells: { A: { value: "Pol." }, B: { value: "Název položky" }, C: { value: "M.j." }, D: { value: "Výměra" }, E: { value: "J. cena" }, F: { value: "Cena celkem" } } },
  ];
  it("najde řádek záhlaví a význam sloupců", () => {
    expect(suggestMapping("L", rows)).toEqual({ sheetName: "L", headerRow: 3, firstDataRow: 4, columns: { description: "B", unit: "C", quantity: "D", unitPrice: "E", totalPrice: "F" } });
  });
  it("bez záhlaví nic nenavrhne (uživatel vybere sám)", () => {
    expect(suggestMapping("L", [rows[0]!]).columns).toEqual({});
  });
  it("kontrola mapování", () => {
    expect(validateMapping({ sheetName: "L", headerRow: 1, firstDataRow: 2, columns: { quantity: "B" } })[0]).toMatch(/popisem/);
    expect(validateMapping({ sheetName: "L", headerRow: 1, firstDataRow: 2, columns: { description: "A", quantity: "A" } })[0]).toMatch(/více významů/);
  });
});

describe("druh řádku", () => {
  const m = { sheetName: "L", headerRow: 1, firstDataRow: 2, columns: { description: "A", unit: "B", quantity: "C", unitPrice: "D", totalPrice: "E" } };
  const row = (d: string, u?: string, q?: number) => ({ A: { value: d }, ...(u ? { B: { value: u } } : {}), ...(q !== undefined ? { C: { value: q } } : {}) });
  it.each([
    ["Ponorné čerpadlo (fiktivní)", "ks", 2, "material"],
    ["Montáž dmychadla", "kpl", 1, "work"],
    ["Hodinová zúčtovací sazba", "h", 4, "work"],
    ["Revize elektroinstalace", "kpl", 1, "service"],
    ["Doprava materiálu", "kpl", 1, "service"],
    ["Díl 2: Dmychárna", undefined, undefined, "heading"],
    ["Mezisoučet dílu 1", undefined, 5, "subtotal"],
    ["Celkem", undefined, 5, "subtotal"],
  ])("%s → %s", (d, u, q, kind) => {
    expect(classifyRow("L", 5, row(d, u, q), m)!.kind).toBe(kind);
  });
  it("prázdný řádek se vynechá; množství × cena ≠ celkem k ruční kontrole", () => {
    expect(classifyRow("L", 5, {}, m)).toBeNull();
    const r = classifyRow("L", 5, { A: { value: "Ventil" }, B: { value: "ks" }, C: { value: 2 }, D: { value: 100 }, E: { value: 300 } }, m)!;
    expect(r.reviewReasons).toContain("Množství × jednotková cena neodpovídá ceně celkem");
  });
});

describe("rozdělení množství", () => {
  it("zbytek, překročení, nečíselná položka", () => {
    expect(allocationOf("10", ["6"])).toMatchObject({ budget: 10, taken: 6, remaining: 4, over: false, tracked: true });
    expect(allocationOf("10", ["6", "5"])).toMatchObject({ over: true, remaining: 0 });
    expect(allocationOf(null, [null])).toMatchObject({ budget: null, remaining: null, tracked: true });
    expect(suggestedTake("10", ["6"])).toBe("4");
    expect(suggestedTake(null, [])).toBeNull();
  });
});
