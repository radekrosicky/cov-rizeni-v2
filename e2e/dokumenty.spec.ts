// V2-2 Dokumenty – celý postup v prohlížeči + hraniční případy přímo na serveru (jen fiktivní soubory).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fictiveDocx, fictivePdf, fictivePng } from "../src/server/seed/fictiveFiles.ts";
import { encodeMeta } from "../src/lib/uploadProtocol.ts";
import { formAlert, signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

const BASE = "http://localhost:3100";
const MB = 1024 * 1024;
const TMP_DIR = path.resolve("data/e2e/files/.tmp");
let projectUrl = "";
let documentUrl = "";

const pdfFile = (name: string, text: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from(fictivePdf([text])) });

async function openFiktivin(page: Page) {
  await page.goto("/zakazky");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await page.waitForURL(/\/zakazky\/[0-9a-f-]{36}$/);
  projectUrl = new URL(page.url()).pathname;
}

async function identityCookie(context: BrowserContext) {
  const c = (await context.cookies()).find((x) => x.name === "cov_dev_identity");
  return `cov_dev_identity=${c?.value}`;
}

/** Surový požadavek na adresu pro nahrávání (pro hraniční případy, které prohlížeč neumí vyvolat). */
function rawUpload(opts: { cookie: string; origin?: string; uploadHeader?: boolean; body: (req: http.ClientRequest) => void; contentLength?: number }) {
  return new Promise<{ status: number; body: string }>((resolve) => {
    const headers: Record<string, string> = {
      "content-type": "application/octet-stream",
      "x-cov-meta": encodeMeta({ category: "other", filename: "hranicni-test.pdf" }),
      cookie: opts.cookie,
      origin: opts.origin ?? BASE,
    };
    if (opts.uploadHeader !== false) headers["x-cov-upload"] = "1";
    if (opts.contentLength !== undefined) headers["content-length"] = String(opts.contentLength);
    const req = http.request(`${BASE}${projectUrl}/dokumenty/nahrat`, { method: "POST", headers }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: b }));
    });
    req.on("error", () => resolve({ status: 0, body: "spojení ukončeno" }));
    opts.body(req);
  });
}

/** Velký fiktivní „PDF“ na disku (dočasná složka systému, mimo Git) – velké soubory se předávají z disku.
 *  Cesta je záměrně bez diakritiky: prohlížeč v testech nenačte velký soubor z cesty s českými znaky. */
function fictiveBigPdf(name: string, bytes: number): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cov-e2e-")), name);
  const fd = fs.openSync(file, "w");
  fs.writeSync(fd, "%PDF-1.4\n% FIKTIVNI velky soubor\n");
  fs.ftruncateSync(fd, bytes);
  fs.closeSync(fd);
  return file;
}

const tmpFiles = () => (fs.existsSync(TMP_DIR) ? fs.readdirSync(TMP_DIR) : []);

test("zástupce vidí fiktivní dokumenty, filtruje podle druhu", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openFiktivin(page);
  await page.getByRole("link", { name: "Dokumenty", exact: true }).click();
  await expect(page.getByRole("link", { name: "Smlouva o dílo (FIKTIVNÍ)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dodatek č. 1 ke smlouvě (FIKTIVNÍ)" })).toBeVisible();
  await page.getByRole("link", { name: /^Projektová dokumentace a výkresy/ }).click();
  await expect(page.getByRole("link", { name: "D.1.3 Technologie – dispozice (FIKTIVNÍ)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Smlouva o dílo (FIKTIVNÍ)" })).toHaveCount(0);
  await expect(page.getByText("Aktuální: rev. 2 (B)")).toBeVisible();
});

test("celý postup: nahrát → otevřít → stáhnout → nová revize → stará zůstane → aktuální revize → historie", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openFiktivin(page);
  await page.goto(`${projectUrl}/dokumenty`);
  await page.getByRole("link", { name: "+ Nahrát dokument" }).click();
  await page.getByLabel("Soubor *").setInputFiles(pdfFile("Protokol_tlakove_zkousky.pdf", "Protokol tlakove zkousky - rev A"));
  await expect(page.getByLabel("Název")).toHaveValue("Protokol tlakove zkousky");
  await page.getByLabel("Druh *").selectOption("protocol");
  await page.getByLabel("Datum dokumentu").fill("2026-11-10");
  await page.getByLabel("Označení revize").fill("A");
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(page.getByRole("status")).toContainText("Dokument byl nahrán a uložen");
  documentUrl = new URL(page.url()).pathname;
  await expect(page.locator("[data-revision='1']")).toContainText("Aktuální");

  // Otevřít (PDF v prohlížeči) – ověření odpovědi serveru.
  const openHref = (await page.getByRole("link", { name: "Otevřít" }).first().getAttribute("href"))!;
  const opened = await page.request.get(openHref);
  expect(opened.status()).toBe(200);
  expect(opened.headers()["content-type"]).toBe("application/pdf");
  expect(opened.headers()["content-disposition"]).toMatch(/^inline;/);
  expect(opened.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await opened.body()).toString()).toContain("rev A");

  // Stáhnout.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Stáhnout" }).first().click()]);
  expect(download.suggestedFilename()).toBe("Protokol_tlakove_zkousky.pdf");

  // Nová revize.
  await page.getByLabel("Soubor *").setInputFiles(pdfFile("Protokol_rev_B.pdf", "Protokol tlakove zkousky - rev B"));
  await page.getByLabel("Označení revize").fill("B");
  await page.getByLabel("Co se v revizi změnilo").fill("Doplněn podpis (fiktivní)");
  await page.getByRole("button", { name: "Nahrát novou revizi" }).click();
  await expect(page.getByText("Nová revize 2 byla nahrána")).toBeVisible();
  await expect(page.locator("[data-revision='2']")).toContainText("Aktuální");
  await expect(page.locator("[data-revision='1']")).toContainText("Nahrazeno");

  // Stará revize zůstává dostupná.
  const oldHref = (await page.locator("[data-revision='1']").getByRole("link", { name: "Stáhnout" }).getAttribute("href"))!;
  const old = await page.request.get(oldHref);
  expect(old.headers()["content-disposition"]).toMatch(/^attachment;/);
  expect((await old.body()).toString()).toContain("rev A");

  // Označit starší revizi jako aktuální – jen s důvodem.
  await page.locator("[data-revision='1']").getByText("Označit jako aktuální…").click();
  await page.getByRole("button", { name: "Označit rev. 1 jako aktuální" }).click();
  await expect(page.getByText("Uveďte důvod.").first()).toBeVisible();
  await page.getByLabel("Důvod").fill("Revize B nahrána omylem (fiktivní)");
  await page.getByRole("button", { name: "Označit rev. 1 jako aktuální" }).click();
  await expect(page.getByText("Aktuální revize byla změněna")).toBeVisible();
  await expect(page.locator("[data-revision='1']")).toContainText("Aktuální");
  await expect(page.locator("[data-revision='2']")).toContainText("Nahrazeno");

  // Historie.
  await page.goto(`${projectUrl}/historie`);
  await expect(page.getByText("Změněna aktuální revize").first()).toBeVisible();
  await expect(page.getByText("Důvod: Revize B nahrána omylem (fiktivní)")).toBeVisible();
  await expect(page.getByText("Nahrán soubor").first()).toBeVisible();
  await expect(page.getByText(/Dokument „Protokol tlakove zkousky“ – revize 2/)).toBeVisible();
});

test("DOCX a fotografie: uložit; fotografie jde otevřít, DOCX jen stáhnout", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(`${projectUrl}/dokumenty/novy`);
  await page.getByLabel("Soubor *").setInputFiles({ name: "zapis-kd-2.docx", mimeType: "application/octet-stream", buffer: Buffer.from(fictiveDocx()) });
  await page.getByLabel("Druh *").selectOption("site_meeting");
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(page.getByRole("status")).toContainText("Dokument byl nahrán");
  await expect(page.getByRole("link", { name: "Otevřít" })).toHaveCount(0);
  await page.goto(`${projectUrl}/dokumenty/novy`);
  await page.getByLabel("Soubor *").setInputFiles({ name: "foto-sachta.png", mimeType: "image/png", buffer: Buffer.from(fictivePng()) });
  await page.getByLabel("Druh *").selectOption("photo");
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(page.getByRole("status")).toContainText("Dokument byl nahrán");
  const href = (await page.getByRole("link", { name: "Otevřít" }).first().getAttribute("href"))!;
  const r = await page.request.get(href);
  expect(r.headers()["content-type"]).toBe("image/png");
  expect(r.headers()["content-security-policy"]).toContain("sandbox");
});

test("podvržený soubor (HTML s příponou PDF) je odmítnut a nic se neuloží", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(`${projectUrl}/dokumenty/novy`);
  await page.getByLabel("Soubor *").setInputFiles({ name: "faktura.pdf", mimeType: "application/pdf", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(formAlert(page)).toContainText("není povolený");
  await expect(page).toHaveURL(/\/dokumenty\/novy/);
});

test("soubor blízko limitu (49 MB) se nahraje; větší než 50 MB prohlížeč ani neodešle", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Zástupce");
  await page.goto(`${projectUrl}/dokumenty/novy`);
  await page.getByLabel("Soubor *").setInputFiles(fictiveBigPdf("velky-fiktivni-49MB.pdf", 49 * MB));
  await page.getByLabel("Druh *").selectOption("other");
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(page.getByRole("status")).toContainText("Dokument byl nahrán", { timeout: 60_000 });
  await expect(page.locator("[data-revision='1']")).toContainText("49,0 MB");
  await expect(page.locator("[data-revision='1']")).toContainText("velky-fiktivni-49MB.pdf");

  await page.goto(`${projectUrl}/dokumenty/novy`);
  // Soubor 50 MB + 1 bajt (Playwright větší data neumí předat z paměti → dočasný soubor mimo Git).
  await page.getByLabel("Soubor *").setInputFiles(fictiveBigPdf("prilis-velky.pdf", 50 * MB + 1));
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(formAlert(page)).toContainText("povolený limit je 50,0 MB");
});

test("server: přes limit (ohlášený i skutečný), přerušené nahrání, CSRF – nic nezůstane", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Zástupce");
  await openFiktivin(page);
  const cookie = await identityCookie(context);
  const docsBefore = await page.request.get(`${projectUrl}/dokumenty`).then((r) => r.text());
  const countBefore = (docsBefore.match(/Detail a revize/g) ?? []).length;

  // Ohlášená velikost přes limit → odmítnuto hned, bez čtení dat.
  const declared = await rawUpload({ cookie, contentLength: 50 * MB + 1, body: (req) => req.end() });
  expect(declared.status).toBe(413);

  // Skutečná velikost přes limit bez ohlášení (chunked) → přerušeno během přenosu.
  const streamed = await rawUpload({
    cookie,
    body: (req) => {
      req.write("%PDF-1.4\n");
      const chunk = Buffer.alloc(MB);
      for (let i = 0; i < 51; i++) req.write(chunk);
      req.end();
    },
  });
  // Server přestane číst hned po překročení limitu a odpoví 413; klient, který dál zapisuje bez čekání,
  // může místo odpovědi dostat ukončené spojení. Obojí je správně – rozhodující je, že nic nezůstane (níže).
  expect([413, 0], streamed.body).toContain(streamed.status);
  if (streamed.status === 413) expect(JSON.parse(streamed.body).message).toMatch(/limit/);

  // Přerušené nahrání (klient zavře spojení uprostřed).
  await rawUpload({
    cookie,
    contentLength: 30 * MB,
    body: (req) => {
      req.write("%PDF-1.4\n");
      req.write(Buffer.alloc(10 * MB), () => setTimeout(() => req.destroy(), 200));
    },
  });

  // CSRF: cizí původ nebo chybějící vlastní hlavička → odmítnuto.
  const evil = await rawUpload({ cookie, origin: "https://evil.example.com", body: (req) => req.end(Buffer.from(fictivePdf(["x"]))) });
  expect(evil.status).toBe(403);
  const noHeader = await rawUpload({ cookie, uploadHeader: false, body: (req) => req.end(Buffer.from(fictivePdf(["x"]))) });
  expect(noHeader.status).toBe(403);

  // Nic nevzniklo a dočasné soubory jsou uklizené.
  await expect.poll(() => tmpFiles(), { timeout: 10_000 }).toEqual([]);
  const docsAfter = await page.request.get(`${projectUrl}/dokumenty`).then((r) => r.text());
  expect((docsAfter.match(/Detail a revize/g) ?? []).length).toBe(countBefore);
});

test("sledující: vidí a stáhne, ale nenahraje (ani přímým požadavkem); cizí zakázka 404", async ({ page, context }) => {
  await signInAs(page, "Sledující 1");
  await page.goto(`${projectUrl}/dokumenty`);
  await expect(page.getByRole("link", { name: "Smlouva o dílo (FIKTIVNÍ)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Nahrát dokument" })).toHaveCount(0);
  const href = (await page.getByRole("link", { name: "Stáhnout" }).first().getAttribute("href"))!;
  expect((await page.request.get(href)).status()).toBe(200);
  await page.goto(documentUrl);
  await expect(page.getByRole("button", { name: "Nahrát novou revizi" })).toHaveCount(0);
  await expect(page.getByText("Označit jako aktuální…")).toHaveCount(0);
  const direct = await rawUpload({ cookie: await identityCookie(context), body: (req) => req.end(Buffer.from(fictivePdf(["x"]))) });
  expect(direct.status).toBe(403);
  expect(JSON.parse(direct.body).message).toMatch(/jen pro čtení/);

  await signInAs(page, "Sledující 2");
  expect((await page.request.get(href)).status()).toBe(404);
  expect((await page.goto(`${projectUrl}/dokumenty`))?.status()).toBe(404);
});

test("když se stránka v prohlížeči neoživí, nahrání nejde odeslat naslepo", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openFiktivin(page);
  // Vývojový server oživí stránku až po spojení WebSocket – zablokováním ho napodobíme výpadek.
  await page.routeWebSocket(/_next\/hmr/, (ws) => ws.close());
  await page.goto(`${projectUrl}/dokumenty/novy`);
  await expect(page.getByRole("button", { name: "Načítám…" })).toBeDisabled();
  await expect(page.getByText("Pokud se tlačítko neaktivuje, obnovte stránku")).toBeVisible();
});
