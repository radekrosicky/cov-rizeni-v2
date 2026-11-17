# Technické otázky k rozhodnutí před databází

Dokud tyto body nejsou odsouhlasené, **nevznikají tabulky ani migrace**. U každé otázky je doporučení;
rozhodnutí je na vlastníkovi projektu. Pořadí = podle toho, co blokuje nejvíc.

## Q1 – Jaká databáze?
| Varianta | Pro | Proti |
|---|---|---|
| **PostgreSQL** (doporučeno) | Standard pro víceuživatelský provoz, transakce, spolehlivé zálohy; dostupná zdarma i v hostované podobě; V1 ji už používala (dialekt). | Na produkci je potřeba ji někde provozovat. |
| SQLite | Nejjednodušší, jeden soubor. | Slabší pro souběžné zápisy více lidí na serveru; přechod později = přepis. |

**Doporučení:** PostgreSQL od začátku. Pro vývoj a Codespaces **PGlite** (PostgreSQL běžící uvnitř Node.js,
bez instalace, zdarma – osvědčené ve V1); pro testovací/ostré prostředí skutečný PostgreSQL. Stejný dialekt
znamená, že se kód při přechodu nepřepisuje.

## Q2 – Jak přistupovat k databázi z kódu?
**Doporučení:** Drizzle ORM (ve V1 ověřené, typově bezpečné, verzované migrace v Gitu). Alternativa Prisma
je těžší a přidává vlastní generátor. Rozhodnutí je spíše technické – stačí souhlas.

## Q3 – Přihlášení a identita
Bez skutečného přihlášení nesmí do aplikace skutečná data (R9). Varianty:
- **Microsoft Entra ID (firemní účty Microsoft 365)** – pokud firma používá Microsoft 365 / Teams / SharePoint,
  je to nejpřirozenější (jedno firemní přihlášení, odchod zaměstnance = zrušený přístup). Vyžaduje registraci
  aplikace u správce firemního Microsoft 365.
- Hostovaná autentizace (např. Supabase Auth) – rychlé, ale další externí služba se samostatnými účty.
- Vlastní hesla – **nedoporučeno** (bezpečnostní odpovědnost).

**Otázka pro vás:** Používá firma Microsoft 365 a je správce ochoten aplikaci zaregistrovat?
**Mezitím:** pro vývoj s fiktivními daty navrhuji výslovně označenou „vývojovou identitu“ (výběr fiktivního
uživatele s červeným pruhem „NENÍ ZABEZPEČENO – jen fiktivní data“), která funguje **pouze ve vývojovém režimu**
a v produkčním sestavení neexistuje. Potřebuji váš souhlas, než ji vytvořím.

## Q4 – Kde budou uložené soubory (smlouvy, výkresy, fotografie)?
| Varianta | Poznámka |
|---|---|
| Lokální složka `data/` (jen vývoj) | Mimo Git; pro fiktivní soubory dostačuje. |
| Objektové úložiště (S3 kompatibilní, Azure Blob, Supabase Storage) | Běžné pro webové aplikace; soukromé, přístup jen přes server. |
| SharePoint / OneDrive firmy | Data zůstávají ve firemním prostředí; složitější integrace a oprávnění (R6 – „později“). |
| Soubory v databázi | Jednoduché zálohování, ale databáze rychle roste. Nedoporučeno pro výkresy a fotky. |

**Doporučení:** kód napsat proti rozhraní `FileStorage` (ověřený vzor z V1). Pro vývoj lokální složka.
Ostré úložiště vybrat spolu s hostingem (Q5). Soubory jsou neměnné, s otiskem SHA-256, stahování jen přes server
po kontrole oprávnění k zakázce. Limit velikosti souboru: navrhuji 50 MB – **potvrďte**, zda výkresy nejsou větší.

## Q5 – Kde bude aplikace provozována (pilot a ostrý provoz)?
Firemní server / firemní cloud (Azure?) / externí hosting. Ovlivňuje Q3, Q4 i zálohy. Zadání (kap. 8) říká
nevybírat placený hosting podle prototypu – **potřebujeme vědět, jaké prostředí firma připouští**
a zda data musí zůstat v EU / ve firmě. Codespaces port **není** testovací prostředí pro další lidi.

## Q6 – Zálohy a obnova
Kdo zálohuje, jak často, jak dlouho se zálohy drží a **kdo a kdy vyzkouší obnovu** (S12). Doporučení: denní
záloha databáze i souborů, test obnovy před prvním skutečným dokumentem a pak pravidelně.

## Q7 – Historie změn
**Doporučení:** jednoduchá tabulka historie (kdo/kdy/co/před/po/důvod) zapisovaná ve stejné transakci.
Nikoliv „event sourcing“ – zbytečně složité. Rozhodněte: má být historie viditelná i sledujícím?

## Q8 – Souběžné úpravy více lidí
Dva lidé upraví stejnou dodávku současně. **Doporučení:** číslo verze u záznamu; když se mezitím změnil,
druhý uživatel uvidí „Záznam mezitím změnil X – načtěte znovu“, nic se tiše nepřepíše.

## Q9 – Mazání a archivace
**Doporučení:** fakta (objednávky, dodání, rozhodnutí, revize) se nemažou, jen ruší s důvodem. Uzavřené
zakázky se archivují. Fyzické smazání jen správcem (např. omylem nahraný soubor) se záznamem v historii.

## Q10 – Data, čas a pracovní dny
**Doporučení:** data bez času (`RRRR-MM-DD`) pro termíny, časová razítka v UTC, zobrazení v Europe/Prague;
české svátky počítané algoritmicky (převzetí z V1). Otázka: počítat i firemní celozávodní dovolenou / jiné
nepracovní dny? (Pokud ano, potřebujeme kalendář výjimek.)

## Q11 – Role a oprávnění – upřesnění R1
- Smí zástupce přidávat členy zakázky, nebo jen správce?
- Vidí sledující všechny zakázky, nebo jen přidělené? (Zadání: jen přidělené – potvrďte.)
- Kdo smí schválit výjimku u podmínky připravenosti?

## Q12 – Export dat
Zadání (kap. 8) požaduje možnost exportu. Navrhuji jednoduchý export zakázky (data + soubory) do ZIP/CSV
až v pozdější etapě; potvrďte, že nemusí být v první funkční verzi.

## Shrnutí – co potřebuji od vás nejdřív
1. **Q1 + Q2** (PostgreSQL / PGlite + Drizzle) – lze rozhodnout hned.
2. **Q3** – používá firma Microsoft 365? Souhlas s vývojovou identitou jen pro fiktivní data?
3. **Q4 + Q5** – kde smí v budoucnu ležet data a soubory (stačí směr, ne konkrétní služba).
4. **Q11** – upřesnění rolí.
