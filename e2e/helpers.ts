import { expect, type Page } from "@playwright/test";

/** Přepnutí fiktivní vývojové identity přes obrazovku (stejně jako uživatel). */
export async function signInAs(page: Page, name: "Správce" | "Zástupce" | "Sledující 1" | "Sledující 2") {
  await page.goto("/vyvoj/identita");
  await page.getByRole("button", { name: new RegExp(`^${name} \\(fiktivní\\)`) }).click();
  await page.waitForURL("**/zakazky");
  await expect(page.getByRole("note").first()).toContainText(`${name} (fiktivní)`);
}

export const formAlert = (page: Page) => page.locator("form [role=alert]");
