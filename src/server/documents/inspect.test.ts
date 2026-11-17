// Rozpoznání typu podle obsahu a kontrola XLSX/DOCX (včetně podvržených a škodlivě sestavených souborů).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extensionMatches, maxUploadBytes, sanitizeFilename, sniffFileKind, titleFromFilename } from "../../domain/documents/fileKinds.ts";
import { concat, contentTypesXml, fictiveDocx, fictiveDxf, fictivePdf, fictivePng, fictiveXlsx, makeZip } from "../seed/fictiveFiles.ts";
import { LocalFileStorage } from "../storage/localFileStorage.ts";
import { inspectUploadedFile } from "./inspect.ts";

let root: string;
let storage: LocalFileStorage;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cov-inspect-"));
  storage = new LocalFileStorage(root);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function inspect(data: Uint8Array, filename: string) {
  const received = await storage.receive([data], 60 * 1024 * 1024);
  try {
    return await inspectUploadedFile(storage, received, filename);
  } finally {
    await storage.discard(received.tempId);
  }
}
const bytes = (...b: number[]) => Uint8Array.from(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("povolené typy – rozpoznání podle obsahu", () => {
  it.each([
    ["smlouva.pdf", () => fictivePdf(["x"]), "pdf"],
    ["rozpocet.xlsx", () => fictiveXlsx(), "xlsx"],
    ["zapis.docx", () => fictiveDocx(), "docx"],
    ["foto.png", () => fictivePng(), "png"],
    ["foto.jpg", () => concat([bytes(0xff, 0xd8, 0xff, 0xe0), new Uint8Array(100)]), "jpeg"],
    ["foto.jpeg", () => concat([bytes(0xff, 0xd8, 0xff, 0xe1), new Uint8Array(100)]), "jpeg"],
    ["foto.webp", () => concat([text("RIFF"), bytes(1, 0, 0, 0), text("WEBPVP8 "), new Uint8Array(50)]), "webp"],
    ["iphone.heic", () => concat([bytes(0, 0, 0, 24), text("ftypheic"), new Uint8Array(50)]), "heic"],
    ["sken.tif", () => concat([bytes(0x49, 0x49, 0x2a, 0x00), new Uint8Array(50)]), "tiff"],
    ["vykres.dwg", () => concat([text("AC1032"), new Uint8Array(200)]), "dwg"],
    ["situace.dxf", () => fictiveDxf(), "dxf"],
    ["binarni.dxf", () => concat([text("AutoCAD Binary DXF\r\n"), bytes(0x1a, 0), new Uint8Array(50)]), "dxf"],
  ])("%s → %s", async (name, make, kind) => {
    expect(await inspect(make(), name)).toEqual({ ok: true, kind });
  });
});

describe("odmítnuté soubory", () => {
  it.each([
    ["HTML přejmenované na PDF", text("<html><script>alert(1)</script></html>"), "faktura.pdf"],
    ["SVG", text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "obrazek.svg"],
    ["SVG přejmenované na PNG", text('<?xml version="1.0"?><svg/>'), "obrazek.png"],
    ["spustitelný soubor", concat([text("MZ"), new Uint8Array(200)]), "program.exe"],
    ["spustitelný přejmenovaný na DWG", concat([text("MZ"), new Uint8Array(200)]), "vykres.dwg"],
    ["skript", text("#!/bin/sh\nrm -rf /\n"), "skript.dxf"],
    ["prostý ZIP", makeZip([{ name: "a.txt", data: "ahoj" }]), "vykresy.zip"],
    ["ZIP přejmenovaný na DOCX bez struktury Office", makeZip([{ name: "a.txt", data: "ahoj" }]), "dokument.docx"],
    ["AVIF (nepovolený obrázek)", concat([bytes(0, 0, 0, 24), text("ftypavif"), new Uint8Array(50)]), "foto.heic"],
    ["PNG s příponou PDF", fictivePng(), "smlouva.pdf"],
    ["PDF s příponou JPG", fictivePdf(["x"]), "foto.jpg"],
    ["XLSX s příponou DOCX", fictiveXlsx(), "zapis.docx"],
    ["prázdný soubor", new Uint8Array(0), "prazdny.pdf"],
  ])("%s", async (_label, data, name) => {
    const r = await inspect(data, name);
    expect(r.ok).toBe(false);
  });
});

describe("XLSX/DOCX – struktura a limity rozbaleného obsahu", () => {
  const reject = async (data: Uint8Array, name: string, re: RegExp) => {
    const r = await inspect(data, name);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(re);
  };

  it("makra (vbaProject.bin) jsou odmítnuta", async () => {
    await reject(fictiveXlsx([{ name: "xl/vbaProject.bin", data: "x" }]), "s-makry.xlsx", /makry/);
  });
  it("sešit s makry podle [Content_Types].xml (xlsm) je odmítnut", async () => {
    const xlsm = makeZip([
      { name: "[Content_Types].xml", data: contentTypesXml("xlsx").replace("sheet.main+xml", "sheet.main+xml\"/><Override PartName=\"/x\" ContentType=\"application/vnd.ms-excel.sheet.macroEnabled.main+xml") },
      { name: "xl/workbook.xml", data: "<workbook/>" },
    ]);
    await reject(xlsm, "makra.xlsx", /makry/);
  });
  it("šifrovaný obsah je odmítnut", async () => {
    await reject(fictiveDocx([{ name: "word/secret.xml", data: "x", flags: 1 }]), "sifrovany.docx", /Šifrované/);
  });
  it("„zip bomba“: obsah se rozbalí víc, než soubor tvrdí → odmítnuto", async () => {
    const big = new Uint8Array(5 * 1024 * 1024); // 5 MB nul se zabalí do pár kB
    await reject(fictiveDocx([{ name: "word/media/bomba.bin", data: big, fakeUncompressedSize: 1000 }]), "bomba.docx", /po rozbalení|Podezřele/);
  });
  it("podezřele vysoký poměr komprese je odmítnut", async () => {
    await reject(fictiveDocx([{ name: "word/media/x.bin", data: new Uint8Array(20 * 1024 * 1024) }]), "pomer.docx", /Podezřele/);
  });
  it("nebezpečné názvy částí (../, absolutní cesta) jsou odmítnuty", async () => {
    await reject(fictiveXlsx([{ name: "../../etc/passwd", data: "x" }]), "cesta.xlsx", /nebezpečné/);
    await reject(fictiveXlsx([{ name: "/abs.xml", data: "x" }]), "cesta2.xlsx", /nebezpečné/);
  });
  it("chybějící hlavní část nebo [Content_Types].xml → odmítnuto", async () => {
    await reject(makeZip([{ name: "[Content_Types].xml", data: contentTypesXml("docx") }]), "neuplny.docx", /Word/);
    await reject(makeZip([{ name: "word/document.xml", data: "<x/>" }]), "bez-ct.docx", /Office/);
  });
  it("příliš mnoho částí je odmítnuto", async () => {
    const many = Array.from({ length: 2100 }, (_, i) => ({ name: `word/p${i}.xml`, data: "x", store: true }));
    await reject(fictiveDocx(many), "mnoho.docx", /příliš mnoho|struktura/i);
  });
  it("poškozený soubor (useknutý konec) je odmítnut", async () => {
    const full = fictiveXlsx();
    await reject(full.subarray(0, full.length - 30), "useknuty.xlsx", /Office|struktura/);
  });
});

describe("pomocné funkce", () => {
  it("očištění názvu souboru", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\x\\Smlouva.pdf")).toBe("Smlouva.pdf");
    expect(sanitizeFilename("zlý\u0000\nnázev.pdf")).toBe("zlý název.pdf");
    expect(sanitizeFilename("...skryty.pdf")).toBe("skryty.pdf");
    expect(sanitizeFilename("a".repeat(300) + ".pdf").length).toBe(255);
    expect(titleFromFilename("Vykres_D13_revB.pdf")).toBe("Vykres D13 revB");
  });
  it("přípona musí odpovídat druhu", () => {
    expect(extensionMatches("jpeg", "a.JPG")).toBe(true);
    expect(extensionMatches("pdf", "a.pdf.exe")).toBe(false);
  });
  it("limit z MAX_UPLOAD_MB: výchozí 50 MB, nastavitelný, nesmysl → výchozí", () => {
    expect(maxUploadBytes({})).toBe(50 * 1024 * 1024);
    expect(maxUploadBytes({ MAX_UPLOAD_MB: "10" })).toBe(10 * 1024 * 1024);
    expect(maxUploadBytes({ MAX_UPLOAD_MB: "-5" })).toBe(50 * 1024 * 1024);
    expect(maxUploadBytes({ MAX_UPLOAD_MB: "abc" })).toBe(50 * 1024 * 1024);
  });
  it("prvních bajtů pod 4 nestačí", () => {
    expect(sniffFileKind(Uint8Array.from([0x25, 0x50]))).toBeNull();
  });
});
