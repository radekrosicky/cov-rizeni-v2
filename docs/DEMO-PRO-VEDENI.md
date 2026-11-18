# DEMO ČOV Řízení 2.0 – předvedení vedení (5 minut)

> Předvádí se **skutečně běžící vývojová verze V2** s **výhradně fiktivními daty**. Nejde o hotový produkt
> pro ostrý provoz: přihlášení je zatím jen označený testovací režim a skutečné objednávky aplikace ještě neeviduje.

**Hlavní myšlenka pro vedení:** *U každé ČOV hlídáme desítky dodávek s dlouhými dodacími lhůtami. Když objednáme pozdě,
stojí montáž. ČOV Řízení každé ráno ukáže, co je potřeba udělat – a proč.*

---

## Příprava (den předem a 10 minut před prezentací)

1. Na GitHubu otevřete repozitář **cov-rizeni-v2** → tlačítko **Code** → záložka **Codespaces** → u větve
   **`v2-demo-vedeni`** buď **Create codespace on v2-demo-vedeni**, nebo otevřete již existující Codespace.
2. Počkejte, až se Codespace připraví (první spuštění trvá několik minut).
3. V terminálu dole napište a potvrďte Enterem:
   ```bash
   npm run demo
   ```
   Příkaz **smaže a znovu založí pouze DEMO data** (složka `data/demo`) s termíny podle **dnešního dne**
   a spustí aplikaci. Vývojová data se nemění. Trvá asi 1 minutu; hotovo je, když se objeví `Ready`.
4. Záložka **PORTS** → řádek **3000** → ikona glóbu **Open in Browser**. Port nechte **Private** (nikdy „Public“).
5. Prohlížeč přepněte na celou obrazovku (F11). Ověřte, že je vidět vstupní obrazovka.

> Kdykoli během prezentace něco „rozbijete“: v terminálu **Ctrl+C** a znovu `npm run demo` → vše je v původním stavu.

---

## Scénář (5 minut)

### 1) Vstupní obrazovka – 30 s
**Je vidět:** „ČOV Řízení 2.0“ a karta „Vyberte fiktivní identitu“ s červeným pruhem
**„POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení“**.

**Řekněte:** „Každý uživatel bude mít vlastní přístup e-mailem a heslem a uvidí jen své zakázky. Teď je to označený testovací
režim s vymyšlenými daty – bez přihlášení se do aplikace nedostane nikdo.“

**Klikněte:** **Zástupce (fiktivní)** – představuje vedoucího realizace.

### 2) Co dnes řešit – 1 min 15 s
**Je vidět:** jednoduché karty, nejnaléhavější nahoře, například:

| Karta (velký nadpis) | Podřádek |
|---|---|
| **Ověřit objednání: Česle strojně stírané** (červená) | ČOV Javorová … · *Po termínu o 2 dny* |
| **Objednat: Dmychadla D1–D2** (oranžová) | ČOV Javorová … · *Nejpozději za 9 dní* |
| **Doplnit termín montáže: Dávkovací stanice srážedla** | ČOV Lipová – nová ČOV · *Termín neznámý* |
| **Ověřit dodací lhůtu: Rozvaděč RM1** | ČOV Javorová … · *Termín neznámý* |

*(Přesné počty dní se počítají podle dnešního data – v den prezentace se mohou o den dva lišit.)*

**Řekněte:**
- „Ráno nemusím procházet tabulky. Vidím konkrétní akce napříč všemi zakázkami, seřazené podle naléhavosti.“
- „Česle: doporučený termín objednání už uplynul. Aplikace netvrdí, že objednáno není – zatím objednávky neeviduje –
  ale upozorní, že to musím **ověřit**. Kdyby objednáno nebylo, ohrožujeme termín montáže.“
- „U rozvaděče neznáme dodací lhůtu, takže aplikace datum objednání **nevymýšlí** – vyzve nás, ať ji zjistíme.
  Navíc nemá odpovědnou osobu.“

**Klikněte:** na celou kartu **Objednat: Dmychadla D1–D2**.

### 3) Detail dodávky – proč toto datum – 1 min
**Je vidět:** karta **Termíny** s velkým datem **Doporučené objednání** a třemi údaji
*Potřeba na stavbě · Dodat nejpozději · Objednat nejpozději*. Níže **Jak se datum vypočítalo**.

**Řekněte (ukažte na kroky výpočtu):**
1. „Montáž biologické linky je v harmonogramu naplánovaná na pondělí *(datum v kroku 1)*.“
2. „Dmychadla potřebujeme týden předem.“
3. „Chceme 14 dní rezervu.“
4. „Dodavatel potvrdil dodací lhůtu *(např. 66 dní)* → z toho vychází, kdy nejpozději objednat.“
- „Počítá s víkendy a českými svátky. Datum montáže je uložené jen na jednom místě – v harmonogramu zakázky.“

**Klikněte:** odkaz **Upravit termín události „Zahájení montáže technologie – biologická linka“** (pod výpočtem).

### 4) Posun montáže → automatický přepočet – 1 min
**Je vidět:** formulář události a níže seznam **Navázané dodávky** (dmychadla, čerpadla, difuzory) s jejich termíny.

**Řekněte:** „Na kontrolním dni se montáž posune o dva týdny. Stačí změnit jedno datum.“

**Klikněte:** do pole **Plán** a zadejte datum o **14 dní později** (např. o dvě pondělí dál) → tlačítko **Uložit změny**.

**Potom klikněte:** v levém menu **Co dnes řešit**.

**Řekněte:** „Karta **Objednat: Dmychadla** zmizela – doporučené objednání se posunulo o 14 dní, takže to dnes řešit
nemusím. Nikdo nemusel nic přepočítávat ručně.“ *(Volitelně: Zakázky → ČOV Javorová → Materiál → Dmychadla D1–D2 →
nové datum je o 14 dní později.)*

### 5) Dokumenty a rozpočet – 1 min
**Klikněte:** levé menu **Zakázky** → **ČOV Javorová – intenzifikace technologie** → záložka **Dokumenty**.

**Je vidět:** 5 fiktivních dokumentů – Smlouva o dílo, D.1.3 Technologie, Harmonogram, **Položkový rozpočet (Excel)**, Foto.

**Řekněte:** „Všechny podklady zakázky jsou na jednom místě, s revizemi.“
*(Volitelně klikněte u smlouvy na **Otevřít**.)*

**Klikněte:** záložka **Materiál** → **Dmychadla D1–D2** → v části **Z rozpočtu (1)** odkaz
**Dmychadlo rotační 30 kW s frekvenčním měničem**.

**Je vidět:** položka z Excelu (2 ks, ceny) a **Původ – originál z Excelu**: dokument, list „SO 01 Technologie“, řádek, hodnoty beze změny.

**Řekněte:** „Sledovaná dodávka vznikla přímo z položkového rozpočtu. Vždy dohledám, ze kterého Excelu, listu a řádku
pochází – nic se nepřepisuje ručně.“

*(Volitelně klikněte na odkaz **Položkový rozpočet – ČOV Javorová (FIKTIVNÍ)** → **Stáhnout** – stáhne se původní Excel.)*

### Závěr – 15 s
**Řekněte:** „Cíl je jednoduchý: každé ráno vědět, co objednat, kdy a proč – dřív, než to zastaví montáž.
Další krok je evidence skutečných objednávek a dodání, potom skutečné přihlášení e-mailem a heslem.“

**Klikněte:** **Odhlásit se** (vpravo nahoře) → aplikace se vrátí na vstupní obrazovku.

---

## Co je hotové a co se plánuje

| Hotovo (běží v DEMO) | Plánováno (zatím není) |
|---|---|
| Zakázky, harmonogram s montážními milníky, role a přístupy po zakázkách | Evidence skutečných objednávek a potvrzeného dodání |
| Dokumenty s revizemi (smlouvy, výkresy, rozpočty, fotky) | Připravenost stavby, úkoly, změny z kontrolních dnů |
| Načtení položkového rozpočtu z Excelu, sledované dodávky z jeho položek | Skutečné přihlášení e-mailem a heslem (samostatná bezpečnostní etapa) |
| Doporučené datum objednání (montáž, dodací lhůta, rezerva, svátky) a automatický přepočet | Zálohy, chráněné úložiště a ostrý provoz se skutečnými daty |
| „Co dnes řešit“ napříč zakázkami | „Moje úkoly“ |

## Technické poznámky (pro přípravu, ne pro prezentaci)
- DEMO data: `src/server/seed/demoSeed.ts` – všechny termíny jsou odvozené od dnešního dne (Europe/Prague), cílové dny
  se volí na nejbližší pracovní den. Automatický test ověřuje 4 různé dny včetně víkendů a svátků.
- `npm run demo` maže **jen** `data/demo` (pevně daná cesta), odmítne běžet, když na portu 3000 už běží aplikace,
  a v produkčním režimu nic neudělá. Vývojová databáze `data/dev` se nemění.
- `npm run demo:data` – jen připraví DEMO data bez spuštění aplikace.
- Snímky obrazovek: `docs/demo-vedeni/` (notebook 1366 × 768).
