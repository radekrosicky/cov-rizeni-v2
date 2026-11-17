import { eventDateView, type EventDates } from "@/domain/events/eventDates";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/domain/values";

const pill = "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const tone =
    status === "realization" ? "bg-blue-50 text-accent-dark" : status === "archived" ? "bg-slate-200 text-slate-700" : "bg-signal-unverified-bg text-signal-unverified";
  return <span className={`${pill} ${tone}`}>{PROJECT_STATUS_LABELS[status]}</span>;
}

/** Rozhodující datum události VŽDY s původem (nastalo / plán / smluvně / čeká na ověření). */
export function EventDateBadge({ dates }: { dates: EventDates }) {
  const v = eventDateView(dates);
  const tone =
    v.basis === "actual"
      ? "bg-signal-done-bg text-signal-done"
      : v.basis === "unknown"
        ? "bg-signal-unverified-bg text-signal-unverified"
        : "bg-blue-50 text-accent-dark";
  return <span className={`${pill} ${tone}`}>{v.label}</span>;
}

export function MilestoneBadge() {
  return <span className={`${pill} bg-amber-50 text-amber-800`}>◆ Milník</span>;
}
