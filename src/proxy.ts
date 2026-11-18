// Proxy (Next.js 16, dříve „middleware“): běží před každým požadavkem kromě technických souborů.
// Nepřihlášeného uživatele pošle na vstupní obrazovku; v produkčním režimu je aplikace uzavřená celá.
// Pozor: jde jen o první kontrolu. Identitu v databázi a oprávnění ověřuje vždy server (rozvržení + služby).
import { NextResponse, type NextRequest } from "next/server";
import { gateDecision } from "./server/identity/gate";
import { DEV_IDENTITY_COOKIE, identityModeOf } from "./server/identity/mode";

export function proxy(request: NextRequest) {
  const decision = gateDecision({
    mode: identityModeOf(process.env),
    path: request.nextUrl.pathname,
    method: request.method,
    hasSessionCookie: !!request.cookies.get(DEV_IDENTITY_COOKIE)?.value,
  });
  if (decision.kind === "allow") return NextResponse.next();
  if (decision.kind === "redirect") return NextResponse.redirect(new URL(decision.to, request.url));
  return new NextResponse("Nejste přihlášeni. Nic nebylo provedeno.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export const config = {
  // Nekontroluje se:
  //  - technické soubory Next.js (skripty, styly, obnovování ve vývoji) a ikona – neobsahují data;
  //  - adresa pro NAHRÁNÍ souboru (…/dokumenty/nahrat): proxy by tělo požadavku načetl do paměti a nad 10 MB
  //    ho POTICHU ZKRÁTIL (zjištěno testem s 49 MB). Tato adresa sama ověřuje původ, identitu (bez ní 401)
  //    i oprávnění k zakázce na serveru, takže ochrana zůstává.
  matcher: ["/((?!_next/|favicon\\.ico$|zakazky/[^/]+/dokumenty/nahrat$).*)"],
};
