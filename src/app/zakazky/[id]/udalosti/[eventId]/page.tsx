import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DomainError } from "@/server/errors";
import Link from "next/link";
import { getEvent, listNeedsForEvent } from "@/server/app";
import { ActionForm, TextArea } from "@/ui/Form";
import { btnDanger, card } from "@/ui/styles";
import { cancelEventAction, updateEventAction } from "../../../actions";
import { loadProject } from "../../data";
import { EventFields } from "../../EventFields";
import { ScheduleLine } from "../../material/ScheduleView";

export const metadata: Metadata = { title: "Upravit událost" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await params;
  const loaded = await loadProject(id);
  if (!loaded) return null;
  const event = await getEvent(loaded.actor, id, eventId).catch((e: unknown) => {
    if (e instanceof DomainError) notFound();
    throw e;
  });
  if (!loaded.detail.can.editEvents || event.status !== "active") {
    return <section className={card}><p className="text-sm text-slate-600">Tuto událost nemůžete upravovat.</p></section>;
  }
  const linked = await listNeedsForEvent(loaded.actor, id, eventId);
  return (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="mb-3 text-lg font-semibold">Upravit událost</h2>
        <ActionForm action={updateEventAction.bind(null, id, eventId)} submitLabel="Uložit změny">
          <input type="hidden" name="version" value={event.version} />
          <EventFields defaults={event} />
          <TextArea name="reason" label="Důvod změny" hint="Povinné při změně smluvního termínu nebo opravě již zapsaného skutečného data." />
        </ActionForm>
      </section>
      <section className={card} aria-labelledby="navazane">
        <h2 id="navazane" className="text-lg font-semibold">
          Navázané dodávky ({linked.length})
        </h2>
        {linked.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">Na tuto událost zatím není navázaná žádná sledovaná dodávka.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">Při změně termínu události se jejich doporučené objednání přepočítá automaticky – v dodávkách se nic nepřepisuje.</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {linked.map((n) => (
                <li key={n.id} className="py-2">
                  <Link href={`/zakazky/${id}/material/${n.id}`} className="text-sm font-semibold text-accent-dark underline">
                    {n.name}
                  </Link>
                  <ScheduleLine schedule={n.schedule} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Zrušit událost</h2>
        <p className="mb-3 mt-1 text-sm text-slate-600">
          Událost se nesmaže, zůstane dohledatelná v historii. Vyžaduje důvod.
          {linked.length > 0 && ` Navázané dodávky (${linked.length}) pak bude třeba převázat na jinou událost.`}
        </p>
        <ActionForm action={cancelEventAction.bind(null, id, eventId)} submitLabel="Zrušit událost" submitClassName={btnDanger}>
          <input type="hidden" name="version" value={event.version} />
          <TextArea name="reason" label="Důvod zrušení" required />
        </ActionForm>
      </section>
    </div>
  );
}
