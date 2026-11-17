# Plán etapy V2-2 – Dokumenty zakázky

> **Stav: NÁVRH KE SCHVÁLENÍ.** Zatím nevznikl žádný kód, tabulka ani migrace.
> Vychází z Master zadání v1.0 (kap. 5.6, 5.7, 8, 11 – scénáře S1, S9), rozhodnutí Q1–Q12
> a funkční V2-1 (větev `v2-1-zakazka-opravneni`, commit `dfc4f46`).
> Zakázky, termíny, role a oprávnění z V2-1 se nemění.

## 1. Záložka Dokumenty z pohledu uživatele

**Seznam (záložka „Dokumenty“ v detailu zakázky)**
- Nahoře hlavní tlačítko **„+ Nahrát dokument“** (jen správce a zástupce s úpravami).
- Filtr podle druhu (tlačítka): Vše · Smlouvy a dodatky · Rozpočty · Projektová dokumentace a výkresy ·
  Zápisy z KD · Export stavebního deníku · Protokoly a revize · Fotografie · Ostatní.
- Každý řádek / karta: **název**, **druh**, **datum dokumentu**, **aktuální revize** (např. „Rev. 3 – C“),
  kdo a kdy ji nahrál, velikost, tlačítka **Otevřít** (PDF a obrázky v prohlížeči) a **Stáhnout**.
- Dokument s více revizemi ukáže „3 revize“ – odkaz na detail.
- Prázdný stav: „Zatím žádné dokumenty“ + u oprávněných tlačítko pro nahrání. U sledujícího jen text.

**Nahrání dokumentu (krátký formulář)**
- Soubor · Druh · Název (předvyplní se z názvu souboru) · Datum dokumentu (nepovinné) ·
  Označení revize (nepovinné, např. „A“, „Rev. 2“) · Poznámka (nepovinné).
- Na mobilu lze vybrat fotografii přímo z fotoaparátu (fotky ze stavby).
- „Uloženo“ se ukáže až po potvrzení serverem; při chybě (velikost, typ, síť) zůstane formulář vyplněný.

**Detail dokumentu**
- Údaje dokumentu (název, druh, poznámka) – úprava pro oprávněné.
- **Revize** od nejnovější: aktuální revize zeleně **„Aktuální“**, starší šedě **„Nahrazeno“** –
  každá s datem, autorem, velikostí, poznámkou a vlastním Otevřít / Stáhnout. Žádná se neztratí.
- **„Nahrát novou revizi“** – nová revize se stane aktuální, předchozí zůstane jako nahrazená.
- **„Označit jako aktuální“** u starší revize (oprava omylu) – jen s důvodem, zapíše se do historie.
- **„Archivovat dokument“** – jen s důvodem; dokument zmizí ze seznamu do sekce „Archivované“,
  soubory zůstávají dohledatelné. Fyzické mazání se v V2-2 neprogramuje (Q9).

**Historie** – změny dokumentů se zobrazují v již existující „Historii změn“ zakázky
(nahrán dokument, nová revize, změna aktuální revize, úprava údajů, archivace – kdo, kdy, proč).

**Dodatky smlouvy** – navrhuji jako **samostatné dokumenty** druhu „Smlouvy a dodatky“
(dodatek smlouvu nenahrazuje, platí spolu s ní). Revize = nová verze téhož dokumentu (např. výkres rev. C).

## 2. Ukládání dokumentů a revizí

- **Dokument** = logická věc (např. „D.1.3 Technologie – dispozice“). **Revize** = konkrétní nahraný soubor.
- Soubor se ukládá **mimo databázi** do úložiště za rozhraním `FileStorage`
  (`put` / `openRead` / `exists`; mazání zatím nevystavené):
  - vývoj: `LocalFileStorage` ve složce **`data/dev/files`** (mimo Git, stejně jako databáze),
    testy prohlížeče `data/e2e/files`, jednotkové testy dočasná složka;
  - později: zabezpečené firemní úložiště jen výměnou implementace rozhraní (zbytek aplikace se nemění).
- **Klíč souboru** generuje server: `projekty/<id zakázky>/<id revize>` – nikdy jméno od uživatele
  (ochrana proti `../` a kolizím). Původní název souboru se ukládá jen jako údaj pro zobrazení / stažení.
- **Neměnnost:** soubor se nikdy nepřepíše. Nová revize = nový soubor + nový záznam. Ukládá se
  **otisk SHA-256** a velikost (kontrola celistvosti, odhalení duplicit).
- **Pořadí kroků:** soubor se zapíše do dočasného souboru → spočítá se otisk → přejmenuje na konečný klíč →
  v jedné transakci se zapíše revize, posune ukazatel aktuální revize a zapíše historie. Když transakce selže,
  soubor se hned smaže (žádný „sirotek“ bez záznamu).
- **Aktuální revize** = jediný ukazatel `documents.current_revision_id` (jeden zdroj pravdy, Master 5.7).
  „Nahrazeno“ se neukládá – odvozuje se (revize ≠ aktuální).
- **Fiktivní soubory pro vývoj:** seed vygeneruje malé zjevně fiktivní soubory (PDF „FIKTIVNÍ SMLOUVA“,
  obrázek „FIKTIVNÍ FOTO“, výkres ve dvou revizích). Žádné skutečné dokumenty.
- **Zálohy (Q6):** databáze a složka souborů tvoří jeden celek; řešení záloh a obnovy zůstává na později.

## 3. Oprávnění a bezpečnost

**Oprávnění** (rozšíření domény `permissions.ts`, nové akce `document.view` a `document.manage`):

| | Správce | Zástupce s `edit` | Sledující (`read`) | Bez přístupu |
|---|---|---|---|---|
| Seznam, detail, otevřít, stáhnout | ✅ | ✅ | ✅ přidělené | ❌ (404) |
| Nahrát dokument / revizi, upravit údaje, označit aktuální, archivovat | ✅ | ✅ | ❌ | ❌ |
| Archivovaná zakázka | jen čtení a stahování (i správce, dokud ji neobnoví) | | | |

Kontrola vždy **na serveru** při každém nahrání i každém stažení; skryté tlačítko není ochrana.

**Nahrávání**
- Přes **serverovou akci** Next.js → platí stejná ochrana proti CSRF jako u ostatních formulářů
  (včetně opravy pro Codespaces z `dfc4f46`).
- **Limit velikosti** z proměnné `MAX_UPLOAD_MB` (výchozí **50 MB**, Q4); kontrola v doméně i limit těla
  požadavku v Next.js (`serverActions.bodySizeLimit`). Prázdný soubor se odmítne.
- **Povolené typy – seznam povolených, ne zakázaných.** Kontroluje se přípona **i skutečný obsah**
  (první bajty souboru), typ od prohlížeče se nebere jako pravda:
  PDF · XLSX, XLS · DOCX, DOC · JPG, PNG, HEIC (fotky z mobilu) · DWG, DXF (výkresy) · TXT, CSV.
  Odmítnuto vždy: HTML, SVG, JS, spustitelné soubory, archivy ZIP/RAR (nelze zkontrolovat obsah).
- Název souboru se očistí (řídicí znaky, cesty, délka) – slouží jen k zobrazení.

**Stahování a otevírání**
- Samostatná adresa `GET /zakazky/<id>/dokumenty/soubor/<id revize>` – při každém požadavku ověří
  identitu, přístup k zakázce a že revize patří k zakázce. Nečlen dostane 404 (zakázka „neexistuje“).
- Hlavičky: `Content-Type` z povoleného seznamu (ne od uživatele), `X-Content-Type-Options: nosniff`,
  `Cache-Control: private, no-store`, `Content-Disposition: attachment` (stáhnout);
  **„Otevřít“ jen u PDF a JPG/PNG** (`inline` + `Content-Security-Policy: sandbox` – soubor nemůže spustit
  skript v aplikaci). Ostatní typy se vždy jen stahují.
- V produkčním režimu bez skutečného přihlášení se nic nestáhne (vývojové identity zůstávají vypnuté).
- Antivirová kontrola (např. bezplatný ClamAV) není v V2-2 nutná pro fiktivní data – **povinná před
  skutečnými dokumenty** (zapíšu do podmínek ostrého provozu, Master kap. 8).

**Souběžné úpravy (Q8):** nahrání nové revize, změna aktuální revize a úprava údajů nesou číslo verze
dokumentu; když mezitím někdo nahrál jinou revizi, druhý dostane hlášení a nic se tiše nepřepíše.

## 4. Databáze – nové tabulky a migrace

Nová migrace **`0002_v2_2_dokumenty`** (schválené `0000` a `0001` se nemění). Předložím ji ke schválení
před aplikací, stejně jako v V2-1.

**`documents`**

| Sloupec | Poznámka |
|---|---|
| `id`, `project_id` → projects | |
| `category` | `contract` · `budget` · `design` · `site_meeting` · `diary_export` · `protocol` · `photo` · `other` |
| `title`, `note` | název povinný |
| `current_revision_id` → document_revisions | jediný ukazatel aktuální revize; musí patřit témuž dokumentu (složený cizí klíč) |
| `status` + `archived_at/by`, `archive_reason` | archivace jen s důvodem |
| `version`, `created_at/by`, `updated_at/by` | |

**`document_revisions`** – neměnné záznamy (úpravu i smazání odmítne databázový trigger)

| Sloupec | Poznámka |
|---|---|
| `id`, `document_id` → documents | |
| `revision_no` | pořadové číslo 1, 2, 3… (jedinečné v rámci dokumentu) |
| `revision_label` | nepovinné vlastní označení („C“, „Rev. 2“) |
| `document_date` | datum dokumentu – **samostatný termín dokumentu**, ne kopie události (pravidlo z V2-1 to povoluje) |
| `original_filename`, `content_type`, `size_bytes`, `sha256` | |
| `storage_key` | jedinečný klíč v úložišti |
| `note`, `uploaded_at`, `uploaded_by` | |

**Další úpravy v migraci 0002**
- `history_entries`: rozšířit povolené hodnoty o `document` / `document_revision` a akce
  `upload_revision`, `set_current_revision` (výměna CHECK omezení – stávající záznamy se nemění).
- Triggery: neměnnost revizí; aktivní dokument musí mít aktuální revizi (kontrola na konci transakce).
- Indexy: dokumenty podle zakázky a druhu; revize podle dokumentu.

**Dopad:** pouze přidává; stávající zakázky, události, členové a historie zůstávají beze změny.
Ve vašem Codespaces se po schválení použije `npm run db:migrate` (aplikace při tom nesmí běžet).
**Žádná nová knihovna není potřeba** (otisk SHA-256 i kontrola obsahu jsou vestavěné v Node.js).

## 5. Automatické testy

| Druh | Co ověří |
|---|---|
| Doména | rozpoznání typu podle obsahu (PDF, XLSX, JPG… a odmítnutí HTML/SVG/EXE/ZIP i s falešnou příponou); očištění názvu souboru; limit velikosti; oprávnění `document.view` / `document.manage` pro všechny role; „Aktuální“ / „Nahrazeno“ |
| Úložiště | klíč nemůže opustit složku (`../`); zápis přes dočasný soubor; soubor se nepřepíše; složka mimo `data/` odmítnuta |
| Migrace | 0002 projde na databázi s daty z V2-1 a nic z nich nezmění; revizi nelze upravit ani smazat; aktuální revize musí patřit témuž dokumentu; aktivní dokument bez revize nelze uložit; pravidlo jednoho zdroje termínů projde s `document_date` |
| Služby (dočasná DB + dočasná složka) | nahrání → dokument + revize 1 + historie; nová revize → předchozí zůstane jako nahrazená; označení starší revize jako aktuální jen s důvodem; souběžné nahrání → konflikt; sledující nesmí nahrávat (na serveru); nečlen 404; archivovaná zakázka jen pro čtení; **selhání databáze → soubor nezůstane v úložišti** |
| Stahování | správné hlavičky (`nosniff`, `attachment`, `sandbox`); sledující smí stáhnout přidělenou zakázku; nečlen a bez identity 404; revize z cizí zakázky přes podvrženou adresu 404; v produkčním režimu nic |
| Prohlížeč (Playwright) | zástupce nahraje PDF, pak novou revizi – starší zůstane „Nahrazeno“ a jde stáhnout; sledující vidí a stáhne, ale nemá tlačítka pro nahrání; odmítnutí nepovoleného typu; mobil bez vodorovného posouvání; simulace Codespaces (proxy z opravy `dfc4f46`) pro nahrání |

Před odevzdáním: `npm run check` a `npm run test:e2e`.

## 6. Co zůstává na V2-3 a později

- **V2-3:** import položek rozpočtu z Excelu (soubor rozpočtu už bude uložen jako dokument z V2-2).
- Automatické vytěžování dokumentů (AI / pravidla), zdrojové návrhy, čtení smluv a výkresů.
- Vazby dokumentů na materiál, podmínky připravenosti a podněty změn (až vzniknou ty moduly).
- Záznamy z KD a podněty změny jako evidence (V2-2 jen ukládá soubor zápisu).
- Vlastní stavební deník – **nikdy** (ukládá se jen export z externího systému).
- Náhled DWG / Office v prohlížeči, fulltextové hledání, hromadné nahrávání, ZIP export (Q12).
- Fyzické mazání souborů správcem, antivirová kontrola, zabezpečené firemní úložiště, zálohy a obnova.
- Skutečné přihlášení e-mailem a heslem (samostatná etapa).

## 7. Otázky k potvrzení

1. **Dodatky smlouvy** jako samostatné dokumenty (ne revize smlouvy)? Návrh: ano.
2. **Povolené typy souborů** podle kap. 3 – chybí nějaký běžný formát (např. ZIP s více výkresy)?
3. Smí **zástupce** i správce označit starší revizi jako aktuální a archivovat dokument (vždy s důvodem)? Návrh: ano.
4. Ponechat **limit 50 MB** na soubor i pro výkresy? Návrh: ano, nastavitelný.
