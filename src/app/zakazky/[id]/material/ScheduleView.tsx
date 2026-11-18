// Zobrazení vypočteného termínu dodávky (V2-4). Barva vždy doplněná slovem.
import { formatDateCz } from "@/domain/calendar/calendar";
import type { Schedule, ScheduleState } from "@/domain/material/schedule";

type Tone = "problem" | "risk" | "unverified" | "neutral";

export const STATE_TONE: Record<ScheduleState, Tone> = {
  archived: "neutral",
  no_need_date: "unverified",
  event_cancelled: "problem",
  event_happened: "problem",
  event_without_date: "unverified",
  lead_time_unknown: "unverified",
  order_overdue: "problem",
  order_soon: "risk",
  order_planned: "neutral",
};

export const STATE_LABEL: Record<ScheduleState, string> = {
  archived: "Archivováno",
  no_need_date: "Chybí termín potřeby",
  event_cancelled: "Událost zrušena",
  event_happened: "Ověřte stav objednávky",
  event_without_date: "Chybí termín montáže",
  lead_time_unknown: "Ověřit dodací lhůtu",
  order_overdue: "Ověřte stav objednávky",
  order_soon: "Objednat do 14 dní",
  order_planned: "V plánu",
};

export const TONE_CLS: Record<Tone, string> = {
  problem: "bg-signal-problem-bg text-signal-problem",
  risk: "bg-signal-risk-bg text-signal-risk",
  unverified: "bg-signal-unverified-bg text-signal-unverified",
  neutral: "bg-slate-100 text-slate-700",
};

export function ScheduleBadge({ schedule }: { schedule: Schedule }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLS[STATE_TONE[schedule.state]]}`}>
      {STATE_LABEL[schedule.state]}
      {schedule.preliminary ? " · předběžné" : ""}
    </span>
  );
}

/** Jednořádkový souhrn do seznamů. */
export function ScheduleLine({ schedule }: { schedule: Schedule }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
      <ScheduleBadge schedule={schedule} />
      {schedule.orderBy ? (
        <span>
          Objednat nejpozději <strong>{formatDateCz(schedule.orderBy)}</strong>
          {schedule.deliverBy ? <span className="text-slate-500"> · dodat do {formatDateCz(schedule.deliverBy)}</span> : null}
        </span>
      ) : (
        <span className="text-slate-700">{schedule.headline}</span>
      )}
    </p>
  );
}

const WARNING_TONE: Record<string, Tone> = {
  preliminary_contract_date: "risk",
  planned_after_contract: "risk",
  lead_time_estimate: "risk",
  lead_time_unknown: "unverified",
  order_date_shifted: "neutral",
  need_date_override: "neutral",
  responsible_missing: "risk",
};

/** Karta „Termíny“ v detailu dodávky – hlavní údaj na první pohled. */
export function ScheduleCard({ schedule, eventTitle }: { schedule: Schedule; eventTitle: string | null }) {
  const s = schedule;
  const tone = STATE_TONE[s.state];
  const basisLabel =
    s.basis === "planned"
      ? `plánovaný termín události „${eventTitle}“`
      : s.basis === "contract"
        ? `smluvní termín události „${eventTitle}“ (plánovaný není ověřen)`
        : s.basis === "override"
          ? "vlastní datum potřeby"
          : s.basis === "actual"
            ? `událost „${eventTitle}“ už proběhla`
            : null;
  return (
    <div>
      <div className={`rounded-lg px-4 py-3 ${TONE_CLS[tone]}`}>
        <p className="text-xs font-semibold uppercase tracking-wide">Doporučené objednání{s.preliminary ? " – PŘEDBĚŽNÉ" : ""}</p>
        <p className="mt-1 text-2xl font-bold" data-testid="order-by">
          {s.orderBy ? formatDateCz(s.orderBy) : "nelze určit"}
        </p>
        <p className="mt-1 text-sm font-medium">{s.headline}</p>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Potřeba na stavbě</dt>
          <dd className="font-semibold">{s.needDate ? formatDateCz(s.needDate) : "neurčeno"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Dodat nejpozději</dt>
          <dd className="font-semibold">{s.deliverBy ? formatDateCz(s.deliverBy) : "neurčeno"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Objednat nejpozději</dt>
          <dd className="font-semibold">{s.orderBy ? formatDateCz(s.orderBy) : "neurčeno"}</dd>
        </div>
      </dl>
      {basisLabel && <p className="mt-2 text-xs text-slate-500">Vychází z: {basisLabel}. Při posunu události se termíny přepočítají samy.</p>}
      {s.warnings.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Upozornění">
          {s.warnings.map((w) => (
            <li key={w.code} role="note" className={`rounded-md px-3 py-1.5 text-sm ${TONE_CLS[WARNING_TONE[w.code] ?? "neutral"]}`}>
              {w.text}
            </li>
          ))}
        </ul>
      )}
      {s.steps.length > 0 && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold text-slate-800">Jak se datum vypočítalo</h4>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-700">
            {s.steps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Objednávky aplikace zatím neeviduje – skutečný stav objednání ověřte u odpovědného.</p>
    </div>
  );
}
