// Čtení Excelu v SAMOSTATNÉM PROCESU: správné hodnoty, limity jednoho listu i celého souboru,
// poškozené a neobvyklé soubory, a hlavně: chyba / paměť / čas v procesu čtečky NESHODÍ aplikaci.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUDGET_LIMITS } from "../../domain/budget/limits.ts";
import { buildXlsx, fictiveBudgetXlsx, type FictiveSheet } from "../seed/fictiveBudget.ts";
import { fictivePdf, makeZip } from "../seed/fictiveFiles.ts";
import { extractBudgetFile, previewBudgetFile, READER_LIMITS } from "./reader.ts";

let dir: string;
const write = (name: string, data: Uint8Array) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, data);
  return f;
};
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-reader-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const T = { timeout: 60_000 };
const technologie = { sheetName: "SO 01 Technologie", headerRow: 4, firstDataRow: 5, columns: { code: "B", description: "C", unit: "D", quantity: "E", unitPrice: "F", totalPrice: "G" } };
const elektro = { sheetName: "SO 02 Elektro", headerRow: 2, firstDataRow: 3, columns: { description: "A", quantity: "B", unit: "C", unitPrice: "D", totalPrice: "E" } };

describe("fiktivní rozpočet – náhled a rozpoznání", () => {
  it("náhled: listy, skrytý list, počty řádků a navržené sloupce u dvou různých struktur", T, async () => {
    const r = await previewBudgetFile(write("rozpocet.xlsx", fictiveBudgetXlsx()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sheets.map((s) => [s.name, s.hidden])).toEqual([
      ["Rekapitulace", false],
      ["SO 01 Technologie", false],
      ["SO 02 Elektro", false],
      ["Pomocný výpočet", true],
    ]);
    const tech = r.sheets.find((s) => s.name === "SO 01 Technologie")!;
    expect(tech.suggestion).toMatchObject({ headerRow: 4, firstDataRow: 5, columns: technologie.columns });
    expect(r.sheets.find((s) => s.name === "SO 02 Elektro")!.suggestion.columns).toEqual(elektro.columns);
    // Původní hodnoty beze změny, čísla řádků odpovídají Excelu.
    const row7 = tech.previewRows.find((x) => x.rowNumber === 7)!;
    expect(row7.cells.F).toEqual({ value: "1 250,50" });
    expect(row7.cells.G).toEqual({ value: 15006, formula: true });
  });

  it("rozpoznání: druhy řádků, čísla, jednotky, vzorce a chyby Excelu k ruční kontrole", T, async () => {
    const r = await extractBudgetFile(write("rozpocet2.xlsx", fictiveBudgetXlsx()), [technologie, elektro]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const by = (sheet: string, row: number) => r.rows.find((x) => x.sheetName === sheet && x.rowNumber === row)!;
    expect(by("SO 01 Technologie", 5).kind).toBe("heading");
    expect(by("SO 01 Technologie", 6)).toMatchObject({ kind: "material", quantity: "2", unit: "ks", unitPrice: "145000", totalPrice: "290000", reviewReasons: [] });
    expect(by("SO 01 Technologie", 7)).toMatchObject({ unit: "ks", unitRaw: "kus", quantity: "12", unitPrice: "1250.5", unitPriceRaw: "1 250,50" });
    expect(by("SO 01 Technologie", 9)).toMatchObject({ quantityStatus: "non_numeric", quantity: null, quantityRaw: "dle PD" });
    expect(by("SO 01 Technologie", 9).reviewReasons).toEqual(expect.arrayContaining([expect.stringMatching(/bal\./)]));
    expect(by("SO 01 Technologie", 10)).toMatchObject({ kind: "work", unit: "h" });
    expect(by("SO 01 Technologie", 13).kind).toBe("service");
    expect(by("SO 01 Technologie", 14)).toMatchObject({ quantityStatus: "ambiguous", quantity: null, totalPrice: null });
    expect(by("SO 01 Technologie", 14).reviewReasons.join(" ")).toMatch(/#REF!.*Nejednoznačné|Nejednoznačné.*#REF!/);
    expect(by("SO 01 Technologie", 15).kind).toBe("subtotal");
    expect(by("SO 02 Elektro", 5).reviewReasons).toContain("Cena celkem: vzorec bez uloženého výsledku");
    expect(by("SO 02 Elektro", 6).kind).toBe("service");
    expect(r.summary).toMatchObject({ headings: 2, subtotals: 2, needsReview: 3 });
  });

  it("chybné mapování (bez popisu, stejný sloupec dvakrát) se odmítne – nic se nečte", T, async () => {
    const f = write("rozpocet3.xlsx", fictiveBudgetXlsx());
    const r = await extractBudgetFile(f, [{ ...technologie, columns: { quantity: "E", unit: "E" } }]);
    expect(r).toMatchObject({ ok: false, kind: "mapping" });
    if (!r.ok) expect(r.message).toMatch(/popisem.*více významů|více významů.*popisem|popisem/);
  });
});

describe("limity – jednotlivý list i celý soubor (srozumitelná zpráva, žádný částečný výsledek)", () => {
  const sheetWith = (name: string, rows: number, cols = 2): FictiveSheet => ({
    name,
    rows: Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (__, c) => (c === 0 ? `Položka ${i}` : i))),
  });

  it("příliš mnoho listů", T, async () => {
    const r = await previewBudgetFile(write("listy.xlsx", buildXlsx(Array.from({ length: BUDGET_LIMITS.maxSheets + 1 }, (_, i) => sheetWith(`L${i}`, 1)))));
    expect(r).toMatchObject({ ok: false, kind: "limit" });
    if (!r.ok) expect(r.message).toMatch(/příliš rozsáhlý.*51 listů/);
  });

  it("příliš mnoho řádků v jednom listu", T, async () => {
    const r = await previewBudgetFile(write("radky.xlsx", buildXlsx([sheetWith("Velký", BUDGET_LIMITS.maxRowsPerSheet + 1)])));
    expect(r).toMatchObject({ ok: false, kind: "limit" });
  });

  it("příliš mnoho sloupců", T, async () => {
    const r = await previewBudgetFile(write("sloupce.xlsx", buildXlsx([sheetWith("Široký", 3, BUDGET_LIMITS.maxColumnsPerSheet + 1)])));
    expect(r).toMatchObject({ ok: false, kind: "limit" });
  });

  it("mnoho menších listů dohromady překročí limit CELÉHO souboru", T, async () => {
    // 3 listy po 18 000 řádcích – každý zvlášť je v limitu, dohromady (54 000) ne.
    const r = await previewBudgetFile(write("soucet.xlsx", buildXlsx([sheetWith("A", 18_000), sheetWith("B", 18_000), sheetWith("C", 18_000)])));
    expect(r).toMatchObject({ ok: false, kind: "limit" });
    if (!r.ok) expect(r.message).toMatch(/celkem více než 50000 řádků/);
  });

  it("rozbalená velikost nad 40 MB se odmítne ještě před čtením knihovnou", T, async () => {
    const big = "x".repeat(1_000_000);
    const r = await previewBudgetFile(write("velikost.xlsx", buildXlsx([{ name: "Texty", rows: Array.from({ length: 42 }, () => [big]) }])));
    expect(r).toMatchObject({ ok: false, kind: "limit" });
    if (!r.ok) expect(r.message).toMatch(/MB dat po rozbalení/);
  });
});

describe("poškozené a neobvyklé soubory – srozumitelná chyba, aplikace běží dál", () => {
  it.each([
    ["useknutý soubor", () => fictiveBudgetXlsx().subarray(0, 2000)],
    ["náhodná data", () => Uint8Array.from({ length: 5000 }, (_, i) => (i * 7919) % 256)],
    ["PDF místo Excelu", () => fictivePdf(["x"])],
    ["ZIP bez sešitu", () => makeZip([{ name: "a.txt", data: "ahoj" }])],
    ["sešit bez listů", () => buildXlsx([])],
    ["poškozený XML listu", () => makeZip([
      { name: "[Content_Types].xml", data: "<Types/>" },
      { name: "xl/workbook.xml", data: '<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", data: "<worksheet><sheetData><row r=\"1\"><c r=\"A1\"><v>1</v></sheetData" },
    ])],
  ])("%s", T, async (_label, make) => {
    const r = await previewBudgetFile(write(`vadny-${Math.random()}.xlsx`, make()));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(["format", "limit"]).toContain(r.kind);
      expect(r.message.length).toBeGreaterThan(10);
    }
  });
});

describe("izolace: problém v procesu čtečky neshodí aplikaci", () => {
  const file = () => write(`izolace-${Math.random()}.xlsx`, fictiveBudgetXlsx());

  it("překročení skutečné paměti procesu → proces ukončen, srozumitelná zpráva, aplikace pokračuje", T, async () => {
    const r = await previewBudgetFile(file(), { ...READER_LIMITS, rssMb: 20 });
    expect(r).toMatchObject({ ok: false, kind: "limit" });
    if (!r.ok) expect(r.message).toMatch(/paměť/);
    expect((await previewBudgetFile(file())).ok).toBe(true); // a další čtení funguje
  });

  it("překročení stropu paměti JavaScriptu v procesu → bez pádu aplikace", T, async () => {
    const big = buildXlsx([{ name: "Velký", rows: Array.from({ length: 15_000 }, (_, i) => [`Fiktivní položka s dlouhým popisem číslo ${i}`, i, "ks", i * 3.5, i * 7]) }]);
    const r = await previewBudgetFile(write("heap.xlsx", big), { ...READER_LIMITS, heapMb: 8, rssMb: 4096 });
    expect(r.ok).toBe(false);
    expect((await previewBudgetFile(file())).ok).toBe(true);
  });

  it("příliš dlouhé zpracování → proces ukončen časovým limitem", T, async () => {
    const r = await previewBudgetFile(file(), { ...READER_LIMITS, timeoutMs: 5 });
    expect(r).toMatchObject({ ok: false, kind: "limit" });
    if (!r.ok) expect(r.message).toMatch(/příliš dlouho/);
  });

  it("příliš velký výstup → proces ukončen", T, async () => {
    const r = await previewBudgetFile(file(), { ...READER_LIMITS, maxOutputBytes: 100 });
    expect(r).toMatchObject({ ok: false, kind: "limit" });
  });

  it("současná čtení se zpracují postupně (nejvýše jedno najednou) a všechna doběhnou", T, async () => {
    const results = await Promise.all([previewBudgetFile(file()), previewBudgetFile(file()), previewBudgetFile(file())]);
    expect(results.every((x) => x.ok)).toBe(true);
  });
});
