# Plán etapy V2-3 – Excelový rozpočet a sledování materiálu

> **Stav: NÁVRH KE SCHVÁLENÍ.** Žádný kód, tabulka ani migrace zatím nevznikly.
> Vychází z Master zadání v1.0 (kap. 4 kroky 4–5, 5.2, 5.6, 6; scénáře S2, S13), větve `v2-2-dokumenty` (`cc2a7f9`).
> V2-2 zatím **není uživatelsky ověřená** v Codespaces – ověření proběhne později; V2-3 na ni jen navazuje.

## 0. Hlavní zásady

- **Položka rozpočtu ≠ sledovaná dodávka ≠ objednávka.** Import jen ukáže položky; dodávku vytvoří vždy člověk.
- **Nic se nevymýšlí.** Chybí-li množství, jednotka nebo cena, zůstane prázdné; nejasná položka se označí „k ruční kontrole“.
- **Původní hodnoty z Excelu zůstávají dohledatelné** (list, řádek, buňky v původním tvaru, revize souboru).
- **Výběr materiálu není podle ceny.** Cena se jen zobrazí; důvod sledování volí člověk (i u levné součásti).
- **Žádné objednávky ani termíny.** Termín objednání, dodací lhůta a rezerva 14 dnů přijdou ve V2-4.
- Jeden zdroj pravdy pro soubor: rozpočet se nahraje jako **dokument druhu „Rozpočty“ (V2-2)**; import se váže
  na konkrétní **revizi** tohoto dokumentu.

## 1. Import rozpočtu z pohledu uživatele

Záložka **Materiál** → tlačítko **„Načíst položky z rozpočtu“** (nebo z detailu dokumentu XLSX druhu Rozpočty).

1. **Výběr souboru** – seznam XLSX dokumentů druhu „Rozpočty“ této zakázky (aktuální revize). Nový soubor se nahraje
   běžně přes Dokumenty (V2-2 – kontrola obsahu, limit, historie).
2. **Výběr listu** – přehled listů s počtem neprázdných řádků (skryté listy označené „skrytý“). Lze vybrat jeden nebo více.
3. **Náhled a potvrzení sloupců** – prvních ~40 řádků přesně jako v Excelu (čísla řádků, písmena sloupců).
   Aplikace **navrhne** řádek záhlaví a význam sloupců podle slov (popis/název, MJ, množství/počet, cena…).
   Uživatel návrh **potvrdí nebo změní** výběrem u sloupců: *Kód · Popis (povinné) · MJ · Množství · Jednotková cena · Cena celkem · nepoužít*.
   U každého listu zvlášť (dodavatelé mají různé struktury).
4. **Kontrola výsledku** – souhrn: „182 položek · 14 nadpisů · 9 mezisoučtů vynecháno · **11 k ruční kontrole**“
   s výpisem důvodů (např. „množství chybí“, „nejasné číslo 1.250“, „neznámá jednotka ‚bal.‘“, „množství × cena ≠ celkem“).
   Nic se zatím neukládá.
5. **Potvrdit import** – teprve teď se uloží položky a použité nastavení sloupců (záznam v historii).
   Chyba → nic se neuloží.

Na mobilu jde import projít, ale je navržen hlavně pro počítač; prohlížení položek a dodávek funguje plně i na mobilu.

## 2. Položky rozpočtu a výběr sledovaného materiálu

**Tabulka položek** (záložka Materiál → „Položky rozpočtu“): list · řádek · kód · popis · MJ · množství · jedn. cena ·
celkem · **stav sledování**. Nadpisy dílů jako oddělovače skupin; mezisoučty skryté (dohledatelné filtrem).
Na mobilu karty místo tabulky.

- Filtry: list, hledání v popisu/kódu, **jen nesledované**, **jen k ruční kontrole**.
- Stav sledování u položky: **Nesledováno** · **Sledováno: „Dmychadla D1–D2“** · **Částečně (2 z 5 ks)**.
- Cena je jen informace; **žádné automatické předvybrání podle ceny**.

**Vytvoření dodávky:** zaškrtnout položky → **„Sledovat jako jednu dodávku“** nebo **„Každou zvlášť“** → krátký formulář:
- název (předvyplněn z popisu), množství + MJ (předvyplní se jen když je jednoznačné, jinak prázdné k doplnění),
- **důvod sledování (povinný):** kritická technologie · dlouhá dodací lhůta · může zastavit montáž · rizikový dodavatel · jiný (text),
- odpovědný (nepovinné ve V2-3), poznámka.

Dodávka vznikne ve stavu **„K potvrzení“** – bez termínů a bez objednávky.
Lze založit i **ruční dodávku bez rozpočtu** (Master 5.2 – „nebo ruční záznam“).

**Seznam sledovaných dodávek:** název · množství · důvod · odpovědný · **zdroje** (např. „Technologie ř. 5 TECH-001 – 2 ks“) ·
stav. Detail dodávky ukazuje původní hodnoty z Excelu a odkaz na revizi souboru.

## 3. Sloučení a rozdělení (S13)

Vazba **mnoho : mnoho** mezi dodávkou a položkou rozpočtu, s **podílem množství**:

| Situace | Jak |
|---|---|
| **Sloučení:** 3 položky → 1 dodávka | 1 dodávka se 3 zdroji (každý se svým podílem, výchozí = celé množství položky) |
| **Rozdělení:** 1 položka (10 ks) → 2 dodávky | 2 dodávky, každá zdroj se stejnou položkou a podílem (např. 6 ks + 4 ks) |
| Ruční dodávka | žádný zdroj; označena „ruční záznam“ |

- Součet podílů jedné položky přes všechny dodávky **nesmí překročit** množství položky (bez výslovného důvodu);
  u položky bez množství se podíl nezadává (jen vazba „celá / neurčeno“).
- Odebrání zdroje nebo změna podílu = záznam v historii; původní položka zůstane beze změny.
- Množství dodávky je **vlastní údaj dodávky** (člověk ho může upravit); součet zdrojů se ukáže vedle pro kontrolu.

## 4. Vazby na původní rozpočet a jeho revizi

```
dokument „Položkový rozpočet“ (V2-2) ── revize 2 (soubor, SHA-256)
                                          └── import rozpočtu (nastavení sloupců, kdo/kdy potvrdil)
                                                └── položky (list, řádek, PŮVODNÍ buňky + rozpoznané hodnoty)
                                                      └── zdroje dodávky (podíl) ── sledovaná dodávka
```

- Položka nese **list + číslo řádku + původní obsah buněk** (beze změny, jak přišel z Excelu) a vedle **rozpoznané hodnoty**.
  Původní hodnoty a položky po potvrzení **nelze měnit** (trigger, jako u revizí dokumentů).
- **Nová revize rozpočtu** (nový soubor v Dokumentech) = **nový import** vedle starého. Starý import i jeho vazby
  zůstávají; aplikace ukáže „Existuje novější revize rozpočtu – položky nebyly přeneseny“. Žádné automatické přepojení.
- Import nelze smazat, jen **zneplatnit s důvodem** (Q9), dokud z něj nejsou vytvořené dodávky; jinak jen označit jako nahrazený.

## 5. Databázové tabulky (migrace `0003` – navrhnu ke schválení až po schválení plánu)

| Tabulka | Hlavní sloupce |
|---|---|
| `budget_imports` | zakázka; **`document_revision_id`** → revize XLSX; zvolené listy; **nastavení sloupců** (JSON: řádek záhlaví, první řádek dat, sloupec→význam); stav `confirmed` / `superseded` / `voided` (+ důvod); kdo/kdy potvrdil; `version` |
| `budget_items` *(neměnné)* | import; list; číslo řádku; **`raw_cells`** (původní buňky, JSON); druh řádku `item` / `heading` / `subtotal`; kód; popis; MJ původní + MJ sjednocená; množství; jedn. cena; cena celkem (čísla nebo prázdné); **`review_reasons`** (seznam důvodů ruční kontroly) |
| `material_needs` | zakázka; název; množství; MJ; **důvod sledování** + text; odpovědný (nepovinné); poznámka; stav `to_confirm` (další stavy až V2-4); archivace s důvodem; `version`, autoři |
| `material_need_sources` | dodávka; položka rozpočtu; **podíl množství** (nebo prázdné); poznámka; jedinečná dvojice dodávka–položka |

Peníze jako přesná čísla (`numeric`, ne plovoucí čárka). Historie se rozšíří o druhy `budget_import`, `material_need`.
Žádný sloupec s termínem (pravidlo jednoho zdroje termínů z V2-1 zůstává; termíny až V2-4 přes odkaz na událost).

## 6. Ochrana proti duplicitám

| Riziko | Ochrana |
|---|---|
| Stejná revize importována dvakrát | databáze: nejvýše **jeden platný import na revizi souboru** (jedinečný index) |
| Stejný soubor nahraný znovu jako jiný dokument/revize | shoda otisku SHA-256 → upozornění „Tento soubor už byl importován (…)“; pokračovat jen výslovně |
| Položka už je ve sledované dodávce | při výběru upozornění „Už sledováno v: …“ s volbou **přidat do existující dodávky** / **rozdělit** / zrušit; vytvoření další dodávky ze stejné položky jen výslovně |
| Stejná položka 2× v jedné dodávce | databáze: jedinečná dvojice dodávka–položka |
| Součet rozdělení > množství položky | služba odmítne (bez výslovného důvodu) |
| Dvojí kliknutí / souběh | kontrola `version` + transakce (jako V2-1, Q8) |

## 7. Čtení XLSX – zvolená knihovna

| Knihovna | Výsledek prověrky (17. 11. 2026) |
|---|---|
| **`read-excel-file` (MIT)** – **doporučuji** | aktivně udržovaná (poslední vydání 11/2026); **8 balíčků celkem, 0 známých zranitelností**; jen čte (nic nespouští); vrací všechny listy, **hodnoty vzorců (poslední spočtené)**, čísla a texty beze změny (`"1 250,50"` zůstane text → náš převod + původní hodnota); **zachová přesné pozice řádků/sloupců** (ověřeno – dohledatelnost na buňku) |
| `exceljs` (MIT) | 194 balíčků, 2 známé zranitelnosti (závislost `uuid`), poslední vydání 12/2024; umí víc, než potřebujeme (zápis) |
| `xlsx` / SheetJS z npm | verze v npm zastaralá (0.18.5) se **známou závažnou zranitelností**; novější verze jen mimo npm |

**Bezpečnostní opatření kolem knihovny:**
- Soubor projde **kontrolou z V2-2** (struktura, makra, šifrování, rozbalený obsah ≤ limit) dřív, než ho knihovna otevře.
- Další limity rozpočtu: max. **50 listů, 20 000 řádků na list, 200 sloupců**; jinak srozumitelné odmítnutí.
- Čte se jen na serveru, jen soubor z našeho úložiště (podle oprávnění k zakázce); nic se nespouští ani nestahuje z webu.
- Verze **pevně zafixovaná**, starší alespoň 2 týdny (např. `9.3.14`), `npm audit` před instalací.
- Knihovna neumí zjistit **skrytý list** → skryté listy zjistíme z kontejneru sami (již máme bezpečné čtení ZIP z V2-2).
- **Sloučené buňky** knihovna vrací jen v první buňce → nadpisy dílů to neovlivní; jinde označíme „k ruční kontrole“.

## 8. Rozpoznávání (čistá doménová pravidla, bez knihovny)

- **Návrh záhlaví a sloupců:** hledání slov (`popis|název|text`, `MJ|jedn`, `množ|počet`, `cena|J\.? ?cena`, `celkem`, `kód|číslo pol`). Jen návrh.
- **Druh řádku:** položka = má popis a (množství nebo MJ nebo cenu); nadpis = jen text; mezisoučet = text `součet|mezisoučet|celkem|rekapitulace` nebo jen součtová hodnota; prázdný se vynechá.
- **Čísla:** `2`, `48,5`, `1 250,50`, `1.250,50`, `1,250.50` → převod; nejednoznačné (`1.250`, `1,250`) → **k ruční kontrole**, hodnota prázdná.
- **Jednotky:** sjednocení `ks/kus/ks./pc` → `ks`, `m2/m²` → `m²`, `m3/m³` → `m³`, `kpl/soubor/sada` → `kpl`, `kg`, `t`, `m`, `h/hod`; neznámá zůstane původní + k ruční kontrole.
- **Kontrola:** množství × jedn. cena ≠ celkem (tolerance 1 Kč) → k ruční kontrole; chybějící množství/MJ → k ruční kontrole.

## 9. Oprávnění

Stejná pravidla jako dokumenty (V2-2): **zobrazit** smí každý s přístupem k zakázce (i sledující);
**import, vytvoření a úprava dodávek** jen správce a zástupce s právem úprav; archivovaná zakázka jen pro čtení.
Vždy kontrola na serveru, podle konkrétní zakázky.

## 10. Automatické testy

| Druh | Co ověří |
|---|---|
| Doména – rozpoznávání | návrh záhlaví u 4 různých fiktivních struktur (jiné názvy sloupců, posunuté záhlaví, více listů); druh řádku (položka / nadpis / mezisoučet); česká čísla a nejednoznačná čísla; jednotky; kontrola množství × cena; **nic se nevymýšlí** (chybějící = prázdné + důvod) |
| Doména – sloučení / rozdělení | součty podílů, překročení množství, položka bez množství, různé jednotky při sloučení |
| Čtení XLSX | fiktivní rozpočty vytvořené v testech (vzorce, sloučené buňky, text místo čísla, skrytý list, prázdné listy); limity listů/řádků/sloupců; podvržený a poškozený soubor odmítnut (kontrolou z V2-2) |
| Migrace 0003 | projde na databázi s daty V2-1 a V2-2 beze změny; položky neměnné; jeden platný import na revizi; jedinečný zdroj v dodávce; žádný nový sloupec s termínem |
| Služby | náhled nic neukládá; potvrzení uloží vše v jedné transakci (při chybě nic); duplicitní import odmítnut; stejný SHA-256 → upozornění; sloučení 3→1 a rozdělení 1→2 s dohledatelnými zdroji; překročení množství odmítnuto; sledující nesmí importovat ani tvořit dodávky; nečlen 404; historie |
| Prohlížeč (Playwright) | nahrát fiktivní XLSX v Dokumentech → načíst položky → potvrdit sloupce → potvrdit import → vybrat položky → sloučit do dodávky → rozdělit jinou položku → vidět „sledováno / nesledováno“; sledující jen čte; mobil bez vodorovného posouvání; simulace Codespaces |

Pouze fiktivní rozpočty generované v testech a ve vývojových datech (smyšlené položky, např. „Dmychadlo (fiktivní)“).

## 11. Co záměrně zůstává na V2-4 a později

- **V2-4:** termín potřeby (odkaz na konkrétní událost + posun), dodací lhůta (pracovní/kalendářní dny), výchozí rezerva
  14 kalendářních dnů, **výpočet termínu objednání**, stavy objednat → objednáno → potvrzené dodání → dodáno, odpovědný povinně,
  zobrazení v „Co dnes řešit“.
- Porovnání revizí rozpočtu a přenos vazeb na novou revizi.
- Uložené šablony nastavení sloupců pro opakované dodavatele.
- Import PDF rozpočtů a starých XLS; automatické vytěžování (AI).
- Ceny komponent a finance (R8), sklad, objednávky dodavatelům, fakturace – **ne** (mimo rozsah / ERP).

## 12. Otázky k rozhodnutí

1. **Knihovna `read-excel-file`** (pevná verze, s kontrolou z V2-2 a limity) – souhlasíte s přidáním této závislosti?
2. **Rozpočet nejdřív jako dokument** (Dokumenty → druh Rozpočty) a teprve z něj import – souhlasíte? (jeden zdroj souboru, revize, historie)
3. **Důvod sledování** jako povinný výběr: kritická technologie · dlouhá dodací lhůta · může zastavit montáž · rizikový dodavatel · jiný – vyhovuje seznam?
4. **Odpovědný u dodávky** ve V2-3 nepovinný (povinný od V2-4, kdy vzniknou úkoly k objednání)?
5. **Rozdělení nad množství položky** – zablokovat úplně, nebo povolit s povinným důvodem? Návrh: povolit jen s důvodem.
6. **Nová revize rozpočtu** – nový import vedle starého bez automatického přepojení dodávek (jen upozornění) – souhlasíte?
