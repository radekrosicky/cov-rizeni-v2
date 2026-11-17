import { SIGNALS, type Signal } from "@/domain/signal";

const TONE: Record<Exclude<Signal, "neutral">, string> = {
  problem: "bg-signal-problem-bg text-signal-problem",
  risk: "bg-signal-risk-bg text-signal-risk",
  unverified: "bg-signal-unverified-bg text-signal-unverified",
  done: "bg-signal-done-bg text-signal-done",
};

/** Vysvětlivka barev – barva je vždy doplněna slovem. */
export function SignalLegend() {
  return (
    <section aria-labelledby="legend-title" className="rounded-xl bg-white p-5 shadow-sm">
      <h2 id="legend-title" className="text-sm font-semibold text-slate-900">Jak číst upozornění</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {(Object.keys(TONE) as (keyof typeof TONE)[]).map((s) => (
          <li key={s} className="flex items-start gap-2 text-sm text-slate-700">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[s]}`}>{SIGNALS[s].label}</span>
            <span>{SIGNALS[s].meaning}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
