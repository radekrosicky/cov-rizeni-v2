import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_LABELS, ROLES, type Cell } from "@/domain/budget/types";
import { BUDGET_ROW_KIND_LABELS } from "@/domain/values";
import { analyzeBudget, previewBudget } from "@/server/app";
import { DomainError } from "@/server/errors";
import { ActionForm } from "@/ui/Form";
import { btnPrimary, btnSecondary, card, inputCls } from "@/ui/styles";
import { confirmImportAction } from "../../../../materialActions";
import { fmtMoney, fmtQty, load } from "../../data";
import { mappingsFromParams, paramsOf, type SP } from "../mappingParams";

export const metadata: Metadata = { title: "Náhled rozpočtu" };

function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function CellView({ c }: { c: Cell | undefined }) {
  if (!c) return null;
  if (c.error) return <span className="font-semibold text-signal-problem">{c.error}</span>;
  if (c.formula && (c.value === null || c.value === "")) return <span className="text-signal-risk" title="Vzorec bez uloženého výsledku">ƒ ?</span>;
  return (
    <span>
      {String(c.value)}
      {c.formula && <span className="ml-1 text-[10px] text-slate-400" title="Výsledek vzorce">ƒ</span>}
    </span>
  );
}

/** Chyba čtení (limit, poškozený soubor) – srozumitelně, s cestou zpět. Nic se neuložilo. */
function ReadError({ id, message }: { id: string; message: string }) {
  return (
    <section className={card}>
      <div role="alert" className="rounded-md border border-red-200 bg-signal-problem-bg px-3 py-2 text-sm font-medium text-signal-problem">
        {message}
      </div>
      <Link href={`/zakazky/${id}/material/import`} className={`${btnSecondary} mt-3`}>
        ← Zpět na výběr rozpočtu
      </Link>
    </section>
  );
}

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string; revisionId: string }>; searchParams: Promise<SP> }) {
  const [{ id, revisionId }, sp] = await Promise.all([params, searchParams]);
  const base = `/zakazky/${id}/material/import/${revisionId}`;
  let loaded;
  try {
    loaded = await load((actor) => previewBudget(actor, id, revisionId));
  } catch (e) {
    if (e instanceof DomainError) return <ReadError id={id} message={e.message} />;
    throw e;
  }
  if (!loaded) return null;
  const pv = loaded.data;
  const { chosen, mappings } = mappingsFromParams(sp, pv.sheets);
  const step = sp.krok === "kontrola" ? 3 : 2;

  if (pv.alreadyImported) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-700">Tato revize rozpočtu už byla načtena.</p>
        <Link href={`/zakazky/${id}/material/polozky?import=${pv.alreadyImported.id}`} className={`${btnPrimary} mt-3`}>
          Zobrazit položky
        </Link>
      </section>
    );
  }

  const header = (
    <div className="space-y-2">
      <Link href={`/zakazky/${id}/material/import`} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Výběr rozpočtu
      </Link>
      <section className={card}>
        <h2 className="text-lg font-semibold">
          {pv.document.title} – revize {pv.revision.revisionNo}
        </h2>
        <p className="text-sm text-slate-600">
          {pv.revision.originalFilename} · Krok {step} ze 3: {step === 2 ? "potvrďte listy a sloupce" : "zkontrolujte a uložte"}
        </p>
        {pv.sameFileImported.length > 0 && (
          <p role="note" className="mt-2 rounded-md bg-signal-risk-bg px-3 py-2 text-sm text-signal-risk">
            Shodný soubor už byl načten z dokumentu „{pv.sameFileImported[0]!.title}“ (rev. {pv.sameFileImported[0]!.revisionNo}). Pokračujte jen pokud to opravdu chcete.
          </p>
        )}
      </section>
    </div>
  );

  // ---------- Krok 3: kontrola a uložení ----------
  if (step === 3) {
    const selected = mappings.filter((_, i) => chosen[i]);
    let an;
    try {
      an = (await load((actor) => analyzeBudget(actor, id, revisionId, selected)))!.data;
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      return (
        <div className="space-y-4">
          {header}
          <section className={card}>
            <div role="alert" className="rounded-md border border-red-200 bg-signal-problem-bg px-3 py-2 text-sm font-medium text-signal-problem">
              {e.message}
            </div>
            <Link href={`${base}?${paramsOf(pv.sheets, chosen, mappings)}`} className={`${btnSecondary} mt-3`}>
              ← Upravit výběr sloupců
            </Link>
          </section>
        </div>
      );
    }
    const review = an.rows.filter((r) => r.reviewReasons.length > 0);
    const material = an.rows.filter((r) => r.kind === "material");
    return (
      <div className="space-y-4">
        {header}
        <section className={card} aria-labelledby="souhrn">
          <h3 id="souhrn" className="text-lg font-semibold">
            Výsledek rozpoznání (zatím NEULOŽENO)
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Položek celkem", an.summary.items],
              [BUDGET_ROW_KIND_LABELS.material, an.summary.material],
              [BUDGET_ROW_KIND_LABELS.work, an.summary.work],
              [BUDGET_ROW_KIND_LABELS.service, an.summary.service],
              ["Nadpisy", an.summary.headings],
              ["Mezisoučty (nesledují se)", an.summary.subtotals],
              ["Ostatní", an.summary.other],
              ["K ruční kontrole", an.summary.needsReview],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-md bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className={`text-lg font-semibold ${k === "K ruční kontrole" && Number(v) > 0 ? "text-signal-risk" : "text-slate-900"}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">Druh řádku je jen návrh – u každé položky ho lze později změnit. Chybějící údaje aplikace nedoplňuje.</p>
        </section>

        {review.length > 0 && (
          <section className={card} aria-labelledby="kontrola">
            <h3 id="kontrola" className="text-lg font-semibold text-signal-risk">
              K ruční kontrole ({review.length})
            </h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {review.map((r) => (
                <li key={`${r.sheetName}-${r.rowNumber}`} className="py-2">
                  <span className="font-medium">
                    {r.sheetName} · ř. {r.rowNumber}
                  </span>{" "}
                  {r.description ?? "(bez popisu)"}
                  <ul className="ml-4 list-disc text-signal-risk">
                    {r.reviewReasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={card} aria-labelledby="ukazka">
          <h3 id="ukazka" className="text-lg font-semibold">
            Materiál a technologie – ukázka ({material.length})
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pr-3">List / ř.</th>
                  <th className="pr-3">Popis</th>
                  <th className="pr-3">Množství</th>
                  <th className="pr-3">Jedn. cena</th>
                  <th>Celkem</th>
                </tr>
              </thead>
              <tbody>
                {material.slice(0, 15).map((r) => (
                  <tr key={`${r.sheetName}-${r.rowNumber}`} className="border-t border-slate-100">
                    <td className="py-1 pr-3 text-xs text-slate-500">
                      {r.sheetName} · {r.rowNumber}
                    </td>
                    <td className="pr-3">{r.description}</td>
                    <td className="pr-3">{r.quantityStatus === "numeric" ? fmtQty(r.quantity, r.unit ?? r.unitRaw) : <span className="text-signal-risk">{r.quantityRaw ?? "chybí"}</span>}</td>
                    <td className="pr-3">{fmtMoney(r.unitPrice)}</td>
                    <td>{fmtMoney(r.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={card} aria-labelledby="ulozit">
          <h3 id="ulozit" className="mb-3 text-lg font-semibold">
            Uložit položky rozpočtu
          </h3>
          <ActionForm action={confirmImportAction.bind(null, id, revisionId)} submitLabel="Potvrdit a uložit položky">
            <input type="hidden" name="mappings" value={JSON.stringify(selected)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-800">
                Měna cen
                <select name="currency" defaultValue="" className={`${inputCls} mt-1`}>
                  <option value="">Neuvedeno (nevím)</option>
                  <option value="CZK">CZK</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-800">
                Ceny jsou
                <select name="vatBasis" defaultValue="" className={`${inputCls} mt-1`}>
                  <option value="">Neuvedeno (nevím)</option>
                  <option value="without_vat">bez DPH</option>
                  <option value="with_vat">s DPH</option>
                </select>
              </label>
            </div>
            {review.length > 0 && (
              <label className="flex min-h-11 items-start gap-3 text-sm font-medium text-slate-800">
                <input type="checkbox" name="reviewAcknowledged" className="mt-1 h-5 w-5" />
                Zkontroloval(a) jsem {review.length} {review.length === 1 ? "položku označenou" : review.length <= 4 ? "položky označené" : "položek označených"} k ruční kontrole. Uloží se s
                tímto označením a nic se v nich nedoplní.
              </label>
            )}
            {an.sameFileImported && (
              <label className="flex min-h-11 items-start gap-3 text-sm font-medium text-slate-800">
                <input type="checkbox" name="sameFileAcknowledged" className="mt-1 h-5 w-5" />
                Vím, že shodný soubor už byl načten jinde, a chci ho načíst znovu.
              </label>
            )}
          </ActionForm>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`${base}?${paramsOf(pv.sheets, chosen, mappings)}`} className={btnSecondary}>
              ← Upravit výběr sloupců
            </Link>
            <Link href={`/zakazky/${id}/material`} className={btnSecondary}>
              Zrušit import
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // ---------- Krok 2: náhled a potvrzení sloupců ----------
  return (
    <div className="space-y-4">
      {header}
      <form method="get" action={base} className="space-y-4">
        {pv.sheets.map((s, i) => {
          const m = mappings[i]!;
          const cols = Array.from({ length: Math.min(s.colCount, 30) }, (_, c) => columnLetter(c));
          const headerCells = s.previewRows.find((r) => r.rowNumber === m.headerRow)?.cells ?? {};
          return (
            <section key={s.name} className={card} aria-label={`List ${s.name}`}>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name={`s${i}`} value="1" defaultChecked={chosen[i]} className="h-5 w-5" />
                <span className="text-base font-semibold text-slate-900">{s.name}</span>
                {s.hidden && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">skrytý list</span>}
                <span className="text-xs text-slate-500">
                  {s.nonEmptyRows} řádků · {s.colCount} sloupců
                </span>
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ROLES.map((role) => (
                  <label key={role} className="block text-sm font-medium text-slate-800">
                    {ROLE_LABELS[role]}
                    {role === "description" ? " *" : ""}
                    <select name={`c${i}.${role}`} defaultValue={m.columns[role] ?? ""} className={`${inputCls} mt-1`}>
                      <option value="">— nepoužít —</option>
                      {cols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                          {headerCells[c]?.value ? ` – ${String(headerCells[c]!.value).slice(0, 25)}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="block text-sm font-medium text-slate-800">
                  Řádek záhlaví
                  <input name={`h${i}`} type="number" min={1} defaultValue={m.headerRow ?? ""} className={`${inputCls} mt-1`} />
                </label>
                <label className="block text-sm font-medium text-slate-800">
                  První řádek s daty *
                  <input name={`f${i}`} type="number" min={1} defaultValue={m.firstDataRow} className={`${inputCls} mt-1`} />
                </label>
              </div>
              <details className="mt-3" open={chosen[i]}>
                <summary className="cursor-pointer text-sm font-semibold text-accent-dark">Náhled listu (prvních {s.previewRows.length} neprázdných řádků)</summary>
                <div className="mt-2 max-h-96 overflow-auto rounded border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-slate-100">
                      <tr>
                        <th className="px-2 py-1 text-left">ř.</th>
                        {cols.map((c) => {
                          const role = ROLES.find((r) => m.columns[r] === c);
                          return (
                            <th key={c} className={`px-2 py-1 text-left ${role ? "bg-blue-100 text-accent-dark" : ""}`}>
                              {c}
                              {role ? ` · ${ROLE_LABELS[role]}` : ""}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {s.previewRows.map((r) => (
                        <tr key={r.rowNumber} className={`border-t border-slate-100 ${r.rowNumber === m.headerRow ? "bg-amber-50 font-semibold" : r.rowNumber < m.firstDataRow ? "text-slate-400" : ""}`}>
                          <td className="px-2 py-1 text-slate-500">{r.rowNumber}</td>
                          {cols.map((c) => (
                            <td key={c} className="max-w-[16rem] truncate px-2 py-1">
                              <CellView c={r.cells[c]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="krok" value="kontrola" className={btnPrimary}>
            Pokračovat ke kontrole
          </button>
          <Link href={`/zakazky/${id}/material`} className={btnSecondary}>
            Zrušit import
          </Link>
        </div>
      </form>
    </div>
  );
}
