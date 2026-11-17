# Co lze převzít z V1

Zdroj: repozitář `radekrosicky/cov-rizeni`, referenční commit **`b7168b6`** („Bezpečnostní oprava analyzátoru“).
V etapě V2-0 se **nic nekopíruje** – tento dokument je jen soupis po kontrole závislostí. Převzetí proběhne
až v etapě, která daný modul potřebuje, vždy i s jeho testy.

## A. Doporučeno převzít (s malou úpravou)

| Modul V1 | K čemu | Závislosti | Co upravit při převzetí |
|---|---|---|---|
| `src/server/scheduling/calendar.ts` (195 ř.) | Data bez času, přičítání dnů/měsíců, **české svátky** (vč. Velikonoc), pracovní dny, převod Europe/Prague ↔ UTC (letní/zimní čas) | **žádné** (čistý TS) | Přesunout do `src/domain/calendar/`. Ověřit seznam svátků (zákon 245/2000 Sb.). |
| testy kalendáře ze `src/server/scheduling/scheduling.test.ts` | regresní ochrana výpočtů | Vitest; soubor ale testuje i `compute.ts` | Vybrat jen testy `calendar.ts`; testy `compute.ts` nepřebírat (viz C). |
| `src/lib/format.ts` (+ test) | `formatCzk` (částky v Kč), `formatIsoDateCz`, `formatDateTimeCz`, `plural` (1 / 2–4 / 5+) | žádné | Bez úprav. |
| `src/server/adapters/storage.ts` – rozhraní `FileStorage`, `assertSafeKey`, `LocalFileStorage` | vzor úložiště souborů s ochranou proti `../` | `node:fs`, `node:path` | Až po schválení Q4; rozšířit o SHA-256 a neměnnost souborů. |
| `src/server/domain/errors.ts` | `DomainError` s kódem a českou zprávou | žádné | Bez úprav. |
| `.devcontainer/devcontainer.json`, `trustedHosts.ts` (myšlenka) | Codespaces, bezpečné povolení adresy Codespaces | – | **Už využito** (V2 má vlastní, menší `src/lib/devOrigins.ts` a devcontainer). |
| barvy a vzhled (`globals.css`, `Sidebar.tsx`) | schválený vizuální styl | Tailwind 4 | **Už využito** – barvy převzaté, komponenty napsané znovu pro 3 položky menu. |

## B. Převzít jen myšlenku / pravidla, ne kód

| V1 | Co si vzít | Proč ne kód |
|---|---|---|
| `src/server/domain/audit.ts` | historie ve stejné transakci, před/po | Navázáno na schéma V1 (Drizzle tabulky); V2 doplní povinný důvod. |
| `src/server/domain/permissions.ts`, `actor.ts` | role po zakázkách, kontrola na serveru | Navázáno na schéma V1 a na testovací přihlášení. |
| `src/server/domain/attention.ts` | ranní přehled se **odvozuje**, nic se neukládá; přesné stavy (neověřeno ≠ nesplněno) | Postaveno na úkolech ze smluv; V2 má jiné zdroje (materiál, připravenost). |
| `src/server/scheduling/compute.ts` | zásady: termín se nevymýšlí, „čeká na datum události“, kroky výpočtu pro kontrolu člověkem | Závisí na `analysis/types.ts` (analyzátor smluv) – nelze převzít bez něj. |
| `src/lib/taskAction.ts` | „jedna hlavní akce“ na kartě | Navázáno na stavy úkolů V1. |
| `e2e/` (Playwright scénáře) | styl end-to-end testů | Scénáře V1 neodpovídají S1–S16. |

## C. Nepřebírat

| V1 | Důvod |
|---|---|
| `src/server/db/schema.ts` (19 tabulek) + `drizzle/` migrace | Zadání: nepřebírat automaticky databázový model V1. |
| `src/server/analysis/*`, `src/server/evaluation/*` (analyzátor smluv) | Zadání V2-0 výslovně zakazuje analyzátor smluv; slepé testy ukázaly jeho limity. |
| `src/server/adapters/auth.ts`, `testUsers.ts`, přepínání uživatelů | Testovací přihlášení není zabezpečení; V2 rozhodne Q3. |
| `pdfjs-dist`, `src/server/documents/pdfText.ts`, `articles.ts` | Čtení PDF / článků smluv není v rozsahu první iterace. |
| `src/lib/dates.ts` | Používá místní časové pásmo počítače (na serveru UTC → chybný den); nahrazuje ho `calendar.ts`. |
| obrazovky V1 (`src/app/**`) | Jiná informační architektura (Stavby, Ke schválení…). |

## D. Ověřené verze knihoven (V1 = V2)
Next.js 16.4.6, React 19.3.1, Tailwind CSS 4.3.5, Vitest 5.1.0, TypeScript 5.9 – stejné verze jsou použity ve V2,
takže převzaté moduly nebudou narážet na rozdíly v knihovnách. Drizzle ORM 0.45 a PGlite 0.5 ve V2 zatím
**nejsou** – přidají se až po schválení Q1/Q2.
