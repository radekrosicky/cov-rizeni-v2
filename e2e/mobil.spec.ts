// Mobil: hlavní obrazovky bez vodorovného posouvání, ovládací prvky pohodlné pro dotyk.
import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test("hlavní obrazovky V2-1 se na mobilu nevodorovně neposouvají", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await page.waitForURL(/\/zakazky\/[0-9a-f-]{36}$/);
  const detail = new URL(page.url()).pathname;
  for (const path of ["/zakazky", detail, `${detail}/udalosti/nova`, `${detail}/historie`, `${detail}/clenove`, "/zakazky/nova", "/vyvoj/identita", `${detail}/dokumenty`, `${detail}/dokumenty/novy`]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  // Detail dokumentu (výkres se dvěma revizemi).
  await page.goto(`${detail}/dokumenty`);
  await page.getByRole("link", { name: "D.1.3 Technologie – dispozice (FIKTIVNÍ)" }).click();
  await page.waitForURL(/dokumenty\/[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.goto(detail);
  const box = await page.getByRole("link", { name: "+ Přidat událost" }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
