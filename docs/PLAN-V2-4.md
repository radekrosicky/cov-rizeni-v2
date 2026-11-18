# Plán etapy V2-4 – Termíny potřeby materiálu a doporučené objednání

> **Stav: NÁVRH KE SCHVÁLENÍ.** Žádný kód ani migrace zatím nevznikly.
> Vychází z Master zadání v1.0 (R4, kap. 4 kroky 5–6 a 9, 5.1, 5.2, scénáře S3, S4, S14, S15) a z V2-3
> (větev `v2-3-rozpocet-material`, commit `7e810e3`). V2-2 a V2-3 jsou zatím ověřené jen automatickými testy.

## 0. Zásady

- **Jeden zdroj termínu montáže:** datum je jen v události (V2-1). Dodávka na ni **odkazuje** + posun; vlastní datum jen výjimečně s důvodem.
- **Doporučený termín objednání se NEUKLÁDÁ** – vždy se spočítá z aktuálních údajů. Posun montáže ho tedy změní sám
  a nemůže „zastarat“. Skutečné objednávky a potvrzená dodání (další etapa) jsou samostatná fakta a výpočet je nikdy nepřepíše.
- **Nic se nevymýšlí:** neznámá dodací lhůta = „Ověřit dodací lhůtu“, chybějící termín montáže = „Čeká na termín montáže“ –
  v obou případech **žádné** datum objednání.
- **Vždy je vidět původ údaje:** skutečné / plánované / smluvní datum události; dodací lhůta **potvrzená dodavatelem** / **odhad** / neznámá.

## 1. Detail dodávky – karta „Termíny“ (nahoře, na první pohled)

```
┌ Kalová čerpadla ČS1 ──────────────────────────────── K potvrzení ┐
│  ⚠ OBJEDNAT NEJPOZDĚJI 23. 12. 2026   (zbývá 35 dní)               │
│  Potřebujeme na stavbě: 22. 2. 2027 – 7 dní před „Zahájení montáže │
│     technologie – linka 1“ (plán 1. 3. 2027, zatím nenastalo)      │
│  Dodací lhůta: 30 pracovních dní · potvrzeno dodavatelem            │
│  Rezerva: 14 kalendářních dní                                      │
│  Odpovědný: Nepřiřazeno  ← přiřaďte před objednáním                 │
│  ▸ Jak se to spočítalo                                             │
└────────────────────────────────────────────────────────────────────┘
```

- Jedna hlavní informace: **„Objednat nejpozději …“** se stavem slovy i barvou (červená = po termínu, oranžová = blíží se,
  šedá = neověřeno/chybí údaj, modrá = v plánu). Nikdy jen barva.
- **„Jak se to spočítalo“** (rozbalit): krok za krokem – datum události → posun → rezerva → dodací lhůta → posun z víkendu/svátku.
- **Úprava termínů = jeden krátký formulář** (4 řádky):
  1. *Potřebujeme k události* (výběr událostí zakázky s jejich datem) + *posun* (např. „7 dní před“);
     odkaz „výjimečně zadat vlastní datum“ → datum + povinný důvod;
  2. *Dodací lhůta* – číslo + „kalendářních / pracovních dní“ + „odhad / potvrzeno dodavatelem“; prázdné = neznámá;
  3. *Rezerva* – předvyplněno 14 kalendářních dní;
  4. *Odpovědný* (už existuje z V2-3).
- **Seznam dodávek (záložka Materiál)** se seřadí podle data „objednat nejpozději“ (nejnaléhavější nahoře) a každá karta ukáže
  stav: *Po termínu objednání* · *Objednat do 23. 12.* · *Ověřit dodací lhůtu* · *Čeká na termín montáže* · *Nepřiřazen odpovědný*.
  Filtr „Objednat do 14 dní“. Na mobilu karty bez vodorovného posouvání.
- **Rychlé nastavení:** při vytváření dodávky (V2-3 formulář „Sledovat“) nepovinný řádek *Potřebujeme k události*,
  předvyplněný nejbližší událostí typu „Zahájení montáže technologie“. Hromadně: v seznamu zaškrtnout dodávky →
  „Nastavit událost“ (jedna akce pro více dodávek, např. všechna čerpadla linky 1).

## 2. Propojení dodávky s konkrétní událostí / milníkem

- Dodávka odkazuje na **konkrétní `events.id`** (např. „Zahájení montáže technologie – linka 1“), ne na typ události.
  Více montáží stejného typu (linka 1, linka 2) je rozlišeno (V2-1).
- Událost musí patřit **téže zakázce** (hlídá databáze). Události se nemažou; **zrušená** událost → dodávka ukáže
  „Navázaná událost byla zrušena – vyberte jinou“ a datum objednání se nespočítá.
- **Které datum události se použije:** skutečné (pokud nastalo) → plánované → smluvní; vždy s označením původu.
  Pokud je jen smluvní termín, upozornění „podle smluvního termínu – plán montáže nezadán“.
- V detailu události (V2-1) se zobrazí **navázané dodávky** a nejbližší termín objednání (aby bylo vidět, co posun montáže ovlivní).

## 3. Výpočet – přesně

```
Datum potřeby        = datum události + posun (kalendářní dny; např. −7)        … nebo výjimečné vlastní datum
Dodat nejpozději     = datum potřeby − rezerva (vždy KALENDÁŘNÍ dny, výchozí 14)
Objednat nejpozději  = dodat nejpozději − dodací lhůta
                         • kalendářní dny: prosté odečtení dnů;
                         • pracovní dny: odpočet N pracovních dnů (víkendy a české svátky se nepočítají);
                       a pokud výsledek padne na víkend nebo svátek → PŘEDCHOZÍ pracovní den (bezpečnější, s vysvětlením).
```

Kalendář: modul z V1 (`src/domain/calendar`) – české svátky včetně Velkého pátku a Velikonočního pondělí, pracovní dny,
„dnes“ v časovém pásmu Europe/Prague. Ověřené příklady (fiktivní):

| Situace | Výsledek |
|---|---|
| Montáž linky 1 plán **1. 3. 2027**, posun −7 → potřeba **22. 2. 2027**; rezerva 14 → dodat do **8. 2. 2027** | |
| Dodací lhůta **42 kalendářních dní** | objednat nejpozději **28. 12. 2026** |
| Dodací lhůta **30 pracovních dní** (přes 24.–26. 12. a 1. 1.) | objednat nejpozději **23. 12. 2026** |
| Dodat do 12. 4. 2027, lhůta 14 kalendářních → 29. 3. = Velikonoční pondělí | posun na **25. 3. 2027** (26. 3. je Velký pátek) |

**Stav vůči dnešku** (Europe/Prague): po termínu (objednat-do < dnes) · blíží se (≤ 14 dní, nastavitelné) · v plánu ·
neověřeno (lhůta = odhad → datum se ukáže, ale s výrazným „odhad – ověřit u dodavatele“) · nelze spočítat (chybí lhůta / termín).
Doporučení se počítá jen pro **nearchivované** dodávky; po zavedení evidence objednávek (další etapa) se u objednaných nezobrazí.

## 4. Neznámá dodací lhůta a chybějící termín montáže

| Situace | Zobrazení | Datum objednání |
|---|---|---|
| Dodací lhůta nezadána | šedý štítek **„Ověřit dodací lhůtu“** + výzva „zeptejte se dodavatele“ | **žádné** |
| Dodací lhůta = odhad | datum + oranžově **„odhad – ověřit u dodavatele“** | spočítá se, jasně označené |
| Událost bez data (žádné skutečné, plánované ani smluvní) | **„Čeká na termín montáže“** + odkaz na událost | **žádné** |
| Dodávka bez navázané události i vlastního data | **„Určete, kdy materiál potřebujete“** | **žádné** |
| Navázaná událost zrušena | **„Navázaná událost byla zrušena“** | **žádné** |
| Chybí odpovědný | upozornění **„Nepřiřazeno – určete před objednáním“** | (nebrání výpočtu) |
| Událost už skutečně nastala a materiál není objednán | červeně – informace, nic se nepřepočítá „do budoucna“ | spočítá se (bude v minulosti) |

## 5. Jak zabráníme duplicitnímu ukládání

- Datum montáže **zůstává jen v události**; dodávka ukládá pouze **odkaz + posun**.
- Vlastní datum potřeby je **výjimka s povinným důvodem** (ne druhá kopie data montáže); nelze mít zároveň událost i vlastní datum.
- **Datum potřeby, „dodat nejpozději“ i „objednat nejpozději“ se neukládají** – počítají se při zobrazení (čistá doménová funkce).
- Rezerva a dodací lhůta jsou **vlastní údaje dodávky** (každá dodávka má jiné); výchozí 14 dní je jen výchozí hodnota.
- Strážní test schématu (V2-1) dál hlídá, že se termín události neobjeví v jiné tabulce; `need_date_override` je schválená výjimka.
- Změny údajů se zapisují do **historie** (kdo, kdy, před/po, důvod u vlastního data).

## 6. Změny databáze (migrace `0004` – schválena, viz [DATABAZE-V2-4.md](DATABAZE-V2-4.md))

Jen **nové sloupce v `material_needs`**, žádná nová tabulka:

| Sloupec | Typ | Pravidlo |
|---|---|---|
| `need_event_id` | odkaz na `events` (nepovinné) | událost téže zakázky (trigger) |
| `need_offset_days` | celé číslo, výchozí 0 | −365 … +365 (záporné = před událostí) |
| `need_date_override` + `need_date_override_reason` | datum + text (nepovinné) | jen spolu; **nelze zároveň s událostí** |
| `lead_time_days` | celé číslo (nepovinné) | 0 … 730 (0 = skladem, jen výslovně zadaná); prázdné = neznámá |
| `lead_time_unit` | `calendar` / `working` | jen spolu s lhůtou |
| `lead_time_status` | `estimate` / `confirmed` | jen spolu s lhůtou (odhad vs. potvrzeno dodavatelem) |
| `reserve_days` | celé číslo, výchozí **14** | 0 … 365, vždy kalendářní dny |

Stávající dodávky dostanou rezervu 14 a ostatní údaje prázdné → zobrazí se „Určete, kdy materiál potřebujete“.
Stavy dodávky (`to_confirm`, `archived`) se nemění; „objednáno / dodáno“ přijde s evidencí objednávek.

## 7. Testy

| Druh | Co ověří |
|---|---|
| Doména – výpočet | kalendářní i pracovní lhůta; přes **Vánoce (24.–26. 12.)**, **Nový rok**, **Velikonoce 2027 (26. a 29. 3.)**, 1. 5., 8. 5., 5.–6. 7., 28. 9., 28. 10., 17. 11.; výsledek v sobotu / neděli / svátek → předchozí pracovní den; posun −7 / 0 / +10; rezerva 0, 14, 30; vlastní datum; kroky výpočtu („jak se to spočítalo“) |
| Doména – neověřené údaje | neznámá lhůta → žádné datum; odhad → datum s označením; událost bez data; jen smluvní termín; zrušená událost; žádná vazba; stav vůči dnešku (pevně zadaný „dnes“) |
| Posun montáže (S4, S14) | změna plánu události → doporučené termíny všech navázaných dodávek se změní; dodávky na jiné události beze změny; **rozpočtové a jiné uložené údaje beze změny**; historie |
| Migrace 0004 | projde na databázi s daty V2-1 až V2-3 beze změny; výchozí rezerva 14; událost z jiné zakázky odmítnuta; vlastní datum bez důvodu odmítnuto; událost + vlastní datum zároveň odmítnuto; lhůta bez jednotky / stavu odmítnuta; strážní test termínů |
| Služby | nastavení termínů jen správce/zástupce (sledující čte); hromadné nastavení události; souběžná úprava → konflikt; řazení podle naléhavosti |
| Prohlížeč | nastavit událost + lhůtu → „Objednat nejpozději …“; neznámá lhůta → „Ověřit dodací lhůtu“; posunout montáž v Přehledu → datum u dodávky se změní; chybějící odpovědný → upozornění; mobil; simulace Codespaces |

## 8. Co zůstává na další etapu (evidence objednávek a potvrzeného dodání)

- Zápis **„Objednáno“** (skutečné datum objednání, dodavatel, číslo objednávky) – jedním kliknutím z karty dodávky.
- **Potvrzený termín dodání** od dodavatele a **skutečné dodání**; stavy objednat → objednáno → potvrzené dodání → dodáno.
- Porovnání potvrzeného dodání s datem potřeby (riziko „dodání po montáži“).
- **Povinný odpovědný před zápisem objednávky** (V2-4 zatím jen upozorňuje).
- Pravidlo, že posun montáže nikdy nemění skutečné objednávky ani potvrzená dodání – výpočet je už teď oddělený, fakta přibudou až tam.
- Ranní přehled „Co dnes řešit“ napříč zakázkami (viz otázka 5).

## 9. Otázky k rozhodnutí

1. **Posun vůči události** jen v **kalendářních** dnech (doporučuji – jednodušší a bezpečnější), nebo i v pracovních?
2. **Které datum události použít:** skutečné → plánované → smluvní (s upozorněním, když chybí plán) – souhlasíte?
3. **„Blíží se“** – kolik dní před termínem objednání upozorňovat? Návrh **14 dní** (nastavitelné později).
4. **Dodací lhůta ve třech stavech:** neznámá (žádné datum) / odhad (datum s výrazným „ověřit“) / potvrzeno dodavatelem – souhlasíte,
   nebo má být odhad úplně bez data?
5. **„Co dnes řešit“** – zobrazit už ve V2-4 jednoduchý seznam „po termínu objednání / objednat do 14 dní / ověřit lhůtu /
   chybí termín montáže“ napříč zakázkami, nebo až s evidencí objednávek?
6. **Předvyplnit událost** při vytváření dodávky nejbližší „Zahájení montáže technologie“ zakázky – souhlasíte?

## 10. Rozhodnutí vlastníka projektu (plán schválen)

1. Posun vůči události jen v **kalendářních dnech**, záporný i kladný.
2. Základ výpočtu = aktuální **plánované** datum; chybí-li, smluvní – výpočet výrazně **předběžný** s upozorněním,
   že plánovaný termín není ověřen. **Skutečné** datum proběhlé události = historický fakt, ne základ nového objednávání.
   Plánovaný termín pozdější než smluvní → upozornění na rozpor.
3. „Blíží se“ = **14 kalendářních dní před doporučeným termínem objednání** – jiný údaj než bezpečnostní rezerva 14 dní před potřebou.
4. Dodací lhůta: **neznámá / odhad / potvrzená**. Odhad → orientační datum s „Dodací lhůtu ověřit“; neznámá → datum objednání se nevymýšlí.
5. „Co dnes řešit“ už ve V2-4: objednání po termínu, do 14 dní, neznámá / neověřená lhůta, chybějící termín montáže;
   vypočítané z aktuálních dat; netvrdí „neobjednáno“, jen vyzývá k ověření.
6. Aplikace může **nabídnout** nejbližší událost „zahájení montáže technologie“, ale uživatel ji musí **výslovně potvrdit**
   (na ČOV může být více etap / linek).

## 11. Stav: V2-4 implementována

Migrace 0004 schválena (s lhůtou 0–730 dní) a aplikována na vývojovou databázi. Hotové obrazovky a testy viz
[DATABAZE-V2-4.md](DATABAZE-V2-4.md), oddíl 7. Evidence skutečných objednávek a dodání zůstává na další etapu.
