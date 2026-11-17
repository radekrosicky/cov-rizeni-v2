import type { Metadata } from "next";
import { listProjectHistory } from "@/server/app";
import { DOCUMENT_CATEGORY_LABELS } from "@/domain/values";
import { card } from "@/ui/styles";
import { loadProject } from "../data";

export const metadata: Metadata = { title: "Historie změn" };

const ACTION_LABELS: Record<string, string> = {
  create: "Vytvořeno",
  update: "Změněno",
  archive: "Archivováno",
  unarchive: "Obnoveno z archivu",
  cancel: "Zrušeno",
  record_actual: "Zapsáno skutečné datum",
  member_add: "Přidán přístup",
  member_remove: "Odebrán přístup",
  member_change: "Změněn přístup",
  role_change: "Změněna role",
  upload_revision: "Nahrán soubor",
  set_current_revision: "Změněna aktuální revize",
};

const FIELD_LABELS: Record<string, string> = {
  name: "název",
  projectType: "typ",
  projectTypeNote: "upřesnění typu",
  leaderUserId: "vedoucí",
  clientName: "objednatel",
  status: "stav",
  kind: "typ události",
  title: "název",
  isMilestone: "milník",
  contractDate: "smluvní termín",
  plannedDate: "plán",
  actualDate: "skutečné datum",
  note: "poznámka",
  access: "přístup",
  category: "druh",
  revisionNo: "revize",
  file: "soubor",
  currentRevision: "aktuální revize",
};

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

const showField = (k: string, v: unknown) =>
  k === "category" && typeof v === "string" && v in DOCUMENT_CATEGORY_LABELS ? DOCUMENT_CATEGORY_LABELS[v as keyof typeof DOCUMENT_CATEGORY_LABELS] : show(v);

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "ano" : "ne") : String(v));

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadProject(id);
  if (!loaded) return null;
  const rows = await listProjectHistory(loaded.actor, id);
  return (
    <section className={card}>
      <h2 className="mb-1 text-lg font-semibold">Historie změn</h2>
      <p className="mb-3 text-sm text-slate-500">Záznamy nelze upravit ani smazat.</p>
      <ol className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="py-3 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <span className="font-medium text-slate-900">{ACTION_LABELS[r.action] ?? r.action}</span>
              <span className="text-slate-700">{r.subject}</span>
            </div>
            <div className="text-xs text-slate-500">
              {fmt(r.at)} · {r.actorName}
            </div>
            {Object.keys(r.changes).length > 0 && (r.action !== "create" || r.entityType === "document") && (
              <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                {Object.entries(r.changes).map(([k, v]) => (
                  <li key={k} className="break-words">
                    {FIELD_LABELS[k] ?? k}: {showField(k, v.before)} → <strong>{showField(k, v.after)}</strong>
                  </li>
                ))}
              </ul>
            )}
            {r.reason && <p className="mt-1 text-xs text-slate-700">Důvod: {r.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
