// Termín potřeby a doporučený termín objednání sledované dodávky (V2-4).
// Čistá funkce: nic neukládá, počítá se vždy z aktuálních údajů (datum montáže zůstává jen v události).
//
//   datum potřeby       = datum události + posun (KALENDÁŘNÍ dny, kladný i záporný)   … nebo výjimečné vlastní datum
//   dodat nejpozději    = datum potřeby − bezpečnostní rezerva (KALENDÁŘNÍ dny, výchozí 14)
//   objednat nejpozději = dodat nejpozději − dodací lhůta (kalendářní, nebo pracovní dny);
//                         padne-li na víkend / svátek → PŘEDCHOZÍ pracovní den (s vysvětlením)
//
// Zásady (rozhodnutí vlastníka projektu k V2-4):
// - základ: aktuální PLÁNOVANÉ datum události; když chybí, smluvní – výpočet je pak PŘEDBĚŽNÝ s výrazným upozorněním;
// - skutečné datum = historický fakt, NENÍ základem nového objednávání;
// - neznámá dodací lhůta → datum objednání se nevymýšlí; odhad → orientační datum s „Dodací lhůtu ověřit“;
// - aplikace zatím neví, co je objednáno → texty nikdy netvrdí „neobjednáno“, jen vyzývají k ověření.
import { addDays, addWorkingDays, diffDays, formatDateCz, isWorkingDay, nonWorkingReason, type IsoDate } from "../calendar/calendar.ts";
import { DEFAULT_RESERVE_DAYS, LEAD_TIME_UNIT_LABELS, ORDER_SOON_DAYS, type LeadTimeStatus, type LeadTimeUnit } from "../values.ts";

export interface ScheduleEvent {
  name: string;
  status: "active" | "cancelled";
  contractDate: IsoDate | null;
  plannedDate: IsoDate | null;
  actualDate: IsoDate | null;
}

export interface ScheduleInput {
  /** Navázaná událost (null = dodávka zatím k žádné události nepatří). */
  event: ScheduleEvent | null;
  offsetDays: number;
  dateOverride: IsoDate | null;
  dateOverrideReason: string | null;
  /** null = dodací lhůta NEZNÁMÁ. */
  leadTimeDays: number | null;
  leadTimeUnit: LeadTimeUnit | null;
  leadTimeStatus: LeadTimeStatus | null;
  reserveDays: number;
  responsibleAssigned: boolean;
  archived: boolean;
}

/** Hlavní stav doporučení – podle něj se dodávka řadí a barví. */
export type ScheduleState =
  | "archived" // archivovaná – nic se nedoporučuje
  | "no_need_date" // dodávka není navázaná na událost ani nemá vlastní datum
  | "event_cancelled" // navázaná událost byla zrušena
  | "event_happened" // událost už skutečně nastala – historický fakt, nové objednání se nepočítá
  | "event_without_date" // událost nemá plánované ani smluvní datum
  | "lead_time_unknown" // termín potřeby je známý, dodací lhůta ne → datum objednání nevymýšlíme
  | "order_overdue" // doporučený termín objednání uplynul → ověřte stav
  | "order_soon" // doporučené objednání do 14 dní (nastavitelné)
  | "order_planned"; // doporučený termín objednání je dál než 14 dní

export type ScheduleBasis = "planned" | "contract" | "override" | "actual" | "none";

export type ScheduleWarningCode =
  | "preliminary_contract_date" // použito smluvní datum – plánovaný termín není ověřen
  | "planned_after_contract" // plánovaný termín je pozdější než smluvní
  | "lead_time_estimate" // dodací lhůta je jen odhad
  | "lead_time_unknown"
  | "order_date_shifted" // objednání posunuto na předchozí pracovní den
  | "need_date_override" // vlastní datum potřeby (s důvodem)
  | "responsible_missing";

export interface ScheduleWarning {
  code: ScheduleWarningCode;
  text: string;
}

export interface Schedule {
  state: ScheduleState;
  /** Krátký text stavu pro první pohled. */
  headline: string;
  basis: ScheduleBasis;
  /** Datum, ze kterého výpočet vychází (u „actual“ jen informace o proběhlé události). */
  basisDate: IsoDate | null;
  needDate: IsoDate | null;
  deliverBy: IsoDate | null;
  orderBy: IsoDate | null;
  /** Kolik dní zbývá do doporučeného objednání (záporné = uplynulo). */
  daysToOrder: number | null;
  /** Předběžný výpočet: smluvní datum místo plánovaného nebo odhad dodací lhůty. */
  preliminary: boolean;
  warnings: ScheduleWarning[];
  /** Postup výpočtu srozumitelně krok za krokem. */
  steps: string[];
}

export interface ScheduleOptions {
  /** Hranice „blíží se“ před doporučeným termínem objednání (kalendářní dny). Není to rezerva! */
  soonDays?: number;
}

const cz = formatDateCz;
const days = (n: number) => (Math.abs(n) === 1 ? "den" : Math.abs(n) >= 2 && Math.abs(n) <= 4 ? "dny" : "dní");
/** „1 kalendářní den“, „3 pracovní dny“, „14 kalendářních dní“ */
export function dayCount(n: number, unit: LeadTimeUnit): string {
  const a = Math.abs(n);
  const adj = unit === "calendar" ? "kalendářní" : "pracovní";
  if (a === 1) return `${n} ${adj} den`;
  if (a >= 2 && a <= 4) return `${n} ${adj} dny`;
  return `${n} ${LEAD_TIME_UNIT_LABELS[unit]}`;
}

/** Posun data, pokud padne na nepracovní den: o den zpět, dokud nejde o pracovní den. */
export function previousWorkingDay(d: IsoDate): IsoDate {
  let cur = d;
  while (!isWorkingDay(cur)) cur = addDays(cur, -1);
  return cur;
}

export function computeSchedule(input: ScheduleInput, today: IsoDate, options: ScheduleOptions = {}): Schedule {
  const soonDays = options.soonDays ?? ORDER_SOON_DAYS;
  const warnings: ScheduleWarning[] = [];
  const steps: string[] = [];
  const base = { basis: "none" as ScheduleBasis, basisDate: null as IsoDate | null, needDate: null, deliverBy: null, orderBy: null, daysToOrder: null, preliminary: false };
  const responsibleWarning = () => {
    if (!input.responsibleAssigned) warnings.push({ code: "responsible_missing", text: "Nepřiřazeno – určete odpovědného před objednáním." });
  };
  const done = (state: ScheduleState, headline: string, extra: Partial<Schedule> = {}): Schedule => ({
    ...base,
    state,
    headline,
    warnings,
    steps,
    ...extra,
  });

  if (input.archived) return done("archived", "Archivovaná dodávka – termíny se nepočítají.");

  // 1) Termín potřeby
  let needDate: IsoDate;
  let basis: ScheduleBasis;
  let basisDate: IsoDate;
  let preliminary = false;
  const ev = input.event;
  if (input.dateOverride) {
    basis = "override";
    basisDate = input.dateOverride;
    needDate = input.dateOverride;
    warnings.push({ code: "need_date_override", text: `Vlastní datum potřeby (není odvozeno z události). Důvod: ${input.dateOverrideReason ?? "neuveden"}` });
    steps.push(`Potřeba na stavbě: ${cz(needDate)} (vlastní datum – ${input.dateOverrideReason ?? "bez důvodu"}).`);
  } else if (!ev) {
    responsibleWarning();
    return done("no_need_date", "Určete, kdy materiál potřebujete (vyberte událost, např. zahájení montáže).");
  } else if (ev.status === "cancelled") {
    responsibleWarning();
    return done("event_cancelled", `Navázaná událost „${ev.name}“ byla zrušena – vyberte jinou.`);
  } else if (ev.actualDate) {
    responsibleWarning();
    return done("event_happened", `Událost „${ev.name}“ proběhla ${cz(ev.actualDate)}. Nové objednání se z ní nepočítá – ověřte stav dodávky.`, {
      basis: "actual",
      basisDate: ev.actualDate,
    });
  } else if (ev.plannedDate || ev.contractDate) {
    if (ev.plannedDate) {
      basis = "planned";
      basisDate = ev.plannedDate;
      steps.push(`Plánovaný termín „${ev.name}“: ${cz(ev.plannedDate)}.`);
      if (ev.contractDate && ev.plannedDate > ev.contractDate) {
        warnings.push({
          code: "planned_after_contract",
          text: `Plánovaný termín (${cz(ev.plannedDate)}) je pozdější než smluvní (${cz(ev.contractDate)}) – ověřte rozpor.`,
        });
      }
    } else {
      basis = "contract";
      basisDate = ev.contractDate!;
      preliminary = true;
      warnings.push({
        code: "preliminary_contract_date",
        text: `PŘEDBĚŽNÝ výpočet: plánovaný termín „${ev.name}“ není ověřen, použit smluvní termín ${cz(basisDate)}.`,
      });
      steps.push(`Smluvní termín „${ev.name}“: ${cz(basisDate)} (plánovaný chybí – předběžné).`);
    }
    needDate = addDays(basisDate, input.offsetDays);
    if (input.offsetDays !== 0) {
      const dir = input.offsetDays < 0 ? "před" : "po";
      steps.push(`Materiál potřebujeme ${Math.abs(input.offsetDays)} ${days(input.offsetDays)} ${dir} událostí: ${cz(needDate)}.`);
    } else {
      steps.push(`Materiál potřebujeme v den události: ${cz(needDate)}.`);
    }
  } else {
    responsibleWarning();
    return done("event_without_date", `Chybí termín „${ev.name}“ – doplňte plánované datum události.`);
  }

  // 2) Dodat nejpozději (rezerva vždy v kalendářních dnech)
  const reserve = input.reserveDays ?? DEFAULT_RESERVE_DAYS;
  const deliverBy = addDays(needDate, -reserve);
  steps.push(`Bezpečnostní rezerva ${dayCount(reserve, "calendar")} → dodat nejpozději ${cz(deliverBy)}.`);

  // 3) Objednat nejpozději
  if (input.leadTimeDays === null || !input.leadTimeUnit) {
    warnings.push({ code: "lead_time_unknown", text: "Dodací lhůta není známá – zeptejte se dodavatele. Termín objednání nelze určit." });
    responsibleWarning();
    return done("lead_time_unknown", `Ověřit dodací lhůtu – dodat nejpozději ${cz(deliverBy)}.`, { basis, basisDate, needDate, deliverBy, preliminary });
  }
  let orderBy: IsoDate;
  const lead = input.leadTimeDays;
  if (lead === 0) {
    // Skladem / ihned k dispozici: objednat nejpozději v den „dodat nejpozději“ (nebo předchozí pracovní den).
    orderBy = previousWorkingDay(deliverBy);
    const shift = orderBy !== deliverBy ? `; ${cz(deliverBy)} je ${nonWorkingReason(deliverBy)} → předchozí pracovní den ${cz(orderBy)}` : "";
    if (shift) warnings.push({ code: "order_date_shifted", text: `${cz(deliverBy)} je ${nonWorkingReason(deliverBy)} → objednání posunuto na předchozí pracovní den ${cz(orderBy)}.` });
    steps.push(`Dodací lhůta 0 dní (skladem, k dispozici ihned) → objednat nejpozději ${cz(orderBy)}${shift}.`);
  } else if (input.leadTimeUnit === "working") {
    orderBy = addWorkingDays(deliverBy, -lead);
    steps.push(`Dodací lhůta ${dayCount(lead, "working")} (bez víkendů a svátků) → objednat nejpozději ${cz(orderBy)}.`);
  } else {
    const raw = addDays(deliverBy, -lead);
    orderBy = previousWorkingDay(raw);
    if (orderBy !== raw) {
      const text = `${cz(raw)} je ${nonWorkingReason(raw)} → objednání posunuto na předchozí pracovní den ${cz(orderBy)}.`;
      warnings.push({ code: "order_date_shifted", text });
      steps.push(`Dodací lhůta ${dayCount(lead, "calendar")} → ${cz(raw)}; ${text}`);
    } else {
      steps.push(`Dodací lhůta ${dayCount(lead, "calendar")} → objednat nejpozději ${cz(orderBy)}.`);
    }
  }
  if (input.leadTimeStatus !== "confirmed") {
    preliminary = true;
    warnings.push({ code: "lead_time_estimate", text: "Dodací lhůtu ověřit – jde jen o odhad, termín objednání je orientační." });
  }
  responsibleWarning();

  // 4) Stav vůči dnešku – aplikace zatím neví, zda je objednáno, proto jen vyzývá k ověření.
  const daysToOrder = diffDays(today, orderBy);
  const common = { basis, basisDate, needDate, deliverBy, orderBy, daysToOrder, preliminary };
  if (daysToOrder < 0) {
    return done("order_overdue", `Doporučený termín objednání (${cz(orderBy)}) uplynul – ověřte, zda je objednáno.`, common);
  }
  if (daysToOrder <= soonDays) {
    const when = daysToOrder === 0 ? "dnes" : `do ${daysToOrder} ${days(daysToOrder)}`;
    return done("order_soon", `Doporučeno objednat ${when} (nejpozději ${cz(orderBy)}).`, common);
  }
  return done("order_planned", `Objednat nejpozději ${cz(orderBy)}.`, common);
}
