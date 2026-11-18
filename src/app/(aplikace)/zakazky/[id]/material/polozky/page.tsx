import type { Metadata } from "next";
import Link from "next/link";
import { BUDGET_ROW_KIND_LABELS, BUDGET_ROW_KINDS } from "@/domain/values";
import { listBudgetItems, listNeeds } from "@/server/app";
import { SavedNotice } from "@/ui/Notices";
import { btnPrimary, btnSecondary, card, inputCls } from "@/ui/styles";
import { fmtMoney, fmtQty, load } from "../data";

export const metadata: Metadata = { title: "Položky rozpočtu" };

type SP = { import?: string; druh?: string; q?: string; nesledovane?: string; kontrola?: string; ulozeno?: string };

export default async function ItemsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const loaded = await load(async (actor) => ({
    list: await listBudgetItems(actor, id, { importId: sp.import ?? null, kind: sp.druh ?? null, q: sp.q ?? null, onlyUntracked: sp.nesledovane === "1", onlyReview: sp.kontrola === "1" }),
    needs: await listNeeds(actor, id),
  }));
  if (!loaded) return null;
  const { list, needs } = loaded.data;
  const base = `/zakazky/${id}/material`;
  const current = list.imports.find((i) => i.imp.id === list.importId);
  const activeNeeds = needs.needs.filter((n) => n.status !== "archived");

  return (
    <div className="space-y-4">
      <Link href={base} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Materiál
      </Link>
      <SavedNotice show={sp.ulozeno === "import"}>Položky rozpočtu byly uloženy. Vyberte, co chcete sledovat.</SavedNotice>
      <section className={card}>
        <h2 className="text-lg font-semibold">Položky rozpočtu</h2>
        {current ? (
          <p className="text-sm text-slate-600">
            {current.title} – rev. {current.revisionNo} ({current.filename}) · ceny: {current.imp.currency ?? "měna neuvedena"},{" "}
            {current.imp.vatBasis === "without_vat" ? "bez DPH" : current.imp.vatBasis === "with_vat" ? "s DPH" : "DPH neuvedeno"}
          </p>
        ) : (
          <p className="text-sm text-slate-600">Zatím nejsou načtené žádné položky.</p>
        )}
        <form method="get" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.imports.length > 1 && (
            <label className="block text-sm font-medium">
              Rozpočet
              <select name="import" defaultValue={list.importId ?? ""} className={`${inputCls} mt-1`}>
                {list.imports.map((i) => (
                  <option key={i.imp.id} value={i.imp.id}>
                    {i.title} – rev. {i.revisionNo}
                  </option>
                ))}
              </select>
            </label>
          )}
          {list.imports.length <= 1 && list.importId && <input type="hidden" name="import" value={list.importId} />}
          <label className="block text-sm font-medium">
            Zobrazit
            <select name="druh" defaultValue={sp.druh ?? "k-objednani"} className={`${inputCls} mt-1`}>
              <option value="k-objednani">Materiál a technologie</option>
              <option value="vse">Všechny řádky</option>
              {BUDGET_ROW_KINDS.map((k) => (
                <option key={k} value={k}>
                  Jen: {BUDGET_ROW_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Hledat
            <input name="q" defaultValue={sp.q ?? ""} placeholder="např. čerpadlo" className={`${inputCls} mt-1`} />
          </label>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="nesledovane" value="1" defaultChecked={sp.nesledovane === "1"} className="h-5 w-5" /> Jen nesledované
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="kontrola" value="1" defaultChecked={sp.kontrola === "1"} className="h-5 w-5" /> Jen k ruční kontrole
            </label>
          </div>
          <button type="submit" className={btnSecondary}>
            Filtrovat
          </button>
        </form>
      </section>

      {list.items.length === 0 ? (
        <section className={card}>
          <p className="text-sm text-slate-700">Žádné položky neodpovídají filtru.</p>
        </section>
      ) : (
        <form method="get" action={`${base}/sledovat`} className="space-y-3">
          {list.manage && (
            <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-xl bg-white/95 p-3 shadow-sm">
              <button type="submit" name="rezim" value="one" className={btnPrimary}>
                Sledovat vybrané jako jednu dodávku
              </button>
              <button type="submit" name="rezim" value="each" className={btnSecondary}>
                Každou zvlášť
              </button>
              {activeNeeds.length > 0 && (
                <span className="flex flex-wrap items-center gap-2">
                  <select name="doDodavky" defaultValue="" className={`${inputCls} w-auto`} aria-label="Přidat do existující dodávky">
                    <option value="">Přidat do existující dodávky…</option>
                    {activeNeeds.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" name="rezim" value="add" className={btnSecondary}>
                    Přidat
                  </button>
                </span>
              )}
            </div>
          )}
          <ul className="space-y-2">
            {list.items.map((it) =>
              it.kind === "heading" ? (
                <li key={it.id} className="px-1 pt-2 text-sm font-semibold text-slate-700">
                  {it.sheetName} · {it.description}
                </li>
              ) : (
                <li key={it.id} className={`${card} flex gap-3`} data-item-row={it.rowNumber}>
                  {list.manage && it.kind !== "subtotal" && (
                    <input type="checkbox" name="item" value={it.id} className="mt-1 h-5 w-5 shrink-0" aria-label={`Vybrat ${it.description ?? ""}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link href={`${base}/polozky/${it.id}`} className="min-w-0 font-medium text-slate-900 hover:text-accent-dark hover:underline">
                        {it.description ?? "(bez popisu)"}
                      </Link>
                      {it.allocation.tracked ? (
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${it.allocation.over ? "bg-signal-risk-bg text-signal-risk" : "bg-signal-done-bg text-signal-done"}`}>
                          {it.allocation.budget !== null && it.allocation.taken < it.allocation.budget
                            ? `Částečně (${fmtQty(it.allocation.taken)} z ${fmtQty(it.allocation.budget, it.unit)})`
                            : it.allocation.over
                              ? `Sledováno nad rozpočet (${fmtQty(it.allocation.taken)} z ${fmtQty(it.allocation.budget, it.unit)})`
                              : "Sledováno"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Nesledováno</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {it.sheetName} · ř. {it.rowNumber}
                      {it.code ? ` · ${it.code}` : ""} · {BUDGET_ROW_KIND_LABELS[it.kind]}
                    </p>
                    <p className="text-sm text-slate-700">
                      {it.quantityStatus === "numeric" ? fmtQty(it.quantity, it.unit ?? it.unitRaw) : <span className="text-signal-risk">množství: {it.quantityRaw ?? "chybí"}</span>}
                      {" · "}jedn. cena {fmtMoney(it.unitPrice)} · celkem {fmtMoney(it.totalPrice)}
                    </p>
                    {it.tracking.length > 0 && <p className="text-xs text-slate-600">V dodávkách: {it.tracking.map((t) => `${t.needName} (${fmtQty(t.quantityTaken, it.unit)})`).join("; ")}</p>}
                    {it.reviewReasons.length > 0 && !it.reviewedAt && <p className="text-xs font-medium text-signal-risk">K ruční kontrole: {it.reviewReasons.join("; ")}</p>}
                  </div>
                </li>
              ),
            )}
          </ul>
        </form>
      )}
    </div>
  );
}
