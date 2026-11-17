// End-to-end testy V2-1 v prohlížeči. Běží proti vývojovému serveru na SAMOSTATNÉ testovací databázi
// (data/e2e/db – před každým během se založí znovu s fiktivními daty); vývojovou databázi nemění.
// V Codespaces poprvé nainstalujte prohlížeč: npx playwright install chromium
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "cs-CZ",
    trace: "off",
    // Volitelně vlastní Chromium (např. předinstalované v prostředí): PW_CHROMIUM_PATH=/cesta/k/chromium
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "pocitac", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobil\.spec\.ts/ },
    { name: "mobil", use: { ...devices["Pixel 7"] }, testMatch: /mobil\.spec\.ts/ },
  ],
  webServer: {
    command: `node scripts/db-setup.ts --reset && next dev --hostname localhost --port ${PORT}`,
    url: `http://localhost:${PORT}/zakazky`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_DIR: "data/e2e/db", DEV_IDENTITIES: "enabled", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
