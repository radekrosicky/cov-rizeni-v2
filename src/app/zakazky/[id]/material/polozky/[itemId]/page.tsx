import type { Metadata } from "next";
import Link from "next/link";
import { BUDGET_ROW_KIND_LABELS, BUDGET_ROW_KINDS, QUANTITY_STATUS_LABELS } from "@/domain/values";
import { getBudgetItem } from "@/server/app";
import { ActionForm, SelectField, TextArea } from "@/ui/Form";
import { SavedNotice } from "@/ui/Notices";
import { btnPrimary, btnSecondary, card } from "@/ui/styles";
import { markItemReviewedAction, setItemKindAction } from "../../../../materialActions";
import { fmtMoney, fmtQty, load } from "../../data";

export const metadata: Metadata = { title: "Položka rozpočtu" };

export default async function ItemDetailPage({ params, searchParams }: { params: Promise<{ id: string; itemId: string }>; searchParams: Promise<{ ulozeno?: string }> }) {
  const [{ id, itemId }, sp] = await Promise.all([params, searchParams]);
  const loaded = await load((actor) => getBudgetItem(actor, id, itemId));
  if (!loaded) return null;
  const d = loaded.data;
  const it = d.item;
  const base = `/zakazky/${id}/material`;
  const cells = Object.entries(it.rawCells).sort(([a], [b]) => a.length - b.length || a.localeCompare(b));
  return (
    <div className="space-y-4">
      <Link href={`${base}/polozky?import=${d.import.id}`} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Položky rozpočtu
      </Link>
      <SavedNotice show={!!sp.ulozeno} />
      <section className={card}>
        <h2 className="text-lg font-semibold">{it.description ?? "(bez popisu)"}</h2>
        <p className="text-sm text-slate-600">
          {it.code ? `${it.code} · ` : ""}
          {BUDGET_ROW_KIND_LABELS[it.kind]}
          {it.kind !== it.detectedKind && ` (při importu navrženo: ${BUDGET_ROW_KIND_LABELS[it.detectedKind]})`}
        </p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Množství v rozpočtu</dt>
            <dd className="font-medium">
              {it.quantityStatus === "numeric" ? fmtQty(it.quantity, it.unit ?? it.unitRaw) : `${QUANTITY_STATUS_LABELS[it.quantityStatus]}${it.quantityRaw ? ` („${it.quantityRaw}“)` : ""}`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Převzato do dodávek</dt>
            <dd className={`font-medium ${d.allocation.over ? "text-signal-risk" : ""}`}>
              {d.allocation.tracked ? `${fmtQty(d.allocation.taken, it.unit)}${d.allocation.remaining !== null ? ` · zbývá ${fmtQty(d.allocation.remaining, it.unit)}` : ""}` : "nic (nesledováno)"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Jednotková cena</dt>
            <dd>{fmtMoney(it.unitPrice)}{it.unitPriceRaw && it.unitPrice === null ? ` (v Excelu „${it.unitPriceRaw}“)` : ""}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Cena celkem</dt>
            <dd>{fmtMoney(it.totalPrice)}{it.totalPriceRaw && it.totalPrice === null ? ` (v Excelu „${it.totalPriceRaw}“)` : ""}</dd>
          </div>
        </dl>
        {it.reviewReasons.length > 0 && (
          <div className={`mt-3 rounded-md px-3 py-2 text-sm ${it.reviewedAt ? "bg-signal-done-bg text-signal-done" : "bg-signal-risk-bg text-signal-risk"}`}>
            <strong>{it.reviewedAt ? `Zkontrolováno (${d.reviewerName})` : "K ruční kontrole"}:</strong> {it.reviewReasons.join("; ")}
            {it.reviewNote && <span className="block">Poznámka: {it.reviewNote}</span>}
          </div>
        )}
        {d.manage && !["heading", "subtotal"].includes(it.kind) && (
          <Link href={`${base}/sledovat?rezim=one&item=${it.id}`} className={`${btnPrimary} mt-3`}>
            {d.allocation.tracked ? "Vytvořit další dodávku z této položky (rozdělit)" : "Sledovat jako dodávku"}
          </Link>
        )}
      </section>

      <section className={card} aria-labelledby="puvod">
        <h3 id="puvod" className="text-lg font-semibold">
          Původ – originál z Excelu
        </h3>
        <p className="text-sm text-slate-600">
          Dokument <Link href={`/zakazky/${id}/dokumenty/${d.document.id}`} className="text-accent-dark underline">{d.document.title}</Link> · revize {d.revision.revisionNo} ({d.revision.originalFilename}) · list „{it.sheetName}“ · řádek {it.rowNumber}
        </p>
        <table className="mt-2 text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="pr-4">Sloupec</th>
              <th>Hodnota v Excelu (beze změny)</th>
            </tr>
          </thead>
          <tbody>
            {cells.map(([col, c]) => (
              <tr key={col} className="border-t border-slate-100">
                <td className="py-1 pr-4 font-mono text-xs">{col}</td>
                <td className="break-all py-1">
                  {c.error ? <span className="font-semibold text-signal-problem">chyba {c.error}</span> : c.value === null ? <span className="text-signal-risk">prázdné</span> : String(c.value)}
                  {c.formula && <span className="ml-2 text-xs text-slate-500">(vzorec{c.value === null ? " bez uloženého výsledku" : ""})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold">V dodávkách</h3>
        {d.sources.length === 0 ? (
          <p className="text-sm text-slate-600">Zatím v žádné dodávce.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {d.sources.map((s) => (
              <li key={s.s.id}>
                <Link href={`${base}/${s.need.id}`} className="text-accent-dark underline">
                  {s.need.name}
                </Link>{" "}
                – převzato {fmtQty(s.s.quantityTaken, it.unit)}
                {s.need.status === "archived" && " (archivováno – nepočítá se)"}
                {s.s.overAllocationReason && <span className="text-signal-risk"> · nad rozpočet: {s.s.overAllocationReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.manage && (
        <section className={card}>
          <h3 className="mb-2 text-lg font-semibold">Upravit výklad položky</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            <ActionForm action={setItemKindAction.bind(null, id, it.id)} submitLabel="Uložit druh" submitClassName={btnSecondary}>
              <SelectField name="kind" label="Druh řádku" defaultValue={it.kind} options={BUDGET_ROW_KINDS.map((k) => ({ value: k, label: BUDGET_ROW_KIND_LABELS[k] }))} hint="Původní hodnoty z Excelu se nemění." />
            </ActionForm>
            {it.reviewReasons.length > 0 && !it.reviewedAt && (
              <ActionForm action={markItemReviewedAction.bind(null, id, it.id)} submitLabel="Označit jako zkontrolované" submitClassName={btnSecondary}>
                <TextArea name="note" label="Poznámka ke kontrole" hint="Např. „množství upřesní dodavatel“." />
              </ActionForm>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
