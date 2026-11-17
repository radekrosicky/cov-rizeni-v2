import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./requestOrigin";

const h = (o: Record<string, string>) => new Headers(o);
const cs = { CODESPACES: "true", CODESPACE_NAME: "ukazka-abc123", GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: "app.github.dev" };
const csHost = "ukazka-abc123-3000.app.github.dev";

describe("isSameOriginRequest – CSRF pro nahrávání", () => {
  it("stejný původ projde, cizí doména ne", () => {
    expect(isSameOriginRequest(h({ origin: "http://localhost:3000", host: "localhost:3000" }), {})).toBe(true);
    expect(isSameOriginRequest(h({ origin: "https://evil.example.com", host: "localhost:3000" }), {})).toBe(false);
  });
  it("chybějící nebo nesmyslný Origin se odmítne", () => {
    expect(isSameOriginRequest(h({ host: "localhost:3000" }), {})).toBe(false);
    expect(isSameOriginRequest(h({ origin: "null", host: "localhost:3000" }), {})).toBe(false);
    expect(isSameOriginRequest(h({ origin: "::nesmysl", host: "localhost:3000" }), {})).toBe(false);
  });
  it("Codespaces – naměřená kombinace hlaviček projde", () => {
    expect(isSameOriginRequest(h({ origin: "http://localhost:3000", host: "localhost:3000", "x-forwarded-host": csHost }), { ...cs, NODE_ENV: "development" })).toBe(true);
  });
  it("Codespaces – opačná kombinace projde jen ve vývojovém serveru v Codespaces", () => {
    const headers = h({ origin: `https://${csHost}`, host: "localhost:3000", "x-forwarded-host": "localhost:3000" });
    expect(isSameOriginRequest(headers, { ...cs, NODE_ENV: "development" })).toBe(true);
    expect(isSameOriginRequest(headers, { ...cs, NODE_ENV: "production" })).toBe(false);
    expect(isSameOriginRequest(headers, { NODE_ENV: "development" })).toBe(false);
  });
  it("cizí Codespace neprojde", () => {
    expect(isSameOriginRequest(h({ origin: "https://jiny-3000.app.github.dev", host: "localhost:3000", "x-forwarded-host": csHost }), { ...cs, NODE_ENV: "development" })).toBe(false);
  });
});
