import type { Metadata } from "next";
import { ActionForm } from "@/ui/Form";
import { card } from "@/ui/styles";
import { createEventAction } from "../../../actions";
import { loadProject } from "../../data";
import { EventFields } from "../../EventFields";

export const metadata: Metadata = { title: "Nová událost" };

export default async function NewEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadProject(id);
  if (!loaded) return null;
  if (!loaded.detail.can.editEvents) {
    return <section className={card}><p className="text-sm text-slate-600">Události této zakázky nemůžete upravovat.</p></section>;
  }
  return (
    <section className={card}>
      <h2 className="mb-3 text-lg font-semibold">Nová událost / milník</h2>
      <ActionForm action={createEventAction.bind(null, id)} submitLabel="Uložit událost">
        <EventFields />
      </ActionForm>
    </section>
  );
}
