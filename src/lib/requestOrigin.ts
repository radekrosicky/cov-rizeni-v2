// Ochrana proti CSRF pro samostatné serverové adresy (route handlery), které – na rozdíl od serverových
// akcí – nemají kontrolu původu vestavěnou. Stejná pravidla jako Next.js u formulářů:
// hostitel z `Origin` musí odpovídat adrese serveru (`x-forwarded-host` / `host`), nebo být na seznamu
// výjimek pro vývojový server v Codespaces (jen localhost:3000 a adresa tohoto Codespaces).
import { codespacesServerActionOrigins } from "./devOrigins.ts";

type Env = Record<string, string | undefined>;

export function isSameOriginRequest(headers: Headers, env: Env): boolean {
  const origin = headers.get("origin");
  if (!origin || origin === "null") return false; // nahrávání vždy z naší stránky – Origin musí být uveden
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  const host = headers.get("host")?.toLowerCase();
  if (originHost === forwarded || originHost === host) return true;
  return codespacesServerActionOrigins(env, { isDevServer: env.NODE_ENV === "development" }).includes(originHost);
}
