import { describe, expect, it } from "vitest";
import { codespacesDevOrigins } from "./devOrigins";

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
