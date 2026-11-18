// Vstupní brána: bez přihlášení nic kromě vstupní obrazovky; v produkčním režimu je aplikace uzavřená celá.
import { describe, expect, it } from "vitest";
import { gateDecision } from "./gate.ts";
import { identityModeOf } from "./mode.ts";

const PATHS = ["/", "/zakazky", "/zakazky/11111111-1111-4111-8111-111111111111", "/zakazky/x/dokumenty", "/zakazky/x/dokumenty/soubor/y", "/moje-ukoly", "/vyvoj/identita", "/neexistuje"];

describe("identityModeOf", () => {
  it("výběr fiktivní identity jen ve vývojovém serveru se zapnutými identitami", () => {
    expect(identityModeOf({ NODE_ENV: "development", DEV_IDENTITIES: "enabled" })).toBe("dev");
    expect(identityModeOf({ NODE_ENV: "development" })).toBe("closed");
    expect(identityModeOf({ NODE_ENV: "production", DEV_IDENTITIES: "enabled" })).toBe("closed");
    expect(identityModeOf({ NODE_ENV: "test", DEV_IDENTITIES: "enabled" })).toBe("closed");
  });
});

describe("gateDecision", () => {
  it("nepřihlášený: každá stránka → vstupní obrazovka; odeslání formuláře / nahrání → odmítnuto", () => {
    for (const path of PATHS) {
      expect(gateDecision({ mode: "dev", path, method: "GET", hasSessionCookie: false })).toEqual({ kind: "redirect", to: "/prihlaseni" });
      expect(gateDecision({ mode: "dev", path, method: "POST", hasSessionCookie: false })).toEqual({ kind: "deny" });
    }
  });

  it("vstupní obrazovka je dostupná vždy (i výběr identity na ní)", () => {
    for (const mode of ["dev", "closed"] as const) {
      expect(gateDecision({ mode, path: "/prihlaseni", method: "GET", hasSessionCookie: false }).kind).toBe("allow");
      expect(gateDecision({ mode, path: "/prihlaseni", method: "POST", hasSessionCookie: false }).kind).toBe("allow");
    }
    // podobná adresa není vstupní obrazovka
    expect(gateDecision({ mode: "dev", path: "/prihlaseni-x", method: "GET", hasSessionCookie: false }).kind).toBe("redirect");
  });

  it("vývojový režim s relací: projde (identitu v databázi a oprávnění pak ověří server)", () => {
    for (const path of PATHS) expect(gateDecision({ mode: "dev", path, method: "GET", hasSessionCookie: true }).kind).toBe("allow");
  });

  it("produkce (uzavřeno): ani s cookie fiktivní identity se nikam nedostane", () => {
    for (const path of PATHS) {
      expect(gateDecision({ mode: "closed", path, method: "GET", hasSessionCookie: true })).toEqual({ kind: "redirect", to: "/prihlaseni" });
      expect(gateDecision({ mode: "closed", path, method: "POST", hasSessionCookie: true })).toEqual({ kind: "deny" });
    }
  });
});
