import { expect, type Page } from "@playwright/test";

/**
 * Vstup s fiktivní vývojovou identitou přes vstupní obrazovku (stejně jako uživatel):
 * odhlásit (smazat relaci) → /prihlaseni → výběr → „Co dnes řešit“ → pro testy pak seznam zakázek.
 */
export async function signInAs(page: Page, name: "Správce" | "Zástupce" | "Sledující 1" | "Sledující 2") {
  await page.context().clearCookies();
  await page.goto("/prihlaseni");
  await page.getByRole("button", { name: new RegExp(`^${name} \\(fiktivní\\)`) }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("heading", { name: "Co dnes řešit" })).toBeVisible();
  await expect(page.getByRole("note").first()).toContainText(`${name} (fiktivní)`);
  await page.goto("/zakazky");
}

export const formAlert = (page: Page) => page.locator("form [role=alert]");
