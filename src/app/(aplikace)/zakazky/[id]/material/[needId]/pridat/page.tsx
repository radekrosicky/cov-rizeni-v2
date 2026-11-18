import type { Metadata } from "next";
import Link from "next/link";
import { getItemsForTracking, getNeed } from "@/server/app";
import { ActionForm } from "@/ui/Form";
import { card } from "@/ui/styles";
import { addSourcesAction } from "../../../../materialActions";
import { load } from "../../data";
import { SourcesFields } from "../../SourcesFields";

export const metadata: Metadata = { title: "Přidat do dodávky" };

export default async function AddSourcesPage({ params, searchParams }: { params: Promise<{ id: string; needId: string }>; searchParams: Promise<{ item?: string | string[] }> }) {
  const [{ id, needId }, sp] = await Promise.all([params, searchParams]);
  const items = (Array.isArray(sp.item) ? sp.item : sp.item ? [sp.item] : []).slice(0, 100);
  const loaded = await load(async (actor) => ({ need: await getNeed(actor, id, needId), rows: items.length ? await getItemsForTracking(actor, id, items) : [] }));
  if (!loaded) return null;
  const { need, rows } = loaded.data;
  const anyTracked = rows.some((r) => r.tracking.length > 0);
  return (
    <section className={card}>
      <Link href={`/zakazky/${id}/material/${needId}`} className="mb-2 inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← {need.need.name}
      </Link>
      <h2 className="mb-3 text-lg font-semibold">Přidat položky do dodávky „{need.need.name}“</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">Nejdřív zaškrtněte položky v seznamu položek rozpočtu.</p>
      ) : (
        <ActionForm action={addSourcesAction.bind(null, id, needId)} submitLabel="Přidat do dodávky">
          <input type="hidden" name="version" value={need.need.version} />
          <SourcesFields rows={rows} />
          {anyTracked && (
            <label className="flex min-h-11 items-start gap-3 rounded-md bg-signal-risk-bg p-3 text-sm font-medium text-signal-risk">
              <input type="checkbox" name="acknowledgeTracked" className="mt-1 h-5 w-5" />
              Vím, že některá položka už je sledována v jiné dodávce (rozdělení).
            </label>
          )}
        </ActionForm>
      )}
    </section>
  );
}
