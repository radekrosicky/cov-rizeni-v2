import type { Metadata } from "next";
import Link from "next/link";
import { listBudgetSources } from "@/server/app";
import { btnPrimary, btnSecondary, card } from "@/ui/styles";
import { load } from "../data";

export const metadata: Metadata = { title: "Načíst rozpočet" };

export default async function ImportChoosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await load((actor) => listBudgetSources(actor, id));
  if (!loaded) return null;
  const { sources, manage } = loaded.data;
  return (
    <div className="space-y-4">
      <Link href={`/zakazky/${id}/material`} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Materiál
      </Link>
      <section className={card}>
        <h2 className="text-lg font-semibold">Načíst položky z rozpočtu</h2>
        <p className="mt-1 text-sm text-slate-600">
          Krok 1 ze 3: vyberte rozpočet. Rozpočet se nejdřív nahrává do <strong>Dokumentů</strong> jako druh „Rozpočty“ (soubor XLSX).
          Načtení nic nemění na původním souboru.
        </p>
        {!manage && <p className="mt-2 text-sm text-slate-600">Načítat rozpočty smí jen správce nebo zástupce.</p>}
      </section>
      {sources.length === 0 ? (
        <section className={card}>
          <p className="text-sm text-slate-700">V Dokumentech zatím není žádný rozpočet.</p>
          <Link href={`/zakazky/${id}/dokumenty/novy?druh=budget`} className={`${btnPrimary} mt-3`}>
            Nahrát rozpočet do Dokumentů
          </Link>
        </section>
      ) : (
        <ul className="space-y-3">
          {sources.map((s) => (
            <li key={s.document.id} className={card}>
              <p className="font-semibold text-slate-900">{s.document.title}</p>
              <p className="text-sm text-slate-600">
                Aktuální revize {s.current.revisionNo} · {s.current.originalFilename}
                {!s.isXlsx && " · není XLSX (položky nelze načíst – PDF rozpočty později)"}
              </p>
              {s.importedRevisions.length > 0 && (
                <p className="text-xs text-slate-500">Načteno z revizí: {s.importedRevisions.map((r) => r.revisionNo).join(", ")}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {s.currentImport ? (
                  <Link href={`/zakazky/${id}/material/polozky?import=${s.currentImport.id}`} className={btnSecondary}>
                    Zobrazit načtené položky
                  </Link>
                ) : (
                  s.isXlsx &&
                  manage && (
                    <Link href={`/zakazky/${id}/material/import/${s.current.id}`} className={btnPrimary}>
                      Načíst položky (rev. {s.current.revisionNo})
                    </Link>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
