# CLAUDE.md – pravidla pro práci na ČOV Řízení 2.0

## Produkt (Master zadání v1.0)

- Jednoduchý pracovní nástroj pro řízení realizací ČOV, **ne ERP**. Hlavní hodnota: „Co dnes musím řešit a proč?“
- Priorita: materiál, připravenost stavby, každodenní práce. Zakázka je centrální prvek.
- Jeden údaj = jeden autoritativní zdroj (datum montáže jen v jedné události/milníku).
- Neověřeno ≠ nesplněno. Plánované ≠ skutečné. Zápis z KD ≠ schválená změna. Návrh ≠ potvrzená hodnota.
- Globální navigace jen „Co dnes řešit“ · „Zakázky“ · „Moje úkoly“.

## Pravidla práce

- Komunikace česky, srozumitelně; vlastník projektu není programátor.
- Pracuj po etapách. Další etapu (V2-1 …) nezačínej bez výslovného souhlasu.
- Nikdy necommituj přímo do `main`; pracovní větev + pull request.
- Pouze fiktivní data. Žádné skutečné firemní údaje, jména ani smlouvy.
- Žádné placené služby ani placená AI API. Nová závislost = zdůvodnit a nechat schválit.
- Nová migrace = předložit ke schválení před aplikací; do `drizzle/schvalene-migrace.json` až po schválení. Schválené migrace (`0000`–`0003`) neměnit.
- `npm run db:reset` jen s vypnutou aplikací; maže jen vývojovou databázi v `data/`.
- Nepředstírej neexistující funkce. Žádné falešné přihlášení vydávané za zabezpečení.
- Neměň repozitář V1 (`radekrosicky/cov-rizeni`).

## Technika

- Next.js (App Router) + TypeScript strict + Tailwind CSS 4 + Vitest + ESLint.
- Vrstvy: `src/app` (obrazovky) → `src/ui` (komponenty) → `src/domain` (čistá pravidla).
  `src/domain` nesmí importovat React, Next.js, Node API ani databázi (hlídá lint i test).
- `src/server/services`: každá změna = oprávnění (doména) + jedna transakce + historie + kontrola `version`.
- Obrazovky nevolají databázi přímo – jen `src/server/app.ts` (hlídá lint).
- Soubory jen přes rozhraní `FileStorage` (nikdy nepřepsat, klíč generuje server); typ souboru podle obsahu.
- Nahrávání souborů jen samostatnou adresou s průběžným zpracováním a kontrolou původu (ne serverovou akcí).
- Excel se čte jen v samostatném procesu (`src/server/budget/reader.ts`) s limity – nikdy přímo v aplikaci.
- Testy souběhu běží na PGlite (jedno spojení) – před ostrým provozem ověřit na PostgreSQL.
- V `src/domain` a `src/server` nepoužívat zkrácené vlastnosti v konstruktoru (`constructor(private x)`) – Node je nespustí.
- V `src/domain` a `src/server` relativní importy s příponou `.ts` (skripty běží přímo v Node.js).
- UI česky, identifikátory v kódu anglicky, komentáře česky.
- Před odevzdáním: `npm run check` a `npm run test:e2e` musí projít.
