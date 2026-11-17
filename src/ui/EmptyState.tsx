// Prázdný stav sekce, která ještě není naprogramovaná.
// Musí být jednoznačně poznat, že funkce neexistuje – nic se nepředstírá.

export interface EmptyStateProps {
  title: string;
  /** Co tu bude, až funkce vznikne */
  purpose: string;
  /** Proč je zde prázdno (výchozí: funkce ještě není naprogramovaná) */
  reason?: string;
}

export const NOT_IMPLEMENTED_LABEL = "Zatím není k dispozici";

export function EmptyState({ title, purpose, reason = "Tato část ještě není naprogramovaná. Nezobrazují se žádná data." }: EmptyStateProps) {
  return (
    <section
      aria-label={`${title} – ${NOT_IMPLEMENTED_LABEL}`}
      className="rounded-xl border border-dashed border-slate-300 bg-white p-5 shadow-sm md:p-6"
    >
      <span className="inline-flex items-center rounded-full bg-signal-unverified-bg px-2.5 py-1 text-xs font-semibold text-signal-unverified">
        {NOT_IMPLEMENTED_LABEL}
      </span>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-700">{purpose}</p>
      <p className="mt-3 text-sm text-slate-500">{reason}</p>
    </section>
  );
}
