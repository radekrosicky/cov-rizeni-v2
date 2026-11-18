// „Co dnes řešit“ – materiál (V2-4). Třídí vypočtené termíny do skupin; nic neukládá.
// Objednávky zatím neevidujeme: žádný text netvrdí „neobjednáno“, jen vyzývá k ověření stavu.
import type { IsoDate } from "../calendar/calendar.ts";
import type { EventKind } from "../values.ts";
import type { Schedule } from "./schedule.ts";

export const TODAY_GROUPS = ["verify_order", "order_soon", "missing_date", "lead_time"] as const;
export type TodayGroup = (typeof TODAY_GROUPS)[number];

/** Závažnost karty (jemné barevné odlišení; barva vždy doplněná textem akce). */
export type TodayTone = "problem" | "risk" | "unverified";

export const TODAY_GROUP_TONE: Record<TodayGroup, TodayTone> = {
  verify_order: "problem",
  order_soon: "risk",
  missing_date: "unverified",
  lead_time: "unverified",
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

const plural = (n: number) => (n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní");

/**
 * Konkrétní akce na kartě „Co dnes řešit“ – krátce, bez vysvětlování.
 * Objednávky zatím neevidujeme: u prošlého termínu „Ověřit objednání“, nikdy „neobjednáno“.
 */
export function todayAction(s: Schedule, group: TodayGroup): string {
  switch (group) {
    case "verify_order":
      return "Ověřit objednání";
    case "order_soon":
      return "Objednat";
    case "missing_date":
      return s.basis === "contract" ? "Ověřit termín montáže" : "Doplnit termín montáže";
    case "lead_time":
      return "Ověřit dodací lhůtu";
  }
}

/** Krátký časový údaj vůči DNEŠKU (počítá se při každém zobrazení). */
export function todayWhen(s: Schedule): string {
  if (s.state === "event_happened") return "Montáž už proběhla";
  if (s.orderBy === null || s.daysToOrder === null) return "Termín neznámý";
  const d = s.daysToOrder;
  if (d < 0) return `Po termínu o ${-d} ${plural(-d)}`;
  if (d === 0) return "Dnes";
  if (d === 1) return "Nejpozději zítra";
  return `Nejpozději za ${d} ${plural(d)}`;
}

const GROUP_RANK: Record<TodayGroup, number> = { verify_order: 0, order_soon: 1, missing_date: 2, lead_time: 3 };

/** Řazení podle naléhavosti: po termínu → do 14 dní → chybí termín → ověřit lhůtu; uvnitř podle data. */
export function compareTodayUrgency(a: { group: TodayGroup; schedule: Schedule; name: string }, b: { group: TodayGroup; schedule: Schedule; name: string }): number {
  const key = (x: Schedule): IsoDate => x.orderBy ?? x.deliverBy ?? x.needDate ?? x.basisDate ?? "9999-12-31";
  return GROUP_RANK[a.group] - GROUP_RANK[b.group] || key(a.schedule).localeCompare(key(b.schedule)) || a.name.localeCompare(b.name, "cs");
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
