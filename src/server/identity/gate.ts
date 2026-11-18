// Vstupní brána: rozhodnutí pro proxy PŘED zobrazením jakékoli stránky. Čistá funkce (testovatelná).
// Je to jen PRVNÍ, rychlá kontrola (zda vůbec existuje relace). Skutečné ověření identity v databázi
// a kontrola oprávnění probíhá vždy na serveru: v rozvržení aplikace (requireActor) a v každé službě.
import { LOGIN_PATH, type IdentityMode } from "./mode.ts";

export type GateDecision = { kind: "allow" } | { kind: "redirect"; to: string } | { kind: "deny" };

export function gateDecision(input: { mode: IdentityMode; path: string; method: string; hasSessionCookie: boolean }): GateDecision {
  const { mode, path, method, hasSessionCookie } = input;
  // Vstupní obrazovka je dostupná vždy (v uzavřeném režimu jen s informací, že přihlášení není k dispozici).
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) return { kind: "allow" };
  const signedIn = mode === "dev" && hasSessionCookie;
  if (signedIn) return { kind: "allow" };
  // Nepřihlášený / uzavřená aplikace: stránky přesměrovat na vstup, vše ostatní (odeslání formuláře,
  // nahrání souboru) odmítnout – nic se neprovede.
  return method === "GET" || method === "HEAD" ? { kind: "redirect", to: LOGIN_PATH } : { kind: "deny" };
}
