import { suggestedTake } from "@/domain/budget/allocation";
import { TextField } from "@/ui/Form";
import { fmtQty } from "./data";

type Row = {
  item: { id: string; description: string | null; sheetName: string; rowNumber: number; code: string | null; quantity: string | null; quantityStatus: string; quantityRaw: string | null; unit: string | null; unitRaw: string | null };
  tracking: { needName: string; quantityTaken: string | null }[];
  allocation: { budget: number | null; taken: number; remaining: number | null };
};

/** Vybrané položky rozpočtu s převzatým množstvím (předvyplněno zbývající množství; nic se nevymýšlí). */
export function SourcesFields({ rows }: { rows: Row[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => {
        const it = r.item;
        const numeric = it.quantityStatus === "numeric";
        return (
          <li key={it.id} className="rounded-lg border border-slate-200 p-3">
            <input type="hidden" name="itemId" value={it.id} />
            <p className="font-medium text-slate-900">{it.description}</p>
            <p className="text-xs text-slate-500">
              {it.sheetName} · ř. {it.rowNumber}
              {it.code ? ` · ${it.code}` : ""} · v rozpočtu {numeric ? fmtQty(it.quantity, it.unit ?? it.unitRaw) : `„${it.quantityRaw ?? "bez množství"}“ (není jednoznačné číslo)`}
            </p>
            {r.tracking.length > 0 && (
              <p className="text-xs font-medium text-signal-risk">
                Už sledováno: {r.tracking.map((t) => `${t.needName} (${fmtQty(t.quantityTaken, it.unit)})`).join("; ")}
                {r.allocation.remaining !== null && ` · zbývá ${fmtQty(r.allocation.remaining, it.unit)}`}
              </p>
            )}
            {numeric ? (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <TextField name={`source.${i}.quantityTaken`} label={`Převzít z rozpočtu (${it.unit ?? it.unitRaw ?? "MJ"})`} defaultValue={suggestedTake(it.quantity, r.tracking.map((t) => t.quantityTaken))} required />
                <TextField name={`source.${i}.overAllocationReason`} label="Důvod (jen při překročení rozpočtu)" />
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Množství z rozpočtu nelze určit – uveďte plánované množství u dodávky.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
