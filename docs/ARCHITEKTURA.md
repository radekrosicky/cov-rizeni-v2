# Technická architektura ČOV Řízení 2.0

Stav: etapa V2-1. Všechny vrstvy existují včetně `server` (databáze PGlite + Drizzle, služby, vývojová identita).

Konvence importů: `src/domain` a `src/server` používají **relativní importy s příponou `.ts`**, aby šly
databázové skripty spouštět přímo v Node.js (bez další knihovny). Obrazovky (`src/app`, `src/ui`) používají `@/…`
a k serveru přistupují jen přes `src/server/app.ts` a `src/server/identity/session.ts` (hlídá lint).

## Proč Next.js + TypeScript

- Jedna technologie pro obrazovky i serverovou logiku → méně pohyblivých částí pro malý tým.
- V1 na ní běžela a prokázala se (stejné verze Next 16, React 19, Tailwind 4, Vitest).
- Serverové komponenty a serverové akce umožní kontrolovat oprávnění **na serveru**, ne v prohlížeči.
- TypeScript v režimu `strict` (+ `noUncheckedIndexedAccess`) zachytí velkou část chyb před spuštěním.

Konkrétní důvod zvolit něco jiného jsme nenašli.

## Vrstvy a směr závislostí

```
 src/app      obrazovky / routy (tenké: načtou data, složí UI, zavolají akci)
   │
   ├──► src/ui        prezentační komponenty (React, Tailwind), bez obchodních pravidel
   │
   └──► src/server    aplikační služby: přihlášený uživatel, oprávnění,
          │           transakce, zápis historie, úložiště souborů
          │
          ├──► src/domain   čistá pravidla (výpočty termínů, stavy, odvozené přehledy)
          └──► adaptéry     databáze, soubory, identita – za rozhraními, vyměnitelné
```

Pravidla:

1. **`src/domain` je čistý TypeScript.** Žádný React, Next.js, `node:*`, databáze ani síť. Vstup → výstup.
   Hlídá to ESLint (`no-restricted-imports` v `eslint.config.mjs`) i test `tests/architecture/layers.test.ts`.
2. **Obrazovky neobsahují pravidla.** Např. „kdy objednat“ nebo „je etapa připravená“ se počítá v doméně
   a obrazovka jen zobrazí výsledek.
3. **Oprávnění se kontrolují na serveru** při každém čtení i zápisu (ne skrytím tlačítka).
4. **Každá změna = jedna transakce = změna + záznam historie.** Když se nezapíše historie, neuloží se ani změna.
5. **Odvozené údaje se neukládají jako druhá kopie.** „Co dnes řešit“, souhrn připravenosti, termín objednání
   a stav „po termínu“ se počítají z faktů. Uložit lze maximálně cache, nikdy autoritativní hodnotu.
6. **Uložení musí být poznat.** Uživatel uvidí potvrzení až po skutečném uložení na serveru
   (žádné „optimistické“ potvrzení při slabém signálu – scénář S11).

## Plánovaná struktura (po schválení dat)

```
src/
  app/                 routy: /, /zakazky, /zakazky/[id]/{prehled,material,ukoly,pripravenost,dokumenty}, /moje-ukoly
  ui/                  komponenty
  domain/
    calendar/          pracovní/kalendářní dny, české svátky, Europe/Prague (převzetí z V1 – viz PREVZETI-Z-V1.md)
    material/          termín objednání, stav dodávky
    readiness/         souhrn připravenosti z podmínek
    today/             skládání ranního přehledu, slučování stejné příčiny
    access/            pravidla rolí (čistá funkce can(actor, action, project))
  server/
    services/          případy užití (např. „zaznamenat objednáno“) – oprávnění + transakce + historie
    adapters/          db, file storage, identity
  lib/                 technické pomůcky
tests/
  architecture/        hranice vrstev
  e2e/                 [později] Playwright scénáře S1–S16
```

## Testování

- **Jednotkové testy (Vitest)** – hlavně doména: výpočty termínů, stavy, oprávnění. Rychlé, bez databáze.
- **Komponentové testy** – vykreslení přes `react-dom/server` (bez prohlížeče), např. prázdné stavy.
- **Architektonické testy** – hranice vrstev.
- **[Později] Integrační testy služeb** proti skutečné (lokální) databázi.
- **[Později] End-to-end (Playwright)** – akceptační scénáře S1–S16 z Master zadání.
- **CI** – `.github/workflows/ci.yml`: typy → lint → testy → build při každém push.

## Vzhled

- Navazuje na V1: světlé pozadí `#f6f8fb`, tmavě modrá navigace `#10345c`, bílé karty, hlavní modrá `#2463b5`.
- Signály: červená = známý problém, oranžová = blížící se riziko, šedá = neověřeno, zelená = doloženo splněno;
  vždy se slovním popisem (`src/domain/signal.ts`).
- Mobil: navigace jako tři velká tlačítka nahoře (výška ≥ 44 px), bez vodorovného posouvání.
