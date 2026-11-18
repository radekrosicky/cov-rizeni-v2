import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getItemsForTracking, listResponsibleCandidates } from "@/server/app";
import { ActionForm } from "@/ui/Form";
import { card } from "@/ui/styles";
import { createNeedsAction } from "../../../materialActions";
import { load } from "../data";
import { NeedFields } from "../NeedFields";
import { SourcesFields } from "../SourcesFields";

export const metadata: Metadata = { title: "Sledovat dodávku" };

type SP = { item?: string | string[]; rezim?: string; doDodavky?: string };

export default async function TrackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const base = `/zakazky/${id}/material`;
  const items = (Array.isArray(sp.item) ? sp.item : sp.item ? [sp.item] : []).slice(0, 100);
  if (sp.rezim === "add" && sp.doDodavky) redirect(`${base}/${sp.doDodavky}/pridat?${items.map((i) => `item=${i}`).join("&")}`);
  if (items.length === 0) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-700">Nejdřív zaškrtněte položky rozpočtu, které chcete sledovat.</p>
        <Link href={`${base}/polozky`} className="mt-2 inline-block text-accent-dark underline">
          ← Položky rozpočtu
        </Link>
      </section>
    );
  }
  const loaded = await load(async (actor) => ({ rows: await getItemsForTracking(actor, id, items), people: await listResponsibleCandidates(actor, id) }));
  if (!loaded) return null;
  const { rows, people } = loaded.data;
  const mode = sp.rezim === "each" && rows.length > 1 ? "each" : "one";
  const first = rows[0]!.item;
  // Plánované množství předvyplnit jen když je jednoznačné (stejná jednotka, číselná množství).
  const units = new Set(rows.map((r) => r.item.unit ?? r.item.unitRaw));
  const allNumeric = rows.every((r) => r.item.quantityStatus === "numeric");
  const sum = allNumeric && units.size === 1 ? rows.reduce((s, r) => s + Number(r.allocation.remaining && r.allocation.remaining > 0 ? r.allocation.remaining : r.item.quantity), 0) : null;
  const anyTracked = rows.some((r) => r.tracking.length > 0);

  return (
    <div className="space-y-4">
      <Link href={`${base}/polozky`} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Položky rozpočtu
      </Link>
      <section className={card}>
        <h2 className="mb-1 text-lg font-semibold">
          {mode === "each" ? `Sledovat ${rows.length} položek – každou jako samostatnou dodávku` : rows.length > 1 ? `Sloučit ${rows.length} položek do jedné dodávky` : anyTracked ? "Další dodávka z položky (rozdělení)" : "Sledovat jako dodávku"}
        </h2>
        <p className="mb-3 text-sm text-slate-600">Dodávka vznikne jako „K potvrzení“ – není to objednávka a nemá termíny. Rozpočet se nemění.</p>
        <ActionForm action={createNeedsAction.bind(null, id)} submitLabel={mode === "each" ? `Vytvořit ${rows.length} dodávek` : "Vytvořit dodávku"}>
          <input type="hidden" name="mode" value={mode} />
          {mode === "one" ? (
            <NeedFields
              responsibleOptions={people}
              defaults={{ name: rows.length === 1 ? first.description : `${first.description ?? ""} a další`, plannedQuantity: sum !== null ? String(sum).replace(".", ",") : null, unit: units.size === 1 ? [...units][0] : null }}
            />
          ) : (
            <>
              <input type="hidden" name="name" value="—" />
              <p className="text-sm text-slate-600">Název a množství se převezmou z každé položky. Společně nastavíte:</p>
              <NeedFields responsibleOptions={people} hideQuantity hideName />
            </>
          )}
          <h3 className="pt-2 text-base font-semibold">Ze kterých položek rozpočtu</h3>
          <SourcesFields rows={rows} />
          {anyTracked && (
            <label className="flex min-h-11 items-start gap-3 rounded-md bg-signal-risk-bg p-3 text-sm font-medium text-signal-risk">
              <input type="checkbox" name="acknowledgeTracked" className="mt-1 h-5 w-5" />
              Vím, že položka už je sledována, a chci vytvořit další dodávku (rozdělení).
            </label>
          )}
        </ActionForm>
      </section>
    </div>
  );
}
