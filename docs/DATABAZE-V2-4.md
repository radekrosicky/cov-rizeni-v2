# Databáze V2-4 – migrace `0004_v2_4_terminy`

> **Stav: SCHVÁLENO vlastníkem projektu** (s úpravou: dodací lhůta 0–730 dní, 0 jen výslovně zadaná).
> Migrace je v `drizzle/schvalene-migrace.json` a byla aplikována na vývojovou databázi V2 s fiktivními daty.

Cíl etapy: aplikace má jednoduše odpovědět **„Co musím objednat, kdy a proč?“**

## 1. Co se mění

Jen **nové sloupce v tabulce `material_needs`** (sledované dodávky). Žádná nová tabulka, žádná změna dat,
schválené migrace `0000`–`0003` beze změny.

| Sloupec | Význam | Pravidlo v databázi |
|---|---|---|
| `need_event_id` | ke které události / milníku materiál potřebujeme (např. „Zahájení montáže technologie – linka 1“) | nepovinné; jen událost **téže zakázky**; zrušenou událost nelze vybrat; událost s navázanou dodávkou nelze smazat |
| `need_offset_days` | posun vůči události v **kalendářních** dnech | výchozí 0; −365 … +365 (záporné = před událostí, kladné = po ní) |
| `need_date_override` + `need_date_override_reason` | výjimečně vlastní datum potřeby | jen spolu, důvod nesmí být prázdný; **nelze zároveň s událostí** ani s posunem |
| `lead_time_days` | dodací lhůta | nepovinné, 0 … 730 (0 = skladem, k dispozici ihned – jen výslovně zadaná); **prázdné = neznámá** |
| `lead_time_unit` | `calendar` (kalendářní) / `working` (pracovní dny) | jen spolu s lhůtou |
| `lead_time_status` | `estimate` (odhad) / `confirmed` (potvrzeno dodavatelem) | jen spolu s lhůtou |
| `reserve_days` | bezpečnostní rezerva před potřebou, **vždy kalendářní dny** | výchozí **14**; 0 … 365; u každé dodávky upravitelná |

Dodací lhůta má tedy tři stavy: **neznámá** (vše prázdné) · **odhad** · **potvrzená**. Neúplná kombinace
(např. počet dní bez jednotky) databáze odmítne.

Trigger `material_needs_event_check` (ručně doplněný na konec SQL) hlídá stejnou zakázku a zrušenou událost
při vložení dodávky nebo změně odkazu. Pozdější zrušení události odkaz nezruší – aplikace dodávku označí
„Navázaná událost byla zrušena – vyberte jinou“ a nic nedopočítá.

## 2. Co se NEUKLÁDÁ (jeden údaj = jeden zdroj)

- **Datum montáže zůstává jen v události.** Dodávka má jen odkaz + posun. Strážní test schématu dál hlídá,
  že se termín události nikde nekopíruje; `need_date_override` je jediná schválená výjimka (s povinným důvodem).
- **Datum potřeby, „dodat nejpozději“ a „objednat nejpozději“ se neukládají** – počítá je čistá funkce
  `src/domain/material/schedule.ts` vždy z aktuálních údajů. Posun montáže v události tak doporučení přepočte
  a nic jiného nepřepíše (ověřeno testem: řádek dodávky zůstane bajt po bajtu stejný).
- „Co dnes řešit“ bude přehled **vypočítaný** z těchto údajů, bez další tabulky.

## 3. Výpočet (doménová funkce, už otestovaná)

```
datum potřeby       = datum události + posun (kalendářní dny)            … nebo vlastní datum s důvodem
dodat nejpozději    = datum potřeby − rezerva (kalendářní dny, výchozí 14)
objednat nejpozději = dodat nejpozději − dodací lhůta
                      • kalendářní: odečíst dny; padne-li na víkend / svátek → PŘEDCHOZÍ pracovní den + vysvětlení
                      • pracovní: odpočítat jen pracovní dny (víkendy a české svátky se nepočítají)
```

| Situace | Co aplikace ukáže | Datum objednání |
|---|---|---|
| Událost má **plánované** datum | výpočet z plánovaného | ano |
| Plánované chybí, je jen **smluvní** | **„PŘEDBĚŽNÝ výpočet: plánovaný termín není ověřen“** | ano, předběžné |
| Plánované je **pozdější než smluvní** | upozornění na rozpor | ano, z plánovaného |
| Událost **už proběhla** (skutečné datum) | „proběhla … – nové objednání se z ní nepočítá, ověřte stav dodávky“ | **ne** (historický fakt) |
| Událost bez data | „Chybí termín … – doplňte plánované datum“ | ne |
| Dodávka bez události i vlastního data | „Určete, kdy materiál potřebujete“ | ne |
| Událost zrušena | „Navázaná událost byla zrušena – vyberte jinou“ | ne |
| Dodací lhůta **neznámá** | „Ověřit dodací lhůtu“ (+ „dodat nejpozději“ se ukáže) | **ne – nevymýšlí se** |
| Dodací lhůta **odhad** | **„Dodací lhůtu ověřit – jde jen o odhad“** | ano, orientační |
| Chybí odpovědný | „Nepřiřazeno – určete odpovědného před objednáním“ | výpočtu nebrání |

**Stav vůči dnešku** (Europe/Prague): *uplynul* („Doporučený termín objednání uplynul – ověřte, zda je objednáno“ –
aplikace netvrdí, že objednáno nebylo, protože to zatím neví) · *do 14 dní* („Doporučeno objednat do N dní“, hranice
**ORDER_SOON_DAYS = 14** před termínem objednání) · *v plánu*. Hranice „blíží se“ je jiný údaj než bezpečnostní rezerva
(**DEFAULT_RESERVE_DAYS = 14** před potřebou) – v kódu jsou to dvě oddělené konstanty a test ověřuje, že se dají měnit nezávisle.

Ověřené fiktivní příklady: montáž plán 1. 3. 2027, posun −7 → potřeba 22. 2.; rezerva 14 → dodat do 8. 2.;
lhůta 42 kalendářních → objednat do **28. 12. 2026**; 30 pracovních → **23. 12. 2026**; dodat do 12. 4. 2027 s lhůtou
14 kalendářních → 29. 3. je Velikonoční pondělí → **25. 3. 2027** (26. 3. Velký pátek).

## 4. Automatické testy

| Soubor | Co ověřuje |
|---|---|
| `src/domain/material/schedule.test.ts` (40 testů) | výpočty, záporný / kladný / nulový posun, rezerva, kalendářní vs. pracovní dny; posun na předchozí pracovní den u **všech českých svátků** (Velký pátek, Velikonoční pondělí, 1. 5., 8. 5., 5.–6. 7., 28. 9., 28. 10., 17. 11., 24.–26. 12., 1. 1.) i víkendu; plánované vs. smluvní vs. skutečné datum; rozpor plán > smlouva; neznámá / odhadnutá lhůta; chybějící termín, událost, odpovědný; zrušená událost; hranice 14 dní (15 / 14 / 0 / −1 den); texty netvrdí „neobjednáno“ |
| `src/server/db/migration0004.test.ts` (10 testů) | přechod z databáze V2-3 s daty – nic se nezmění, nové sloupce mají výchozí hodnoty (rezerva 14, lhůta neznámá); všechna pravidla v tabulce výše; cizí zakázka; zrušená událost; zákaz smazání navázané události; posun montáže nezmění řádek dodávky, jen výsledek |
| `src/server/db/schema.guard.test.ts` | `need_date_override` je jediný nový sloupec s datem; kopie termínu události dál zakázané |
| `src/server/db/migration0002.test.ts` | pojistka: schválené jsou 0000–0003, **0004 čeká na schválení** |

Výsledek: `npm run check` – 366 testů prošlo, build v pořádku; `npm run test:e2e` – 25 testů V2-1 až V2-3 prošlo;
`drizzle-kit check` v pořádku; `npm run db:migrate` migraci 0004 odmítl (pojistka funguje).

## 5. Co tato příprava záměrně NEOBSAHUJE

- obrazovky (karta „Termíny“, výběr události s potvrzením, přehled „Co dnes řešit“) – až po schválení migrace;
- evidenci skutečných objednávek a dodání (další etapa) – proto texty jen vyzývají k ověření;
- žádné nové knihovny, žádné placené služby, jen fiktivní data.

## 6. Úprava po schválení: dodací lhůta 0 dní

Vlastník projektu: „Dodací lhůta může být i 0 dní (materiál skladem, dostupný ihned). Hodnota 0 musí být výslovně zadaná,
nikoli automaticky dosazená při neznámé lhůtě.“ Rozsah je proto **0–730**. Migrace 0004 do té doby nebyla použita
na žádné trvalé databázi, takže se upravila přímo (schválené 0000–0003 beze změny). Testy: 0 s jednotkou a stavem jde
uložit; 0 bez jednotky a stavu databáze odmítne; nová dodávka má lhůtu prázdnou (= neznámá), ne 0; formulář prázdný
počet dní u „odhad / potvrzená“ odmítne a u „neznámá“ nic nedosazuje; výpočet s 0 dává „objednat nejpozději“ = „dodat
nejpozději“ (u víkendu / svátku předchozí pracovní den).

## 7. Implementace V2-4 (hotovo)

- `src/domain/material/schedule.ts` – výpočet; `scheduleForm.ts` – kontrola formuláře; `today.ts` – skupiny „Co dnes řešit“ a návrh montážní události.
- `src/server/services/material.ts` – `updateNeedSchedule` (oprávnění + transakce + historie + kontrola verze), výpočet v `getNeed` / `listNeeds` / `listNeedsForEvent`.
- `src/server/services/today.ts` – „Co dnes řešit“ jen ze zakázek, ke kterým má uživatel přístup; vypočítané, nic se neukládá.
- Obrazovky: karta **Termíny** v detailu dodávky (velké datum objednání, potřeba / dodat / objednat, upozornění, „Jak se datum vypočítalo“, formulář),
  termín v seznamu dodávek, **Navázané dodávky** v úpravě události, hlavní stránka **Co dnes řešit**.
- Fiktivní ukázková data: `src/server/seed/devSeedMaterial.ts` (7 dodávek; vznikají přes `npm run db:setup` / `db:reset`).
- Snímky: `docs/predvedeni-v2-4/`.

## 8. Úpravy po vyzkoušení (bez změny databáze)

- **„Co dnes řešit“ zjednodušeno:** jen klikací karty (celá karta otevře detail dodávky) se dvěma řádky – konkrétní akce
  („Objednat: …“, „Ověřit objednání: …“, „Ověřit dodací lhůtu: …“, „Doplnit / Ověřit termín montáže: …“) a podřádek
  „zakázka · časový údaj“ („Nejpozději za 14 dní“, „Nejpozději zítra“, „Dnes“, „Po termínu o 2 dny“, „Termín neznámý“).
  Odpočet se počítá při každém otevření podle dnešního data. Každá dodávka nejvýše jednou, řazení podle naléhavosti,
  jemný barevný proužek. Podrobnosti (montáž, lhůty, rezervy, výpočet) jen v detailu. Na monitoru 2–3 sloupce, na mobilu
  jeden. Pozn.: názvy dodávek se nedají spolehlivě automaticky skloňovat, proto tvar „Akce: Název“.
- **Povinná vstupní obrazovka** – viz [PRIHLASENI.md](PRIHLASENI.md).
