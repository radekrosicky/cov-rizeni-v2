import type { Metadata } from "next";
import Link from "next/link";
import { TRACKING_REASON_LABELS } from "@/domain/values";
import { getNeed, listResponsibleCandidates } from "@/server/app";
import { ActionForm, TextArea, TextField } from "@/ui/Form";
import { SavedNotice } from "@/ui/Notices";
import { btnDanger, btnSecondary, card } from "@/ui/styles";
import { archiveNeedAction, removeSourceAction, unarchiveNeedAction, updateNeedAction, updateNeedScheduleAction, updateSourceAction } from "../../../materialActions";
import { fmtQty, load } from "../data";
import { NeedFields } from "../NeedFields";
import { ScheduleFields } from "../ScheduleFields";
import { ScheduleCard } from "../ScheduleView";

export const metadata: Metadata = { title: "Dodávka" };

const SAVED: Record<string, string> = {
  vytvoreno: "Sledovaná dodávka byla vytvořena (K potvrzení).",
  pridano: "Položky rozpočtu byly přidány do dodávky.",
  odebrano: "Položka byla z dodávky odebrána (záznam je v historii).",
  archiv: "Dodávka byla archivována.",
  obnoveno: "Dodávka byla obnovena.",
  terminy: "Termín potřeby a dodací lhůta byly uloženy. Doporučené objednání se přepočítalo.",
};

export default async function NeedPage({ params, searchParams }: { params: Promise<{ id: string; needId: string }>; searchParams: Promise<{ ulozeno?: string }> }) {
  const [{ id, needId }, sp] = await Promise.all([params, searchParams]);
  const loaded = await load(async (actor) => ({ d: await getNeed(actor, id, needId), people: await listResponsibleCandidates(actor, id) }));
  if (!loaded) return null;
  const { d, people } = loaded.data;
  const n = d.need;
  const base = `/zakazky/${id}/material`;
  return (
    <div className="space-y-4">
      <Link href={base} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Materiál
      </Link>
      <SavedNotice show={!!sp.ulozeno}>{SAVED[sp.ulozeno ?? ""] ?? "Změna byla uložena."}</SavedNotice>
      {d.newerBudgetRevision.length > 0 && (
        <div role="note" className="rounded-md border border-amber-200 bg-signal-risk-bg px-3 py-2 text-sm text-signal-risk">
          Existuje novější revize rozpočtu „{d.newerBudgetRevision.join("“, „")}“. Tato dodávka je navázaná na starší revizi – nic se automaticky nepřepsalo.
        </div>
      )}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 text-xl font-bold text-slate-900">{n.name}</h2>
          <span className="rounded-full bg-signal-unverified-bg px-2.5 py-0.5 text-xs font-semibold text-signal-unverified">{n.status === "archived" ? "Archivováno" : "K potvrzení"}</span>
        </div>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Proč sledujeme</dt>
            <dd>
              {TRACKING_REASON_LABELS[n.trackingReason]}
              {n.trackingReasonNote ? ` – ${n.trackingReasonNote}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Plánováno k zajištění</dt>
            <dd>{fmtQty(n.plannedQuantity, n.unit)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Odpovědný</dt>
            <dd className={d.responsibleName ? "" : "font-semibold text-signal-risk"}>{d.responsibleName ?? "Nepřiřazeno"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Dodací lhůta</dt>
            <dd className={n.leadTimeDays === null ? "font-semibold text-signal-unverified" : ""}>{d.leadTime}</dd>
          </div>
        </dl>
        {n.note && <p className="mt-2 text-sm text-slate-700">{n.note}</p>}
        {n.status === "archived" && <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 text-sm">Archivováno – důvod: {n.archiveReason}</p>}
      </section>

      {n.status !== "archived" && (
        <section className={card} aria-labelledby="terminy">
          <h3 id="terminy" className="mb-3 text-lg font-semibold">
            Termíny
          </h3>
          <ScheduleCard schedule={d.schedule} eventTitle={d.event?.title ?? null} />
          {d.event && d.manage && d.event.status === "active" && (
            <p className="mt-2 text-sm">
              <Link href={`/zakazky/${id}/udalosti/${d.event.id}`} className="text-accent-dark underline">
                Upravit termín události „{d.event.title}“
              </Link>
            </p>
          )}
          {d.manage && (
            <details className="mt-4 rounded-lg border border-slate-200 p-3" open={d.schedule.state === "no_need_date"}>
              <summary className="cursor-pointer text-base font-semibold text-accent-dark">Nastavit termín potřeby, dodací lhůtu a rezervu</summary>
              <div className="mt-3">
                <ActionForm action={updateNeedScheduleAction.bind(null, id, needId)} submitLabel="Uložit termíny" submitClassName={btnSecondary}>
                  <input type="hidden" name="version" value={n.version} />
                  <ScheduleFields defaults={n} events={d.eventOptions} suggested={d.suggestedEvent} />
                </ActionForm>
              </div>
            </details>
          )}
        </section>
      )}

      <section className={card} aria-labelledby="zdroje">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="zdroje" className="text-lg font-semibold">
            Z rozpočtu ({d.sources.length})
          </h3>
          {d.manage && (
            <Link href={`${base}/polozky`} className={btnSecondary}>
              Přidat položky z rozpočtu
            </Link>
          )}
        </div>
        {d.sources.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Ruční záznam – bez vazby na rozpočet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {d.sources.map((s) => (
              <li key={s.id} className="py-3 text-sm">
                <Link href={`${base}/polozky/${s.item.id}`} className="font-medium text-accent-dark underline">
                  {s.item.description}
                </Link>
                <p className="text-xs text-slate-500">
                  {s.documentTitle} · rev. {s.revisionNo} · list „{s.item.sheetName}“ · ř. {s.item.rowNumber}
                  {s.item.code ? ` · ${s.item.code}` : ""}
                </p>
                <p>
                  Převzato: <strong>{fmtQty(s.quantityTaken, s.item.unit ?? s.item.unitRaw)}</strong> · v rozpočtu{" "}
                  {s.item.quantityStatus === "numeric" ? fmtQty(s.item.quantity, s.item.unit ?? s.item.unitRaw) : `„${s.item.quantityRaw ?? "bez množství"}“`}
                  {s.allocation.over && <span className="font-semibold text-signal-risk"> · celkem převzato nad rozpočet ({fmtQty(s.allocation.taken)})</span>}
                </p>
                {s.overAllocationReason && <p className="text-xs text-signal-risk">Důvod překročení: {s.overAllocationReason}</p>}
                {d.manage && (
                  <details className="mt-1">
                    <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-accent-dark">Upravit / odebrat…</summary>
                    <div className="mt-2 grid gap-3 lg:grid-cols-2">
                      {s.item.quantityStatus === "numeric" && (
                        <ActionForm action={updateSourceAction.bind(null, id, needId, s.id)} submitLabel="Uložit převzaté množství" submitClassName={btnSecondary}>
                          <TextField name="quantityTaken" label="Převzaté množství" defaultValue={s.quantityTaken ? String(Number(s.quantityTaken)).replace(".", ",") : ""} />
                          <TextField name="overAllocationReason" label="Důvod (jen při překročení rozpočtu)" defaultValue={s.overAllocationReason} />
                        </ActionForm>
                      )}
                      <ActionForm action={removeSourceAction.bind(null, id, needId, s.id)} submitLabel="Odebrat z dodávky" submitClassName={btnDanger}>
                        <p className="text-xs text-slate-500">Položka rozpočtu zůstane beze změny; záznam bude v historii.</p>
                      </ActionForm>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.manage && (
        <details className={card}>
          <summary className="cursor-pointer text-lg font-semibold">Upravit dodávku</summary>
          <div className="mt-3">
            <ActionForm action={updateNeedAction.bind(null, id, needId)} submitLabel="Uložit" submitClassName={btnSecondary}>
              <input type="hidden" name="version" value={n.version} />
              <NeedFields
                responsibleOptions={people}
                defaults={{ ...n, plannedQuantity: n.plannedQuantity ? String(Number(n.plannedQuantity)).replace(".", ",") : null }}
              />
            </ActionForm>
          </div>
        </details>
      )}
      {d.manage && (
        <details className={card}>
          <summary className="cursor-pointer text-lg font-semibold">Archivovat dodávku</summary>
          <p className="mb-3 mt-1 text-sm text-slate-600">Převzaté množství se uvolní; vazby zůstanou dohledatelné. Vyžaduje důvod.</p>
          <ActionForm action={archiveNeedAction.bind(null, id, needId)} submitLabel="Archivovat" submitClassName={btnDanger}>
            <input type="hidden" name="version" value={n.version} />
            <TextArea name="reason" label="Důvod" required />
          </ActionForm>
        </details>
      )}
      {d.canUnarchive && (
        <section className={card}>
          <h3 className="mb-2 text-lg font-semibold">Obnovit dodávku</h3>
          <ActionForm action={unarchiveNeedAction.bind(null, id, needId)} submitLabel="Obnovit" submitClassName={btnSecondary}>
            <input type="hidden" name="version" value={n.version} />
            <TextArea name="reason" label="Důvod" required />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
