// Přihlášený uživatel pro obrazovky a serverové akce (Next.js) – JEDINÉ místo, kde aplikace zjišťuje, kdo je přihlášen.
// Zatím jen vývojová fiktivní identita; v produkci je aplikace uzavřená (vždy null).
// Skutečné přihlášení e-mailem a heslem se připojí sem v samostatné etapě (docs/PRIHLASENI.md) – zbytek aplikace se nezmění.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db/client.ts";
import type { SessionActor } from "../services/common.ts";
import { resolveDevActor } from "./devIdentity.ts";
import { DEV_IDENTITY_COOKIE, LOGIN_PATH, identityModeOf, type IdentityMode } from "./mode.ts";

export type { IdentityMode } from "./mode.ts";

export function identityMode(): IdentityMode {
  return identityModeOf(process.env);
}

export async function getCurrentActor(): Promise<SessionActor | null> {
  if (identityMode() !== "dev") return null; // uzavřený režim: žádná identita, nic se nečte
  const store = await cookies();
  return resolveDevActor(getDb(), process.env, store.get(DEV_IDENTITY_COOKIE)?.value);
}

/** Pro rozvržení aplikace: bez platné identity (ověřené v databázi) → vstupní obrazovka. */
export async function requireActor(): Promise<SessionActor> {
  const actor = await getCurrentActor();
  if (!actor) redirect(LOGIN_PATH);
  return actor;
}

/** Ukončení relace (vývojová identita: smazání cookie). */
export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_IDENTITY_COOKIE);
}
