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
- Databázové tabulky a migrace až po schválení `docs/OTAZKY-PRED-DATABAZI.md`.
- Nepředstírej neexistující funkce. Žádné falešné přihlášení vydávané za zabezpečení.
- Neměň repozitář V1 (`radekrosicky/cov-rizeni`).

## Technika

- Next.js (App Router) + TypeScript strict + Tailwind CSS 4 + Vitest + ESLint.
- Vrstvy: `src/app` (obrazovky) → `src/ui` (komponenty) → `src/domain` (čistá pravidla).
  `src/domain` nesmí importovat React, Next.js, Node API ani databázi (hlídá lint i test).
- UI česky, identifikátory v kódu anglicky, komentáře česky.
- Před odevzdáním: `npm run check` (typy, lint, testy, build) musí projít.
