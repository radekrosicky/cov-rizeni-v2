// „Co dnes řešit“ – materiál (V2-4). Třídí vypočtené termíny do skupin; nic neukládá.
// Objednávky zatím neevidujeme: žádný text netvrdí „neobjednáno“, jen vyzývá k ověření stavu.
import type { IsoDate } from "../calendar/calendar.ts";
import type { EventKind } from "../values.ts";
import type { Schedule } from "./schedule.ts";

export const TODAY_GROUPS = ["verify_order", "order_soon", "missing_date", "lead_time"] as const;
export type TodayGroup = (typeof TODAY_GROUPS)[number];

export const TODAY_GROUP_INFO: Record<TodayGroup, { title: string; why: string; tone: "problem" | "risk" | "unverified" }> = {
  verify_order: {
    title: "Ověřte stav objednávky",
    why: "Doporučený termín objednání uplynul (nebo montáž už proběhla). Aplikace zatím objednávky neeviduje – ověřte, zda je objednáno.",
    tone: "problem",
  },
  order_soon: {
    title: "Objednat do 14 dní",
    why: "Doporučený termín objednání je do 14 kalendářních dní. Ověřte stav objednávky a případně objednejte.",
    tone: "risk",
  },
  missing_date: {
    title: "Doplnit nebo ověřit termín montáže",
    why: "Bez ověřeného termínu nelze spolehlivě určit, kdy objednat.",
    tone: "unverified",
  },
  lead_time: {
    title: "Ověřit dodací lhůtu",
    why: "Dodací lhůta je neznámá nebo jen odhad – zeptejte se dodavatele.",
    tone: "unverified",
  },
};

/** Do které skupiny dodávka patří (každá jen do jedné – nejnaléhavější). null = dnes nic řešit. */
export function todayGroupOf(s: Schedule): TodayGroup | null {
  switch (s.state) {
    case "order_overdue":
    case "event_happened":
      return "verify_order";
    case "order_soon":
      return "order_soon";
    case "no_need_date":
    case "event_without_date":
    case "event_cancelled":
      return "missing_date";
    case "lead_time_unknown":
      // Neznámá lhůta při jen smluvním termínu: chybí obojí – nejdřív termín montáže.
      return s.basis === "contract" ? "missing_date" : "lead_time";
    case "order_planned":
      if (s.warnings.some((w) => w.code === "preliminary_contract_date")) return "missing_date";
      if (s.warnings.some((w) => w.code === "lead_time_estimate")) return "lead_time";
      return null;
    default:
      return null;
  }
}

/** Řazení uvnitř skupiny: nejdřívější termín první, bez termínu na konec. */
export function todaySortKey(s: Schedule): IsoDate {
  return s.orderBy ?? s.deliverBy ?? s.needDate ?? "9999-12-31";
}

export interface SuggestableEvent {
  id: string;
  kind: EventKind;
  title: string;
  status: "active" | "cancelled";
  contractDate: IsoDate | null;
  plannedDate: IsoDate | null;
  actualDate: IsoDate | null;
}

/**
 * Návrh události pro dodávku: nejbližší ještě neproběhlá „Zahájení montáže technologie“.
 * Je to JEN NÁVRH – uživatel musí výběr výslovně potvrdit (na ČOV může být více etap / linek).
 */
export function suggestAssemblyEvent(events: SuggestableEvent[], today: IsoDate): SuggestableEvent | null {
  const candidates = events
    .filter((e) => e.status === "active" && e.kind === "assembly_start" && !e.actualDate)
    .map((e) => ({ e, date: e.plannedDate ?? e.contractDate }));
  if (!candidates.length) return null;
  const rank = (x: { date: IsoDate | null }) => (x.date === null ? 2 : x.date >= today ? 0 : 1);
  candidates.sort((a, b) => rank(a) - rank(b) || (a.date ?? "").localeCompare(b.date ?? "") || a.e.title.localeCompare(b.e.title, "cs"));
  return candidates[0]!.e;
}
