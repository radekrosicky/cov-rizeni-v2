// V2-3 Rozpočet a sledovaný materiál – celý postup v prohlížeči (jen fiktivní rozpočet).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildXlsx } from "../src/server/seed/fictiveBudget.ts";
import { formAlert, signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

let projectUrl = "";

async function openFiktivin(page: Page) {
  await page.goto("/zakazky");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await page.waitForURL(/\/zakazky\/[0-9a-f-]{36}$/);
  projectUrl = new URL(page.url()).pathname;
}

test("import: rozpočet z Dokumentů → náhled sloupců → kontrola → potvrzení", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openFiktivin(page);
  await page.goto(`${projectUrl}/material`);
  // Fiktivní dodávky s termíny (V2-4) jsou ruční – rozpočet zatím není načtený.
  await expect(page.getByRole("link", { name: "Dmychadla D1–D2 (fiktivní)" })).toBeVisible();
  await page.getByRole("link", { name: "Načíst položky z rozpočtu" }).click();
  await page.getByRole("link", { name: /Načíst položky \(rev\. 1\)/ }).click();
  await expect(page.getByText("Krok 2 ze 3")).toBeVisible();
  // Aplikace navrhla sloupce u obou dodavatelů; skrytý list je označen a nevybrán.
  await expect(page.locator('select[name="c1.description"]')).toHaveValue("C");
  await expect(page.locator('select[name="c2.quantity"]')).toHaveValue("B");
  await expect(page.getByText("skrytý list")).toBeVisible();
  await expect(page.locator('input[name="s3"]')).not.toBeChecked();
  // Chybný výběr → kontrola ukáže chybu a jde se vrátit.
  await page.locator('select[name="c1.description"]').selectOption("");
  await page.getByRole("button", { name: "Pokračovat ke kontrole" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("vyberte sloupec s popisem");
  await page.getByRole("link", { name: "← Upravit výběr sloupců" }).click();
  await page.locator('select[name="c1.description"]').selectOption("C");
  await page.getByRole("button", { name: "Pokračovat ke kontrole" }).click();
  await expect(page.getByText("Výsledek rozpoznání (zatím NEULOŽENO)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "K ruční kontrole (3)" })).toBeVisible();
  await expect(page.getByText("Cena celkem: chyba v Excelu #REF!")).toBeVisible();
  // Bez potvrzení kontroly se neuloží.
  await page.getByRole("button", { name: "Potvrdit a uložit položky" }).click();
  await expect(formAlert(page)).toContainText("3 položky označené k ruční kontrole");
  await page.getByLabel(/Zkontroloval\(a\) jsem/).check();
  await page.locator('select[name="currency"]').selectOption("CZK");
  await page.getByRole("button", { name: "Potvrdit a uložit položky" }).click();
  await expect(page.getByRole("status")).toContainText("Položky rozpočtu byly uloženy");
  await expect(page.getByText("ceny: CZK, DPH neuvedeno")).toBeVisible();
  // Druhý import stejné revize už nejde.
  await page.goto(`${projectUrl}/material/import`);
  await expect(page.getByRole("link", { name: "Zobrazit načtené položky" })).toBeVisible();
});

test("jedna technologie: zaškrtnout čerpadlo → Sledovat → jeden krátký formulář", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openFiktivin(page);
  await page.goto(`${projectUrl}/material/polozky`);
  await expect(page.getByText("Montáž čerpadel")).toHaveCount(0); // výchozí zobrazení: jen materiál a technologie
  await page.getByLabel(/Vybrat Ponorné kalové čerpadlo/).check();
  await page.getByRole("button", { name: "Sledovat vybrané jako jednu dodávku" }).click();
  await expect(page.getByLabel("Název dodávky")).toHaveValue("Ponorné kalové čerpadlo Qmax 12 l/s, 4 kW (fiktivní)");
  await expect(page.getByLabel("Převzít z rozpočtu (ks)")).toHaveValue("2");
  await page.getByLabel("Převzít z rozpočtu (ks)").fill("1");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByRole("status")).toContainText("Sledovaná dodávka byla vytvořena");
  await expect(page.getByRole("definition").filter({ hasText: "Nepřiřazeno" })).toBeVisible();
  await expect(page.getByText("list „SO 01 Technologie“ · ř. 6 · TECH-001")).toBeVisible();
});

test("rozdělení: druhá dodávka ze stejné položky jen s potvrzením; překročení jen s důvodem", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(`${projectUrl}/material/polozky`);
  await expect(page.getByText(/Částečně \(1 z 2 ks\)/)).toBeVisible();
  await page.getByRole("link", { name: /Ponorné kalové čerpadlo/ }).click();
  await page.getByRole("link", { name: /Vytvořit další dodávku z této položky/ }).click();
  await expect(page.getByLabel("Převzít z rozpočtu (ks)")).toHaveValue("1");
  await page.getByLabel("Název dodávky").fill("Čerpadlo ČS2 (fiktivní)");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(formAlert(page)).toContainText("Už sledováno");
  await page.getByLabel(/chci vytvořit další dodávku/).check();
  await page.getByLabel("Převzít z rozpočtu (ks)").fill("2");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByText(/se překročí množství v rozpočtu/)).toBeVisible();
  await page.getByLabel("Převzít z rozpočtu (ks)").fill("1");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByRole("status")).toContainText("Sledovaná dodávka byla vytvořena");
  await page.goto(`${projectUrl}/material/polozky?druh=vse`);
  await page.getByRole("link", { name: /Ponorné kalové čerpadlo/ }).click();
  await expect(page.getByText("2 ks · zbývá 0 ks")).toBeVisible();
  await expect(page.getByText("Původ – originál z Excelu")).toBeVisible();
  await expect(page.getByText("Množství v rozpočtu")).toBeVisible();
});

test("sloučení: dvě položky do jedné dodávky; ruční dodávka bez Excelu", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(`${projectUrl}/material/polozky`);
  await page.getByLabel(/Vybrat Těsnění příruby/).check();
  await page.getByLabel(/Vybrat Potrubí nerez/).check();
  await page.getByRole("button", { name: "Sledovat vybrané jako jednu dodávku" }).click();
  await page.getByLabel("Název dodávky").fill("Potrubí a těsnění (fiktivní)");
  await page.getByLabel("Proč ji sledujeme").selectOption("may_block_assembly");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByRole("heading", { name: "Z rozpočtu (2)" })).toBeVisible();
  await page.goto(`${projectUrl}/material/nova`);
  await page.getByLabel("Název dodávky").fill("Chemie pro srážení fosforu (fiktivní)");
  await page.getByLabel("Proč ji sledujeme").selectOption("other");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByText("Napište vlastní důvod sledování.")).toBeVisible();
  await page.getByLabel("Vlastní důvod / upřesnění").fill("Jediný dodavatel v regionu (fiktivní)");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByText("Ruční záznam – bez vazby na rozpočet.")).toBeVisible();
});

test("sledující: vidí položky i dodávky, ale nemůže nic měnit", async ({ page }) => {
  await signInAs(page, "Sledující 1");
  await page.goto(`${projectUrl}/material`);
  await expect(page.getByRole("link", { name: "Čerpadlo ČS2 (fiktivní)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Načíst položky z rozpočtu" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "+ Ruční dodávka" })).toHaveCount(0);
  await page.goto(`${projectUrl}/material/polozky`);
  await expect(page.getByRole("button", { name: "Sledovat vybrané jako jednu dodávku" })).toHaveCount(0);
  expect((await page.goto(`${projectUrl}/material/nova`))?.status()).toBe(200);
  await expect(page.getByText("Dodávky zakládá správce nebo zástupce.")).toBeVisible();
});

test("příliš rozsáhlý Excel: srozumitelná zpráva, nic se neuloží, aplikace běží dál", async ({ page }) => {
  test.setTimeout(120_000);
  await signInAs(page, "Zástupce");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-e2e-"));
  const file = path.join(dir, "rozpocet-prilis-velky.xlsx");
  fs.writeFileSync(file, buildXlsx([0, 1, 2].map((s) => ({ name: `L${s}`, rows: Array.from({ length: 18_000 }, (_, i) => [`Položka ${i}`, "ks", 1]) }))));
  await page.goto(`${projectUrl}/dokumenty/novy?druh=budget`);
  await page.getByLabel("Soubor *").setInputFiles(file);
  await page.getByLabel("Název").fill("Obrovský rozpočet (fiktivní)");
  await page.getByRole("button", { name: "Nahrát dokument" }).click();
  await expect(page.getByRole("status")).toContainText("Dokument byl nahrán");
  await page.goto(`${projectUrl}/material/import`);
  await page.locator("li", { hasText: "Obrovský rozpočet" }).getByRole("link", { name: /Načíst položky/ }).click();
  await expect(page.locator("main [role=alert]")).toContainText("příliš rozsáhlý");
  await page.goto(`${projectUrl}/material`);
  await expect(page.getByRole("heading", { name: "Sledované dodávky" })).toBeVisible();
});

test("když se stránka neoživí, formulář dodávky nejde odeslat naslepo (nic by se neuložilo)", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.routeWebSocket(/_next\/hmr/, (ws) => ws.close()); // napodobí pomalé / nefunkční oživení stránky
  await page.goto(`${projectUrl}/material/nova`);
  await expect(page.getByRole("button", { name: "Vytvořit dodávku" })).toBeDisabled();
});
