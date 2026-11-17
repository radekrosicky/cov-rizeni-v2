// Adresy, ze kterých smí vývojový server (`npm run dev`) obsluhovat stránku.
// V GitHub Codespaces se aplikace otevírá přes přesměrovaný port
// „<název-codespace>-3000.<doména>“. Bez této výjimky Next.js blokuje
// vývojové prostředky (např. automatické obnovení stránky).
// Povoluje se JEDINÁ konkrétní adresa tohoto Codespace, žádné zástupné znaky.
// Platí jen pro vývojový server; produkční build ji nepoužívá.

type Env = Record<string, string | undefined>;

const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function codespacesDevOrigins(env: Env, port = 3000): string[] {
  if (env.CODESPACES !== "true") return [];
  const name = env.CODESPACE_NAME?.trim().toLowerCase() ?? "";
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim().toLowerCase() ?? "";
  if (!NAME_RE.test(name) || !DOMAIN_RE.test(domain)) return [];
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
  return [`${name}-${port}.${domain}`];
}

/**
 * Důvěryhodní odesílatelé serverových akcí (`serverActions.allowedOrigins`) – ochrana proti CSRF zůstává zapnutá.
 *
 * Next.js u každé serverové akce (formuláře) porovná hostitele z hlavičky `origin` (odkud prohlížeč
 * formulář odeslal) s hlavičkou `x-forwarded-host` (případně `host`). Když se liší a `origin` není
 * v tomto seznamu, akci odmítne: „Invalid Server Actions request“.
 *
 * Přesměrování portů GitHub Codespaces posílá aplikaci hlavičky s RŮZNÝMI adresami
 * (naměřeno ve V1, commit ad3730b): `origin` = localhost:3000, `x-forwarded-host` = adresa Codespaces;
 * podle způsobu otevření může přijít i opačná kombinace. Povolují se proto JEN tyto dvě konkrétní adresy,
 * a to jen když současně platí: běží vývojový server (`npm run dev`) a aplikace běží v GitHub Codespaces.
 * Produkční verze a běh mimo Codespaces: nic navíc. Žádné zástupné znaky.
 */
export function codespacesServerActionOrigins(env: Env, options: { isDevServer: boolean; port?: number }): string[] {
  if (!options.isDevServer) return [];
  const port = options.port ?? 3000;
  const publicHost = codespacesDevOrigins(env, port);
  if (publicHost.length === 0) return [];
  return [...publicHost, `localhost:${port}`];
}
