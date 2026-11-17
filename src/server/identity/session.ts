// Přihlášený uživatel pro obrazovky a serverové akce (Next.js). Zatím jen vývojová identita.
// Skutečné přihlášení e-mailem a heslem se připojí sem v samostatné etapě – zbytek aplikace se nezmění.
import { cookies } from "next/headers";
import { getDb } from "../db/client.ts";
import type { SessionActor } from "../services/common.ts";
import { DEV_IDENTITY_COOKIE, devIdentitiesEnabled, resolveDevActor } from "./devIdentity.ts";

export type IdentityMode = "dev" | "none";

export function identityMode(): IdentityMode {
  return devIdentitiesEnabled(process.env) ? "dev" : "none";
}

export async function getCurrentActor(): Promise<SessionActor | null> {
  if (identityMode() !== "dev") return null; // produkce: žádná identita, nic se nečte
  const store = await cookies();
  return resolveDevActor(getDb(), process.env, store.get(DEV_IDENTITY_COOKIE)?.value);
}
