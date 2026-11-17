import { describe, expect, it } from "vitest";
import { codespacesDevOrigins, codespacesServerActionOrigins } from "./devOrigins";

const codespace = {
  CODESPACES: "true",
  CODESPACE_NAME: "moje-jmeno-abc123",
  GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev",
};

describe("codespacesDevOrigins", () => {
  it("mimo Codespaces nepovolí nic navíc", () => {
    expect(codespacesDevOrigins({})).toEqual([]);
  });

  it("v Codespaces povolí jen jednu konkrétní adresu", () => {
    expect(codespacesDevOrigins(codespace)).toEqual(["moje-jmeno-abc123-3000.app.github.dev"]);
  });

  it("podezřelé hodnoty (zástupné znaky, lomítka) odmítne", () => {
    expect(codespacesDevOrigins({ ...codespace, CODESPACE_NAME: "*" })).toEqual([]);
    expect(codespacesDevOrigins({ ...codespace, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "evil.com/x" })).toEqual([]);
  });
});

describe("codespacesServerActionOrigins – odesílatelé formulářů (CSRF)", () => {
  const dev = { isDevServer: true };

  it("ve vývojovém serveru v Codespaces povolí přesně adresu tohoto Codespaces a localhost:3000", () => {
    expect(codespacesServerActionOrigins(codespace, dev)).toEqual(["moje-jmeno-abc123-3000.app.github.dev", "localhost:3000"]);
  });

  it("produkční verze (build / start) nepovolí nic navíc ani v Codespaces", () => {
    expect(codespacesServerActionOrigins(codespace, { isDevServer: false })).toEqual([]);
  });

  it("mimo Codespaces nepovolí nic navíc ani ve vývoji", () => {
    expect(codespacesServerActionOrigins({}, dev)).toEqual([]);
    expect(codespacesServerActionOrigins({ ...codespace, CODESPACES: "false" }, dev)).toEqual([]);
  });

  it("podezřelé hodnoty proměnných odmítne – žádné zástupné znaky", () => {
    expect(codespacesServerActionOrigins({ ...codespace, CODESPACE_NAME: "*" }, dev)).toEqual([]);
    expect(codespacesServerActionOrigins({ ...codespace, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "**" }, dev)).toEqual([]);
    for (const o of codespacesServerActionOrigins(codespace, dev)) expect(o).not.toContain("*");
  });
});
