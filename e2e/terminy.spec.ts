// V2-4 Termíny materiálu a doporučené objednání – průchod v prohlížeči (jen fiktivní data).
// „Dnes“ je skutečné datum běhu testu – kontrolují se proto jen termíny, které na něm nezávisí.
import { expect, test, type Page } from "@playwright/test";
import { formAlert, signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

let projectUrl = "";

async function openNeed(page: Page, name: string) {
  await page.goto(`${projectUrl}/material`);
  await page.getByRole("link", { name }).click();
  await page.waitForURL(/\/material\/[0-9a-f-]{36}/);
}

test("detail dodávky: doporučené datum objednání na první pohled + vysvětlení výpočtu", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await page.waitForURL(/\/zakazky\/[0-9a-f-]{36}$/);
  projectUrl = new URL(page.url()).pathname;
  await page.goto(`${projectUrl}/material`);
  // Seznam ukazuje termín u každé dodávky.
  await expect(page.locator("li", { hasText: "Dmychadla D1–D2 (fiktivní)" })).toContainText("Objednat nejpozději 28. 12. 2026");
  await openNeed(page, "Dmychadla D1–D2 (fiktivní)");
  await expect(page.getByTestId("order-by")).toHaveText("28. 12. 2026");
  await expect(page.getByRole("heading", { name: "Jak se datum vypočítalo" })).toBeVisible();
  await expect(page.getByText("Plánovaný termín „Zahájení montáže technologie – linka 1“: 1. 3. 2027.")).toBeVisible();
  await expect(page.getByText(/Bezpečnostní rezerva 14 kalendářních dní → dodat nejpozději 8\. 2\. 2027/)).toBeVisible();
  await expect(page.getByText(/Dodací lhůta 42 kalendářních dní → objednat nejpozději 28\. 12\. 2026/)).toBeVisible();
  await expect(page.getByText("Objednávky aplikace zatím neeviduje", { exact: false })).toBeVisible();
});

test("nová dodávka: návrh události jen nabídne, uživatel ji vybere; odhad lhůty se výrazně označí", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(`${projectUrl}/material/nova`);
  await page.getByLabel("Název dodávky").fill("Míchadla aktivace (fiktivní)");
  await page.getByRole("button", { name: "Vytvořit dodávku" }).click();
  await expect(page.getByRole("status")).toContainText("Sledovaná dodávka byla vytvořena");
  await expect(page.getByTestId("order-by")).toHaveText("nelze určit");
  await expect(page.getByText("Určete, kdy materiál potřebujete", { exact: false }).first()).toBeVisible();
  // Návrh je jen text – výběr zůstává „zatím neurčeno“, dokud ho uživatel nezmění.
  await expect(page.getByText(/Návrh: „Zahájení montáže technologie – linka 1“/)).toBeVisible();
  const select = page.getByLabel("Montážní událost / milník");
  await expect(select).toHaveValue("");
  // Chyba: odhad bez počtu dní → nic se neuloží, formulář zůstane vyplněný.
  await select.selectOption({ label: "Zahájení montáže technologie – linka 1 – plán 1. 3. 2027 ← navrženo" });
  await page.getByLabel("Posun vůči události (kalendářní dny)").fill("-7");
  await page.getByLabel("Stav dodací lhůty").selectOption("estimate");
  await page.getByRole("button", { name: "Uložit termíny" }).click();
  await expect(formAlert(page)).toContainText("Formulář obsahuje chyby");
  await expect(page.getByText("Zadejte dodací lhůtu ve dnech (0 = skladem, k dispozici ihned).")).toBeVisible();
  await expect(page.getByLabel("Posun vůči události (kalendářní dny)")).toHaveValue("-7");
  await page.getByLabel("Dodací lhůta (dny)").fill("30");
  await page.getByLabel("Počítat ve dnech").selectOption("working");
  await page.getByRole("button", { name: "Uložit termíny" }).click();
  await expect(page.getByRole("status")).toContainText("Doporučené objednání se přepočítalo");
  await expect(page.getByTestId("order-by")).toHaveText("23. 12. 2026");
  await expect(page.getByText("Doporučené objednání – PŘEDBĚŽNÉ")).toBeVisible();
  await expect(page.getByText(/^Dodací lhůtu ověřit – jde jen o odhad/)).toBeVisible();
  await expect(page.getByText(/30 pracovních dní \(bez víkendů a svátků\)/)).toBeVisible();
});

test("lhůta 0 dní (skladem) a vlastní datum s důvodem", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openNeed(page, "Míchadla aktivace (fiktivní)");
  await page.getByText("Nastavit termín potřeby, dodací lhůtu a rezervu").click();
  await page.getByLabel("Montážní událost / milník").selectOption("");
  await page.getByLabel("Posun vůči události (kalendářní dny)").fill("0");
  await page.getByText("Výjimečně: vlastní datum potřeby").click();
  await page.getByLabel("Vlastní datum potřeby").fill("2027-04-12");
  await page.getByRole("button", { name: "Uložit termíny" }).click();
  await expect(page.getByText("U vlastního data uveďte důvod", { exact: false })).toBeVisible();
  await page.getByLabel("Důvod vlastního data").fill("Dodávka pro provizorní provoz (fiktivní)");
  await page.getByLabel("Stav dodací lhůty").selectOption("confirmed");
  await page.getByLabel("Dodací lhůta (dny)").fill("0");
  await page.getByLabel("Počítat ve dnech").selectOption("calendar");
  await page.getByLabel("Rezerva před potřebou (kalendářní dny)").fill("14");
  await page.getByRole("button", { name: "Uložit termíny" }).click();
  // 12. 4. 2027 − 14 = 29. 3. 2027 (Velikonoční pondělí) → předchozí pracovní den 25. 3. (26. 3. Velký pátek)
  await expect(page.getByTestId("order-by")).toHaveText("25. 3. 2027");
  await expect(page.getByText(/Velikonoční pondělí\) → objednání posunuto na předchozí pracovní den 25\. 3\. 2027/)).toBeVisible();
  await expect(page.getByText(/Vlastní datum potřeby .*Důvod: Dodávka pro provizorní provoz/)).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "0 kalendářních dní (skladem)" })).toBeVisible();
});

test("„Co dnes řešit“: klikací karty s akcí a krátkým časovým údajem; netvrdí „neobjednáno“", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto("/");
  const cards = page.getByRole("list", { name: "Akce na dnes" }).getByRole("link");
  // Nejnaléhavější první: prošlý termín → „Ověřit objednání“ (nikdy „neobjednáno“).
  await expect(cards.first()).toContainText("Ověřit objednání: Česle strojně stírané (fiktivní)");
  await expect(cards.first()).toContainText(/ČOV Fiktivín – intenzifikace · Po termínu o \d+ (den|dny|dní)/);
  await expect(page.getByRole("link", { name: /Ověřit dodací lhůtu: Rozvaděč RM1 \(fiktivní\).*Termín neznámý/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Doplnit termín montáže: Dmychadla – strojovna \(fiktivní\).*ČOV Testovice/ })).toBeVisible();
  // Každá dodávka nejvýše jednou; podrobnosti (lhůty, rezervy, výpočty) na přehledu nejsou.
  const texts = await cards.allInnerTexts();
  expect(new Set(texts).size).toBe(texts.length);
  await expect(page.getByText(/neobjednáno/i)).toHaveCount(0);
  await expect(page.getByText("Jak se datum vypočítalo")).toHaveCount(0);
  await expect(page.getByText(/rezerva|dodací lhůta \d/i)).toHaveCount(0);
  // Celá karta je odkaz na detail dodávky.
  await page.getByRole("link", { name: /Ověřit dodací lhůtu: Rozvaděč RM1/ }).click();
  await expect(page.getByTestId("order-by")).toHaveText("nelze určit");
  await expect(page.getByText("Dodací lhůta není známá – zeptejte se dodavatele.", { exact: false })).toBeVisible();
});

test("sledující: vidí termíny a přehled svých zakázek, ale nic nemění", async ({ page }) => {
  await signInAs(page, "Sledující 1");
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Ověřit objednání: Česle strojně stírané/ })).toBeVisible();
  await expect(page.getByText("ČOV Testovice")).toHaveCount(0);
  await openNeed(page, "Dmychadla D1–D2 (fiktivní)");
  await expect(page.getByTestId("order-by")).toHaveText("28. 12. 2026");
  await expect(page.getByText("Nastavit termín potřeby, dodací lhůtu a rezervu")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Upravit termín události/ })).toHaveCount(0);
});

test("posun montáže v události automaticky přepočte doporučené objednání", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await openNeed(page, "Dmychadla D1–D2 (fiktivní)");
  await page.getByRole("link", { name: "Upravit termín události „Zahájení montáže technologie – linka 1“" }).click();
  await expect(page.getByRole("heading", { name: /Navázané dodávky \(\d+\)/ })).toBeVisible();
  await expect(page.locator("li", { hasText: "Dmychadla D1–D2 (fiktivní)" })).toContainText("28. 12. 2026");
  await page.getByLabel("Plán").fill("2027-03-15");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await openNeed(page, "Dmychadla D1–D2 (fiktivní)");
  await expect(page.getByTestId("order-by")).toHaveText("11. 1. 2027");
  await expect(page.getByText("Plánovaný termín „Zahájení montáže technologie – linka 1“: 15. 3. 2027.")).toBeVisible();
});
