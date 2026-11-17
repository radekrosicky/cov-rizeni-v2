// Termíny události: smluvní, plánovaný a skutečný – tři různé údaje, nikdy se nezaměňují.
// Plánované datum se nikdy neukazuje jako nastalé; bez data = „čeká na ověření“ (Master zadání 5.1).
import { formatDateCz, isIsoDate, type IsoDate } from "../calendar/calendar.ts";

export interface EventDates {
  contractDate: IsoDate | null;
  plannedDate: IsoDate | null;
  actualDate: IsoDate | null;
}

export type DateBasis = "actual" | "planned" | "contract" | "unknown";

export interface EventDateView {
  /** Datum, podle kterého se událost řadí a zobrazuje; null = zatím neznámé. */
  date: IsoDate | null;
  basis: DateBasis;
  /** Slovní popis vždy s původem data. */
  label: string;
}

/** Které datum je pro událost rozhodující: skutečné > plánované > smluvní > neznámé. */
export function eventDateView(e: EventDates): EventDateView {
  if (e.actualDate) return { date: e.actualDate, basis: "actual", label: `Nastalo ${formatDateCz(e.actualDate)}` };
  if (e.plannedDate) return { date: e.plannedDate, basis: "planned", label: `Plán ${formatDateCz(e.plannedDate)} (zatím nenastalo)` };
  if (e.contractDate) return { date: e.contractDate, basis: "contract", label: `Smluvně do ${formatDateCz(e.contractDate)}` };
  return { date: null, basis: "unknown", label: "Termín čeká na ověření" };
}

export interface EventDateChange {
  before: EventDates;
  after: EventDates;
  /** Dnešek v Praze (pragueToday) – předává se, aby funkce zůstala čistá a testovatelná. */
  today: IsoDate;
  reason: string | null;
}

export type EventDateIssue =
  | { field: keyof EventDates; code: "invalid_date" }
  | { field: "actualDate"; code: "actual_in_future" }
  | { field: "contractDate" | "actualDate"; code: "reason_required" };

/** Kontrola změny termínů. Prázdné údaje jsou povolené (termín zatím nemusí být znám). */
export function validateEventDateChange(c: EventDateChange): EventDateIssue[] {
  const issues: EventDateIssue[] = [];
  const fields = ["contractDate", "plannedDate", "actualDate"] as const;
  for (const f of fields) {
    const v = c.after[f];
    if (v !== null && !isIsoDate(v)) issues.push({ field: f, code: "invalid_date" });
  }
  if (c.after.actualDate && isIsoDate(c.after.actualDate) && c.after.actualDate > c.today) {
    issues.push({ field: "actualDate", code: "actual_in_future" });
  }
  const hasReason = (c.reason ?? "").trim().length > 0;
  // Změna smluvního termínu (už zadaného) vyžaduje důvod.
  if (c.before.contractDate !== null && c.before.contractDate !== c.after.contractDate && !hasReason) {
    issues.push({ field: "contractDate", code: "reason_required" });
  }
  // Oprava již zapsaného skutečného data vyžaduje důvod. Změna plánu důvod nevyžaduje (jde do historie).
  if (c.before.actualDate !== null && c.before.actualDate !== c.after.actualDate && !hasReason) {
    issues.push({ field: "actualDate", code: "reason_required" });
  }
  return issues;
}
