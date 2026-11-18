# Přihlášení – současný stav a návrh skutečného přihlášení

## 1. Současný stav (vývojová verze, jen fiktivní data)

| Režim | Kdy | Co uživatel uvidí |
|---|---|---|
| **Testovací** (`dev`) | jen `npm run dev` **a** `DEV_IDENTITIES=enabled` | vstupní obrazovka `/prihlaseni` s výběrem fiktivní identity, výrazně označená „POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení“ |
| **Uzavřeno** (`closed`) | vše ostatní, hlavně produkční sestavení (`next build` / `next start`) | jen `/prihlaseni` s textem „Přihlášení zatím není k dispozici – aplikace je uzavřená“; **žádná data, žádná navigace** |

Ochrana má tři vrstvy (každá platí samostatně):

1. **Proxy** (`src/proxy.ts` + čistá funkce `src/server/identity/gate.ts`): bez relace (a v uzavřeném režimu vždy) se každá
   stránka přesměruje na `/prihlaseni` a každé odeslání (POST) se odmítne kódem 401. Výjimka: adresa pro nahrání souboru –
   proxy by tělo nad 10 MB potichu zkrátil, proto si identitu ověřuje sama (401 bez přihlášení).
2. **Rozvržení aplikace** (`src/app/(aplikace)/layout.tsx` → `requireActor()`): identitu z cookie vždy ověří v databázi
   (fiktivní, aktivní uživatel). Neplatná či podvržená hodnota → `/prihlaseni`.
3. **Služby** (`src/server/services/*`): každé čtení i změna znovu kontroluje oprávnění ke konkrétní zakázce
   (`canProject`). Skrytí obrazovky nic nepovoluje – cizí zakázka vrátí 404 i přímou adresou.

Odhlášení: tlačítko **„Odhlásit se“** v horním pruhu smaže relaci a vrátí na vstupní obrazovku. Po výběru identity se otevře
přímo „Co dnes řešit“. Žádná hesla, žádné univerzální heslo – nic, co by se vydávalo za zabezpečení.

### Kde se později vymění

Celá aplikace zjišťuje přihlášeného uživatele jen přes `src/server/identity/session.ts`:
`getCurrentActor()`, `requireActor()`, `endSession()`, `identityMode()`. Obrazovky, služby i oprávnění pracují jen
s objektem `SessionActor` (id, role, stav). Skutečné přihlášení proto vymění **jen** obsah `session.ts`, vstupní obrazovku
`/prihlaseni` a rozhodnutí proxy o existenci relace (nový režim např. `"password"` v `mode.ts`). Zbytek aplikace se nepřepisuje.

## 2. Návrh: skutečné přihlášení e-mailem a heslem (samostatná etapa – NEZAHÁJENO)

Požadavek: individuální účty (e-mail + heslo), bez povinného Microsoft 365. Vlastní systém hesel **nepsat** – použít
ověřenou knihovnu.

**Doporučení: [Better Auth](https://www.better-auth.com/)** (licence MIT, zdarma, běží v naší aplikaci, bez externí služby).

| Proč | |
|---|---|
| E-mail + heslo přímo v knihovně | hašování hesel (scrypt), ověření e-mailu, obnova hesla, omezení počtu pokusů |
| Databáze | adaptér pro Drizzle + PostgreSQL – tabulky relací a účtů přes naši migraci (schvalovanou jako vždy) |
| Next.js App Router | serverové ověření relace, `httpOnly` / `Secure` cookie, ochrana proti CSRF |
| Budoucnost | lze později doplnit dvoufázové ověření (TOTP) nebo přihlášení Microsoft 365 jako **volitelnou** možnost |

Alternativy: **Auth.js** (zdarma, ale přihlášení heslem výslovně nedoporučuje a podporuje ho jen omezeně);
**hostované služby** (Clerk, Auth0, Supabase Auth) – pohodlné, ale placené tarify / externí zpracování dat (porušuje pravidlo
bez placených služeb).

Návrh obsahu etapy (před začátkem předložím podrobný plán a migraci ke schválení):

1. Ověřit aktuální verzi, licenci a bezpečnostní hlášení knihovny; přidat ji jako novou závislost se zdůvodněním.
2. Migrace: tabulky relací / účtů napojené na stávající `users` (role a přístupy k zakázkám zůstávají beze změny).
3. Účty zakládá **správce** (žádná veřejná registrace); první nastavení hesla odkazem e-mailem.
4. Odeslání e-mailů (pozvánka, obnova hesla): vyžaduje e-mailový server (SMTP) – je třeba vybrat bezplatnou nebo firemní možnost.
5. Omezení pokusů o přihlášení, platnost relace, odhlášení ze všech zařízení, záznam přihlášení do historie.
6. Vývojové fiktivní identity zůstanou jen pro `npm run dev`; v produkci je nahradí výhradně skutečné přihlášení.
7. Teprve potom (po ověření záloh a chráněného úložiště) lze uvažovat o skutečných datech.
