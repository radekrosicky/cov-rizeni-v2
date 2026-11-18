import type { Metadata } from "next";
import Link from "next/link";
import { listResponsibleCandidates, listNeeds } from "@/server/app";
import { ActionForm } from "@/ui/Form";
import { card } from "@/ui/styles";
import { createManualNeedAction } from "../../../materialActions";
import { load } from "../data";
import { NeedFields } from "../NeedFields";

export const metadata: Metadata = { title: "Ruční dodávka" };

export default async function ManualNeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await load(async (actor) => ({ people: await listResponsibleCandidates(actor, id), manage: (await listNeeds(actor, id)).manage }));
  if (!loaded) return null;
  if (!loaded.data.manage) return <section className={card}><p className="text-sm text-slate-600">Dodávky zakládá správce nebo zástupce.</p></section>;
  return (
    <section className={card}>
      <Link href={`/zakazky/${id}/material`} className="mb-2 inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Materiál
      </Link>
      <h2 className="mb-1 text-lg font-semibold">Ruční dodávka (bez rozpočtu)</h2>
      <p className="mb-3 text-sm text-slate-600">Pro materiál, který v rozpočtu není nebo rozpočet ještě nemáte.</p>
      <ActionForm action={createManualNeedAction.bind(null, id)} submitLabel="Vytvořit dodávku">
        <NeedFields responsibleOptions={loaded.data.people} />
      </ActionForm>
    </section>
  );
}
