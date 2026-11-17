# ČOV Řízení 2.0

Jednoduchý pracovní nástroj pro řízení realizací čistíren odpadních vod.
**Není to ERP.** Hlavní otázka: *„Co dnes musím řešit a proč?“*

> **Stav: etapa V2-0 – technický základ.**
> Aplikace zatím umí jen navigaci a prázdné, jasně označené obrazovky.
> Není v ní přihlášení, databáze ani ukládání dat. Používejte pouze fiktivní údaje.

## Co je hotové (V2-0)

| Oblast | Stav |
|---|---|
| Next.js 16 + TypeScript (strict) + Tailwind CSS 4 | ✅ funguje |
| Navigace „Co dnes řešit“ · „Zakázky“ · „Moje úkoly“ (počítač i mobil) | ✅ funguje |
| Prázdné stavy s označením „Zatím není k dispozici“ | ✅ funguje |
| Kontrola typů, lint, automatické testy (Vitest), build | ✅ funguje |
| Hlídání hranic vrstev (doména bez Reactu / Next.js / databáze) | ✅ lint + test |
| GitHub Codespaces (`.devcontainer`) a automatická kontrola (GitHub Actions) | ✅ připraveno |
| Zakázky, materiál, připravenost, úkoly, dokumenty, KD | ⛔ zatím neexistuje |
| Přihlášení a oprávnění | ⛔ zatím neexistuje (záměrně nic nepředstíráme) |
| Databáze a ukládání souborů | ⛔ čeká na schválení – viz [docs/OTAZKY-PRED-DATABAZI.md](docs/OTAZKY-PRED-DATABAZI.md) |

## Spuštění v GitHub Codespaces

1. Na stránce repozitáře na GitHubu přepněte větev na pracovní větev V2 (např. `v2-0-technicky-zaklad`).
2. Klikněte na zelené tlačítko **Code → Codespaces → Create codespace on …**.
3. Počkejte, až se prostředí připraví. Knihovny se nainstalují samy (`npm ci`), trvá to 1–3 minuty.
4. V terminálu dole spusťte:
   ```bash
   npm run dev
   ```
5. Vpravo dole se nabídne **Open in Browser** (případně záložka **Ports → 3000 → ikona zeměkoule**).

Port 3000 nechte **soukromý** (výchozí). Nikdy ho nepřepínejte na „Public“.

## Spuštění na vlastním počítači

Potřebujete Node.js 22 (verze je v souboru `.nvmrc`).

```bash
npm ci
```

```bash
npm run dev
```

Aplikace poběží na <http://localhost:3000>.

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server s automatickým obnovováním |
| `npm run typecheck` | kontrola typů TypeScriptu |
| `npm run lint` | kontrola kvality kódu (ESLint) včetně hranic vrstev |
| `npm test` | automatické testy (Vitest) |
| `npm run build` | produkční sestavení |
| `npm run check` | vše výše najednou (typy → lint → testy → build) |

## Struktura projektu

```
src/
  app/        obrazovky (Next.js App Router) – jen skládají UI, žádná pravidla
  ui/         sdílené komponenty vzhledu (rám aplikace, navigace, prázdný stav…)
  domain/     čistá doménová pravidla v TypeScriptu – bez Reactu, Next.js a databáze
  lib/        technické pomůcky bez obchodního významu (navigace, nastavení Codespaces)
tests/
  architecture/  testy hlídající hranice vrstev
docs/         technická dokumentace
```

Podrobnosti: [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md).

## Dokumentace

- [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md) – vrstvy, pravidla, plánovaná serverová část
- [docs/DATOVY-MODEL-NAVRH.md](docs/DATOVY-MODEL-NAVRH.md) – logický návrh vztahů (ne tabulky)
- [docs/OTAZKY-PRED-DATABAZI.md](docs/OTAZKY-PRED-DATABAZI.md) – rozhodnutí potřebná před databází
- [docs/PREVZETI-Z-V1.md](docs/PREVZETI-Z-V1.md) – co lze převzít z V1 (`radekrosicky/cov-rizeni`, commit `b7168b6`)

## Zásady

- Vývoj pouze s **fiktivními daty**. Skutečné smlouvy a výkresy až po skutečném přihlášení, serverových
  oprávněních, chráněném úložišti a ověřené obnově záloh (Master zadání, R9 a kap. 8).
- Žádné placené služby ani placená AI API.
- Změny jdou přes pracovní větve a pull requesty, ne přímo do `main`.
