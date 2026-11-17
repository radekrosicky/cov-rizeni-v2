# ČOV Řízení 2.0

Jednoduchý pracovní nástroj pro řízení realizací čistíren odpadních vod.
**Není to ERP.** Hlavní otázka: *„Co dnes musím řešit a proč?“*

> **Stav: etapa V2-2 – dokumenty zakázky** (navazuje na V2-1: zakázka, uživatelé, oprávnění, události a milníky).
> Pouze fiktivní data. Skutečné přihlášení zatím neexistuje – ve vývojovém režimu se volí
> **fiktivní vývojová identita** (není to zabezpečení; v produkčním režimu je technicky vypnutá).

## Co funguje (V2-1 + V2-2)

| Oblast | Stav |
|---|---|
| Zakázky: seznam, založení, úprava, archivace / obnova s důvodem | ✅ |
| Události a milníky: smluvní / plánovaný / skutečný termín (vše nepovinné), více událostí stejného typu, zrušení s důvodem | ✅ |
| Role správce / zástupce / sledující, přístup po zakázkách, kontrola na serveru | ✅ |
| Vedoucí zakázky je vždy členem s úpravami a nikdy sledující (hlídá i databáze) | ✅ |
| Historie změn (jen přidávání), čtou ji i sledující | ✅ |
| Ochrana před tichým přepsáním souběžných úprav | ✅ |
| Fiktivní vývojové identity (jen `npm run dev`) | ✅ |
| **Dokumenty:** nahrání, seznam s filtrem podle druhu, otevřít / stáhnout, revize (aktuální / nahrazená), změna aktuální revize s důvodem, archivace s důvodem, historie | ✅ V2-2 |
| Kontrola typu souboru podle obsahu (PDF, XLSX, DOCX, JPG, PNG, WEBP, HEIC, TIFF, DWG, DXF; XLSX/DOCX včetně struktury a rozbaleného obsahu), limit 50 MB | ✅ V2-2 |
| Detail zakázky – záložky Materiál, Úkoly, Připravenost | ⛔ jasně označené prázdné stavy |
| „Co dnes řešit“, „Moje úkoly“ | ⛔ jasně označené prázdné stavy |
| Skutečné přihlášení e-mailem a heslem | ⛔ samostatná etapa |

## Spuštění v GitHub Codespaces

1. Na GitHubu přepněte na větev `v2-2-dokumenty`.
2. **Code → Codespaces → Create codespace on …**
3. Počkejte na přípravu: nainstalují se knihovny a **založí se vývojová databáze s fiktivními daty**
   (`npm run db:setup -- --if-missing`).
4. V terminálu spusťte:
   ```bash
   npm run dev
   ```
5. Otevřete port 3000 (**Open in Browser**). Klikněte na **Vybrat fiktivní identitu** a zvolte např. *Zástupce*.

Port 3000 nechte **soukromý** (výchozí). Nikdy ho nepřepínejte na „Public“.

Fiktivní uživatelé: **Správce**, **Zástupce**, **Sledující 1**, **Sledující 2** (e-maily `@example.test`).
Fiktivní zakázky: *ČOV Fiktivín* (sledující 1 čte), *ČOV Testovice* (sledující 2 čte), *ČOV Vzorová* (sledující ji nevidí).
*ČOV Fiktivín* má 7 fiktivních dokumentů (smlouva, dodatek, výkres ve 2 revizích, rozpočet XLSX, zápis z KD DOCX, foto, DXF).

### Už otevřený Codespace z dřívější větve
Zastavte aplikaci (Ctrl+C) a spusťte postupně:

```bash
git fetch origin
```

```bash
git switch v2-2-dokumenty
```

```bash
npm ci
```

```bash
npm run db:migrate
```

```bash
npm run dev
```

`db:migrate` doplní tabulky dokumentů a vaše dosavadní zkušební data ponechá. Chcete-li i fiktivní dokumenty,
použijte místo něj `npm run db:reset` (smaže vývojovou databázi a založí ji znovu s fiktivními daty).

## Spuštění na vlastním počítači

Potřebujete Node.js 22.18 nebo novější (`.nvmrc`).

```bash
npm ci
```

```bash
npm run db:setup
```

```bash
npm run dev
```

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm run dev` | vývojový server (s fiktivními identitami) na <http://localhost:3000> |
| `npm run check` | typy → lint → testy → build |
| `npm test` | automatické testy (Vitest; databázové testy na dočasné databázi v paměti) |
| `npm run test:e2e` | testy v prohlížeči (Playwright) na samostatné testovací databázi `data/e2e` |
| `npm run db:setup` | založí **prázdnou** vývojovou databázi, aplikuje migrace, nahraje fiktivní data; existující nepřepíše |
| `npm run db:reset` | smaže vývojovou databázi a založí ji znovu s fiktivními daty (aplikace nesmí běžet) |
| `npm run db:migrate` | doplní nové schválené migrace do existující vývojové databáze |
| `npm run db:check` / `db:generate` | kontrola / vygenerování migrací (nic neaplikuje) |

Nastavení (proměnné prostředí): `MAX_UPLOAD_MB` – limit velikosti souboru (výchozí 50),
`FILES_DIR` – složka souborů (výchozí `data/dev/files`, musí ležet v `data/`), `DATABASE_DIR` – složka databáze.
Migrace se aplikují jen ze seznamu schválených (`drizzle/schvalene-migrace.json`).

Testy v prohlížeči v Codespaces potřebují jednou nainstalovat prohlížeč (zdarma):

```bash
npx playwright install --with-deps chromium
```

## Struktura projektu

```
src/
  app/            obrazovky a serverové akce (Next.js) – nepřistupují k databázi přímo
  ui/             sdílené komponenty (formuláře, odznaky, rám aplikace)
  domain/         čistá pravidla: oprávnění, termíny událostí, kalendář (svátky, Europe/Prague)
  server/
    app.ts        vstup pro obrazovky: služby s připojenou databází
    services/     případy užití: oprávnění + transakce + historie + kontrola verze
    identity/     fiktivní vývojová identita (později skutečné přihlášení)
    db/           schéma, připojení, migrace, pravidla schématu
    storage/      úložiště souborů (rozhraní + místní vývojové úložiště; později firemní úložiště)
    documents/    kontrola nahraných souborů podle obsahu
    seed/         fiktivní data
  lib/            technické pomůcky
drizzle/          SQL migrace (0000 tabulky, 0001 ochrany, 0002 dokumenty) + seznam schválených
scripts/          db:setup / db:reset / db:migrate
e2e/              testy v prohlížeči
tests/            architektonické testy
data/             vývojová a testovací databáze (NIKDY do Gitu)
docs/             dokumentace
```

## Dokumentace

- [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md) – vrstvy a pravidla
- [docs/DATABAZE-V2-1.md](docs/DATABAZE-V2-1.md) – tabulky, přístup uživatelů, migrace a její stav
- [docs/PLAN-V2-1.md](docs/PLAN-V2-1.md) – plán etapy V2-1 a rozhodnutí
- [docs/PLAN-V2-2.md](docs/PLAN-V2-2.md) / [docs/DATABAZE-V2-2.md](docs/DATABAZE-V2-2.md) – dokumenty: plán, databáze, bezpečnost nahrávání
- [docs/PLAN-V2-3.md](docs/PLAN-V2-3.md) / [docs/DATABAZE-V2-3.md](docs/DATABAZE-V2-3.md) – V2-3 rozpočet a materiál: plán (schválen), návrh migrace 0003 (čeká na schválení)
- [docs/OTAZKY-PRED-DATABAZI.md](docs/OTAZKY-PRED-DATABAZI.md) – rozhodnutí Q1–Q12
- [docs/DATOVY-MODEL-NAVRH.md](docs/DATOVY-MODEL-NAVRH.md) – logický model celé aplikace
- [docs/PREVZETI-Z-V1.md](docs/PREVZETI-Z-V1.md) – co se převzalo / lze převzít z V1

## Zásady

- Vývoj pouze s **fiktivními daty**. Skutečné smlouvy a výkresy až po skutečném přihlášení, serverových
  oprávněních, chráněném úložišti a ověřené obnově záloh (Master zadání, R9 a kap. 8).
- Žádné placené služby ani placená AI API.
- Změny jdou přes pracovní větve a pull requesty, ne přímo do `main`.
