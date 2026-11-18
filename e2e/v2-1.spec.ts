// Průchod etapou V2-1: založení zakázky, události, přepínání fiktivních identit, oprávnění, souběh.
import { expect, test } from "@playwright/test";
import { formAlert, signInAs } from "./helpers";

test.describe.configure({ mode: "serial" });

let projectUrl = "";

test("bez identity se nic nezobrazí – jen vstupní obrazovka s výběrem fiktivní identity", async ({ page }) => {
  await page.goto("/zakazky");
  await page.waitForURL("**/prihlaseni");
  await expect(page.getByRole("heading", { name: "Vyberte fiktivní identitu" })).toBeVisible();
  await expect(page.getByText("POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toHaveCount(0);
});

test("zástupce založí zakázku a dvě události stejného typu", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.getByRole("link", { name: "+ Nová zakázka" }).click();
  await page.getByLabel("Název zakázky").fill("ČOV E2E – nová ČOV");
  await page.getByRole("button", { name: "Založit zakázku" }).click();
  await expect(page.getByRole("status")).toContainText("Zakázka byla založena");
  projectUrl = page.url().split("?")[0]!;
  await expect(page.getByText("Zástupce (fiktivní) · Zástupce · Úpravy")).toBeVisible();

  for (const [title, planned] of [["Zahájení montáže technologie – linka 1", "2027-04-12"], ["Zahájení montáže technologie – linka 2", "2027-06-07"]] as const) {
    await page.getByRole("link", { name: "+ Přidat událost" }).click();
    await page.getByLabel("Vlastní název").fill(title);
    await page.getByLabel("Plán").fill(planned);
    await page.getByRole("button", { name: "Uložit událost" }).click();
    await expect(page.getByRole("status")).toContainText("Událost byla uložena");
  }
  await expect(page.getByText("Plán 12. 4. 2027 (zatím nenastalo)")).toBeVisible();
  await expect(page.getByText("Plán 7. 6. 2027 (zatím nenastalo)")).toBeVisible();
});

test("událost bez termínu je povolená, skutečné datum v budoucnu ne (a formulář zůstane vyplněný)", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(projectUrl + "/udalosti/nova");
  await page.getByLabel("Typ události").selectOption("trial_operation");
  await page.getByLabel("Poznámka").fill("Termín zatím neznáme");
  await page.getByLabel("Skutečně nastalo").fill("2099-01-01");
  await page.getByRole("button", { name: "Uložit událost" }).click();
  await expect(page.getByText("Skutečné datum nemůže být v budoucnosti")).toBeVisible();
  await expect(page.getByLabel("Poznámka")).toHaveValue("Termín zatím neznáme");
  await page.getByLabel("Skutečně nastalo").fill("");
  await page.getByRole("button", { name: "Uložit událost" }).click();
  await expect(page.getByText("Termín čeká na ověření")).toBeVisible();
});

test("zástupce nepřiděluje přístupy ani nearchivuje", async ({ page }) => {
  await signInAs(page, "Zástupce");
  await page.goto(projectUrl + "/clenove");
  await expect(page.getByText("Přístupy přiděluje jen správce.")).toBeVisible();
  await page.goto(projectUrl + "/upravit");
  await expect(page.getByRole("heading", { name: "Archivovat zakázku" })).toHaveCount(0);
});

test("sledující vidí jen přidělenou zakázku a nic neupraví (S16)", async ({ page }) => {
  await signInAs(page, "Sledující 1");
  await expect(page.locator("main li h2")).toHaveText(["ČOV Fiktivín – intenzifikace"]);
  await expect(page.getByRole("link", { name: "+ Nová zakázka" })).toHaveCount(0);
  const res = await page.goto(projectUrl);
  expect(res?.status()).toBe(404);
  await page.goto("/zakazky");
  await page.getByRole("link", { name: /Fiktivín/ }).click();
  await expect(page.getByText("Váš přístup: Jen čtení")).toBeVisible();
  await expect(page.getByRole("link", { name: /Přidat událost|Upravit/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Historie změn" }).click();
  await expect(page.locator("main ol > li").first()).toBeVisible();
  await page.goto("/zakazky/nova");
  await expect(page.getByText("Zakládat zakázky smí jen správce nebo zástupce.")).toBeVisible();
});

test("správce přidělí sledujícímu jen čtení; přístup pro úpravy odmítne", async ({ page }) => {
  await signInAs(page, "Správce");
  await page.goto(projectUrl + "/clenove");
  await page.getByLabel("Uživatel").selectOption({ label: "Sledující 1 (fiktivní) (Sledující)" });
  await page.getByLabel("Přístup", { exact: true }).last().selectOption("edit");
  await page.getByRole("button", { name: "Přidat" }).click();
  await expect(formAlert(page)).toContainText("Sledující může mít jen přístup pro čtení");
  await page.getByLabel("Přístup", { exact: true }).last().selectOption("read");
  await page.getByRole("button", { name: "Přidat" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await signInAs(page, "Sledující 1");
  await expect(page.locator("main li h2")).toHaveText(["ČOV E2E – nová ČOV", "ČOV Fiktivín – intenzifikace"]);
});

test("vedoucím nelze zvolit sledujícího – nabídka obsahuje jen správce a zástupce", async ({ page }) => {
  await signInAs(page, "Správce");
  await page.goto("/zakazky/nova");
  const options = await page.getByLabel("Odpovědný vedoucí").locator("option").allInnerTexts();
  expect(options.join(" ")).not.toContain("Sledující");
});

test("souběžná úprava ve dvou oknech: druhé uložení se odmítne a nic se nepřepíše", async ({ page, context }) => {
  await signInAs(page, "Zástupce");
  await page.goto(projectUrl);
  const href = (await page.getByRole("link", { name: "Upravit / zapsat skutečnost" }).first().getAttribute("href"))!;
  const second = await context.newPage();
  await page.goto(href);
  await second.goto(href);
  await page.getByLabel("Plán").fill("2027-04-19");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("status")).toContainText("Událost byla uložena");
  await second.getByLabel("Plán").fill("2027-04-26");
  await second.getByRole("button", { name: "Uložit změny" }).click();
  await expect(formAlert(second)).toContainText("NEBYLY uloženy");
  await expect(second.getByLabel("Plán")).toHaveValue("2027-04-26");
  await page.goto(projectUrl);
  await expect(page.getByText("Plán 19. 4. 2027 (zatím nenastalo)")).toBeVisible();
});

test("archivace jen správcem a s důvodem; archivovaná zakázka je jen pro čtení", async ({ page }) => {
  await signInAs(page, "Správce");
  await page.goto(projectUrl + "/upravit");
  await page.getByRole("button", { name: "Archivovat" }).click();
  await expect(page.getByText("Uveďte důvod.").first()).toBeVisible();
  await page.getByLabel("Důvod archivace").fill("Fiktivní test archivace");
  await page.getByRole("button", { name: "Archivovat" }).click();
  await expect(page.getByRole("status")).toContainText("archivována");
  await expect(page.getByRole("link", { name: "+ Přidat událost" })).toHaveCount(0);
  await page.getByRole("link", { name: "Historie změn" }).click();
  await expect(page.getByText("Důvod: Fiktivní test archivace")).toBeVisible();
});
