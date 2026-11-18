// Povinná vstupní obrazovka (vývojová fiktivní identita) – bez přihlášení žádná navigace ani data.
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

let projectPath = "";
let documentsPath = "";
let filePath = "";

test("nepřihlášený: po otevření webu jen vstupní obrazovka, bez navigace a dat", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/prihlaseni");
  await expect(page.getByRole("heading", { name: "ČOV Řízení 2.0" })).toBeVisible();
  await expect(page.getByText("POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText(/Fiktivín|Testovice/)).toHaveCount(0);
});

test("výběr identity otevře přímo „Co dnes řešit“; odhlášení vrátí na vstup", async ({ page }) => {
  await page.goto("/prihlaseni");
  await page.getByRole("button", { name: /^Zástupce \(fiktivní\)/ }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { name: "Co dnes řešit" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
  await expect(page.getByText("POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení")).toBeVisible();
  // Přihlášený na /prihlaseni → zpět do aplikace.
  await page.goto("/prihlaseni");
  await page.waitForURL((u) => u.pathname === "/");
  // Adresy pro další test.
  await page.goto("/zakazky");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await page.waitForURL(/\/zakazky\/[0-9a-f-]{36}$/);
  projectPath = new URL(page.url()).pathname;
  documentsPath = `${projectPath}/dokumenty`;
  await page.goto(documentsPath);
  filePath = (await page.getByRole("link", { name: "Stáhnout" }).first().getAttribute("href"))!;
  expect(filePath).toContain("/dokumenty/soubor/");
  // Odhlášení
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  await page.waitForURL("**/prihlaseni");
  await page.goto("/");
  await page.waitForURL("**/prihlaseni");
});

test("přímé adresy zakázek, dokumentů a souborů bez identity nic neukážou", async ({ page }) => {
  for (const path of [projectPath, documentsPath, `${projectPath}/material`, `${projectPath}/historie`, "/zakazky", "/moje-ukoly"]) {
    await page.goto(path);
    await page.waitForURL("**/prihlaseni");
    await expect(page.getByText(/Fiktivín/)).toHaveCount(0);
  }
  // Stažení souboru i nahrání přímým požadavkem: přesměrování / odmítnutí, žádná data.
  const file = await page.request.get(filePath, { maxRedirects: 0 });
  expect(file.status()).toBe(307);
  expect(file.headers()["location"]).toContain("/prihlaseni");
  // Nahrání bez identity: adresa ji ověří sama (proxy ji kvůli velkým souborům nezpracovává) → 401, nic se neuloží.
  const meta = Buffer.from(JSON.stringify({ filename: "utok.pdf", category: "other", title: "x" })).toString("base64");
  const upload = await page.request.post(`${documentsPath}/nahrat`, {
    data: Buffer.from("%PDF-1.4\n"),
    headers: { origin: "http://localhost:3100", "x-cov-upload": "1", "x-cov-meta": meta, "content-type": "application/octet-stream" },
    maxRedirects: 0,
  });
  expect(upload.status()).toBe(401);
  // Podvržená / neplatná hodnota relace: server ji ověří v databázi a pošle na vstup.
  await page.context().addCookies([{ name: "cov_dev_identity", value: "11111111-1111-4111-8111-111111111111", url: "http://localhost:3100" }]);
  await page.goto(projectPath);
  await page.waitForURL("**/prihlaseni");
  await page.context().addCookies([{ name: "cov_dev_identity", value: "nesmysl", url: "http://localhost:3100" }]);
  const res = await page.request.get(filePath, { maxRedirects: 0 });
  expect([401, 403, 404, 307]).toContain(res.status());
  expect(res.headers()["content-type"] ?? "").not.toContain("application/pdf");
});

test("oprávnění zůstávají na serveru: sledující 2 nemá přístup k cizí zakázce ani přímou adresou", async ({ page }) => {
  await signInAs(page, "Sledující 2");
  const res = await page.goto(projectPath);
  expect(res!.status()).toBe(404);
  const file = await page.request.get(filePath, { maxRedirects: 0 });
  expect(file.status()).toBe(404);
});
