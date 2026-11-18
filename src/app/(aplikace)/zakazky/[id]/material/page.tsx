import type { Metadata } from "next";
import Link from "next/link";
import { TRACKING_REASON_LABELS } from "@/domain/values";
import { listBudgetSources, listNeeds } from "@/server/app";
import { SavedNotice } from "@/ui/Notices";
import { btnPrimary, btnSecondary, card } from "@/ui/styles";
import { fmtQty, load } from "./data";
import { ScheduleLine } from "./ScheduleView";

export const metadata: Metadata = { title: "Materiál" };

const SAVED: Record<string, string> = { zneplatneno: "Import rozpočtu byl zneplatněn. Položky zůstávají dohledatelné." };

export default async function MaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ulozeno?: string; archiv?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const loaded = await load(async (actor) => ({ needs: await listNeeds(actor, id), sources: await listBudgetSources(actor, id) }));
  if (!loaded) return null;
  const { needs, sources } = loaded.data;
  const base = `/zakazky/${id}/material`;
  const showArchived = sp.archiv === "1";
  const visible = needs.needs.filter((n) => (showArchived ? n.status === "archived" : n.status !== "archived"));
  const archivedCount = needs.needs.filter((n) => n.status === "archived").length;
  const saved = sp.ulozeno?.startsWith("vytvoreno-") ? `Vytvořeno ${sp.ulozeno.slice(10)} sledovaných dodávek.` : SAVED[sp.ulozeno ?? ""];
  const hasImport = sources.sources.some((s) => s.importedRevisions.length > 0);

  return (
    <div className="space-y-4">
      <SavedNotice show={!!saved}>{saved}</SavedNotice>
      {sources.sources
        .filter((s) => s.newerRevisionNotImported)
        .map((s) => (
          <div key={s.document.id} role="note" className="rounded-md border border-amber-200 bg-signal-risk-bg px-3 py-2 text-sm text-signal-risk">
            <strong>Existuje novější revize rozpočtu</strong> „{s.document.title}“ (rev. {s.current.revisionNo}). Její položky nebyly načteny; existující dodávky se nemění.
            {needs.manage && (
              <>
                {" "}
                <Link href={`${base}/import/${s.current.id}`} className="font-semibold underline">
                  Načíst novou revizi
                </Link>
              </>
            )}
          </div>
        ))}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{showArchived ? "Archivované dodávky" : "Sledované dodávky"}</h2>
          <div className="flex flex-wrap gap-2">
            {hasImport && (
              <Link href={`${base}/polozky`} className={btnPrimary}>
                Položky rozpočtu
              </Link>
            )}
            {needs.manage && (
              <>
                <Link href={`${base}/import`} className={hasImport ? btnSecondary : btnPrimary}>
                  Načíst položky z rozpočtu
                </Link>
                <Link href={`${base}/nova`} className={btnSecondary}>
                  + Ruční dodávka
                </Link>
              </>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">Sledovaná dodávka není objednávka. Doporučený termín objednání je výpočet z termínu montáže, dodací lhůty a rezervy – objednávky aplikace zatím neeviduje.</p>
      </section>

      {visible.length === 0 ? (
        <section className={card}>
          <p className="text-sm text-slate-700">{showArchived ? "Žádné archivované dodávky." : "Zatím žádné sledované dodávky."}</p>
          {!showArchived && needs.manage && <p className="mt-1 text-sm text-slate-500">Načtěte položky z rozpočtu (Excel uložený v Dokumentech) nebo založte dodávku ručně.</p>}
        </section>
      ) : (
        <ul className="space-y-3">
          {visible.map((n) => (
            <li key={n.id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`${base}/${n.id}`} className="min-w-0 text-base font-semibold text-slate-900 hover:text-accent-dark hover:underline">
                  {n.name}
                </Link>
                <span className="rounded-full bg-signal-unverified-bg px-2.5 py-0.5 text-xs font-semibold text-signal-unverified">
                  {n.status === "archived" ? "Archivováno" : "K potvrzení"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">
                {TRACKING_REASON_LABELS[n.trackingReason]}
                {n.trackingReasonNote ? ` – ${n.trackingReasonNote}` : ""} · Plánováno: {fmtQty(n.plannedQuantity, n.unit)} · Odpovědný:{" "}
                <span className={n.responsibleName ? "" : "font-semibold text-signal-risk"}>{n.responsibleName ?? "Nepřiřazeno"}</span>
              </p>
              {n.status !== "archived" && <ScheduleLine schedule={n.schedule} />}
              <p className="text-xs text-slate-500">
                {n.sources.length === 0
                  ? "Ruční záznam (bez rozpočtu)"
                  : `Z rozpočtu: ${n.sources.map((s) => `${s.item.sheetName} ř. ${s.item.rowNumber}${s.item.code ? ` ${s.item.code}` : ""} (${fmtQty(s.quantityTaken, s.item.unit)})`).join("; ")}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {(archivedCount > 0 || showArchived) && (
        <p className="text-sm">
          <Link href={showArchived ? base : `${base}?archiv=1`} className="text-accent-dark hover:underline">
            {showArchived ? "← Zpět na sledované dodávky" : `Archivované dodávky (${archivedCount})`}
          </Link>
        </p>
      )}
    </div>
  );
}
