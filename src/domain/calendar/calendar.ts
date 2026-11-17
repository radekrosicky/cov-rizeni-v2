// Převzato z V1 (radekrosicky/cov-rizeni, commit b7168b6, src/server/scheduling/calendar.ts).
// Kalendář pro výpočet termínů: data bez času (RRRR-MM-DD), české svátky, pracovní dny
// a převod místního času Europe/Prague na okamžik v UTC (letní / zimní čas).
// Žádná externí knihovna – vše je zde, aby šlo každý krok ověřit testem.

export type IsoDate = string; // „2026-12-24“

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(y: number, m: number, d: number): IsoDate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Je text platné datum RRRR-MM-DD (včetně kontroly existence dne, např. 2027-02-30 ne)? */
export function isIsoDate(value: string): value is IsoDate {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const x = new Date(Date.UTC(y, mo - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === mo - 1 && x.getUTCDate() === d;
}

export function parseIso(d: IsoDate): { y: number; m: number; d: number } {
  const m = ISO_DATE_RE.exec(d);
  if (!m) throw new Error(`Neplatné datum: ${d}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Datum jako půlnoc UTC – pro bezpečnou aritmetiku dnů (bez vlivu časového pásma) */
function utc(d: IsoDate): Date {
  const p = parseIso(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

function fromUtc(x: Date): IsoDate {
  return isoDate(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const x = utc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUtc(x);
}

/** Rozdíl ve dnech (b − a) */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}

/** Den v týdnu: 0 = neděle … 6 = sobota */
export function weekday(d: IsoDate): number {
  return utc(d).getUTCDay();
}

/** Velikonoční neděle (gregoriánský kalendář, anonymní algoritmus) */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(year, month, day);
}

/**
 * České státní svátky a ostatní svátky (zákon č. 245/2000 Sb.), dny pracovního klidu:
 * 1. 1., Velký pátek, Velikonoční pondělí, 1. 5., 8. 5., 5. 7., 6. 7., 28. 9., 28. 10., 17. 11., 24. 12., 25. 12., 26. 12.
 */
export function czechHolidays(year: number): Map<IsoDate, string> {
  const easter = easterSunday(year);
  const list: [IsoDate, string][] = [
    [isoDate(year, 1, 1), "Den obnovy samostatného českého státu / Nový rok"],
    [addDays(easter, -2), "Velký pátek"],
    [addDays(easter, 1), "Velikonoční pondělí"],
    [isoDate(year, 5, 1), "Svátek práce"],
    [isoDate(year, 5, 8), "Den vítězství"],
    [isoDate(year, 7, 5), "Den slovanských věrozvěstů Cyrila a Metoděje"],
    [isoDate(year, 7, 6), "Den upálení mistra Jana Husa"],
    [isoDate(year, 9, 28), "Den české státnosti"],
    [isoDate(year, 10, 28), "Den vzniku samostatného československého státu"],
    [isoDate(year, 11, 17), "Den boje za svobodu a demokracii"],
    [isoDate(year, 12, 24), "Štědrý den"],
    [isoDate(year, 12, 25), "1. svátek vánoční"],
    [isoDate(year, 12, 26), "2. svátek vánoční"],
  ];
  return new Map(list);
}

const holidayCache = new Map<number, Map<IsoDate, string>>();
export function holidayName(d: IsoDate): string | null {
  const y = parseIso(d).y;
  if (!holidayCache.has(y)) holidayCache.set(y, czechHolidays(y));
  return holidayCache.get(y)!.get(d) ?? null;
}

export function isWorkingDay(d: IsoDate): boolean {
  const w = weekday(d);
  return w !== 0 && w !== 6 && !holidayName(d);
}

/** Proč není pracovní den (pro vysvětlení výpočtu) */
export function nonWorkingReason(d: IsoDate): string | null {
  const h = holidayName(d);
  if (h) return `svátek (${h})`;
  const w = weekday(d);
  if (w === 6) return "sobota";
  if (w === 0) return "neděle";
  return null;
}

/** Posun o N pracovních dnů (N > 0 dopředu, N < 0 dozadu); počítá se od následujícího / předchozího dne */
export function addWorkingDays(d: IsoDate, n: number): IsoDate {
  let cur = d;
  let left = Math.abs(n);
  const step = n >= 0 ? 1 : -1;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isWorkingDay(cur)) left--;
  }
  return cur;
}

/**
 * Posun o N měsíců podle § 605 obč. zák.: končí dnem, který se číslem shoduje se dnem události;
 * pokud takový den v měsíci není, posledním dnem měsíce (31. 1. + 1 měsíc = 28./29. 2.).
 */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const p = parseIso(d);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return isoDate(y, m, Math.min(p.d, last));
}

// ---------- Čas v pásmu Europe/Prague ----------

const TZ = "Europe/Prague";
const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Místní datum a čas v Praze pro daný okamžik */
export function pragueParts(at: Date): { date: IsoDate; time: string } {
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Dnešní datum v Praze */
export function pragueToday(now: Date = new Date()): IsoDate {
  return pragueParts(now).date;
}

/**
 * Místní pražský datum a čas → okamžik (UTC).
 *  - Neexistující čas při přechodu na letní čas (např. 2:30 poslední březnovou neděli) se posune
 *    o hodinu dopředu (3:30 letního času).
 *  - Dvojznačný čas při přechodu na zimní čas (2:00–2:59 poslední říjnovou neděli) se bere jako
 *    DŘÍVĚJŠÍ okamžik (letní čas) – u termínu je bezpečnější.
 * Pražský posun vůči UTC je vždy +1 h (zima) nebo +2 h (léto).
 */
export function pragueToInstant(d: IsoDate, time = "00:00"): Date {
  const p = parseIso(d);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!tm) throw new Error(`Neplatný čas: ${time}`);
  const hh = Number(tm[1]);
  const mm = Number(tm[2]);
  const guess = Date.UTC(p.y, p.m - 1, p.d, hh, mm);
  const want = `${d} ${pad(hh)}:${pad(mm)}`;
  const matches = [120, 60]
    .map((off) => new Date(guess - off * 60_000))
    .filter((t) => {
      const x = pragueParts(t);
      return `${x.date} ${x.time}` === want;
    });
  const first = matches[0];
  if (first) return first; // nejdřívější (seřazeno od většího posunu)
  return new Date(guess - 60 * 60_000); // mezera na jaře → posun dopředu
}

/** Konec dne v Praze (23:59:59.999) – termín „do data“ platí celý ten den */
export function endOfPragueDay(d: IsoDate): Date {
  return new Date(pragueToInstant(addDays(d, 1)).getTime() - 1);
}

export function formatDateCz(d: IsoDate): string {
  const p = parseIso(d);
  return `${p.d}. ${p.m}. ${p.y}`;
}

export function formatInstantCz(at: Date): string {
  const p = pragueParts(at);
  return `${formatDateCz(p.date)} ${p.time}`;
}
