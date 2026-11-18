// Režim přihlášení – bez databáze, aby ho mohl použít i proxy (běží před každým požadavkem).
//
// Dnes existují jen dva režimy:
//   "dev"    – vývojový server + DEV_IDENTITIES=enabled: výběr fiktivní identity BEZ hesla (není to zabezpečení);
//   "closed" – vše ostatní (produkční sestavení): aplikace je UZAVŘENÁ, nikdo nic neuvidí.
// Skutečné přihlášení e-mailem a heslem přidá samostatná etapa jako třetí režim (viz docs/PRIHLASENI.md);
// obrazovky a služby se tím nemění – pracují jen s getCurrentActor() / requireActor().

type Env = Record<string, string | undefined>;

export type IdentityMode = "dev" | "closed";

/** Cookie vývojové identity (obsahuje jen id fiktivního uživatele; každý požadavek se ověřuje v databázi). */
export const DEV_IDENTITY_COOKIE = "cov_dev_identity";

/** Vstupní (přihlašovací) obrazovka – jediná stránka dostupná bez přihlášení. */
export const LOGIN_PATH = "/prihlaseni";

export function devIdentitiesEnabled(env: Env): boolean {
  return env.NODE_ENV === "development" && env.DEV_IDENTITIES === "enabled";
}

export function identityModeOf(env: Env): IdentityMode {
  return devIdentitiesEnabled(env) ? "dev" : "closed";
}
