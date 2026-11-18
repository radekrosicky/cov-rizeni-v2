// Fiktivní vývojová identita (schváleno v Q3): výběr fiktivního uživatele BEZ hesla.
// NENÍ to zabezpečení. Funguje jen při současném splnění všech podmínek:
//   1) vývojový server (NODE_ENV = "development"; produkční build má vždy "production"),
//   2) DEV_IDENTITIES = "enabled" (nastaveno jen v Codespaces / .env.development),
//   3) vybraný uživatel má is_dev_identity = true a je aktivní.
// Podmínky se ověřují při KAŽDÉM požadavku; v produkčním režimu se cookie úplně ignoruje.
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { isUuid, type SessionActor } from "../services/common.ts";

import { devIdentitiesEnabled } from "./mode.ts";

export { DEV_IDENTITY_COOKIE, devIdentitiesEnabled } from "./mode.ts";

type Env = Record<string, string | undefined>;

/** Uživatel z hodnoty cookie – jen fiktivní, aktivní a jen při zapnutých vývojových identitách. */
export async function resolveDevActor(db: Db, env: Env, cookieValue: string | undefined): Promise<SessionActor | null> {
  if (!devIdentitiesEnabled(env)) return null;
  if (!cookieValue || !isUuid(cookieValue)) return null;
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, cookieValue), eq(users.isDevIdentity, true), eq(users.status, "active")));
  if (!u) return null;
  return { id: u.id, globalRole: u.globalRole, status: u.status, displayName: u.displayName, email: u.email, isDevIdentity: true };
}

/** Fiktivní identity k výběru (prázdný seznam, pokud nejsou vývojové identity zapnuté). */
export async function listDevIdentities(db: Db, env: Env) {
  if (!devIdentitiesEnabled(env)) return [];
  return db
    .select({ id: users.id, displayName: users.displayName, globalRole: users.globalRole, email: users.email })
    .from(users)
    .where(and(eq(users.isDevIdentity, true), eq(users.status, "active")))
    .orderBy(users.email);
}
