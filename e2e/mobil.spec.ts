// Mobil: hlavní obrazovky bez vodorovného posouvání, ovládací prvky pohodlné pro dotyk.
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("hlavní obrazovky V2-1 se na mobilu nevodorovně neposouvají", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await page.waitForURL(/\/zakazky\/[0-9a-f-]{36}$/);
  const detail = new URL(page.url()).pathname;
  for (const path of ["/", "/zakazky", detail, `${detail}/udalosti/nova`, `${detail}/historie`, `${detail}/clenove`, "/zakazky/nova", `${detail}/dokumenty`, `${detail}/dokumenty/novy`, `${detail}/material`, `${detail}/material/polozky`, `${detail}/material/import`, `${detail}/material/nova`]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  // Detail dokumentu (výkres se dvěma revizemi).
  await page.goto(`${detail}/dokumenty`);
  await page.getByRole("link", { name: "D.1.3 Technologie – dispozice (FIKTIVNÍ)" }).click();
  await page.waitForURL(/dokumenty\/[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // Detail dodávky s kartou „Termíny“ (V2-4).
  await page.goto(`${detail}/material`);
  await page.getByRole("link", { name: "Dmychadla D1–D2 (fiktivní)" }).click();
  await page.waitForURL(/material\/[0-9a-f-]{36}$/);
  await page.getByText("Nastavit termín potřeby, dodací lhůtu a rezervu").click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.goto(detail);
  const box = await page.getByRole("link", { name: "+ Přidat událost" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  // „Co dnes řešit“: karty na celou šířku, pohodlné pro dotyk.
  await page.goto("/");
  const card = await page.getByRole("list", { name: "Akce na dnes" }).getByRole("link").first().boundingBox();
  expect(card!.height).toBeGreaterThanOrEqual(56);
  expect(card!.width).toBeGreaterThan(300);
  // Vstupní obrazovka (po odhlášení) na mobilu.
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  await page.waitForURL("**/prihlaseni");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const btn = await page.getByRole("button", { name: /^Zástupce \(fiktivní\)/ }).boundingBox();
  expect(btn!.height).toBeGreaterThanOrEqual(44);
});
