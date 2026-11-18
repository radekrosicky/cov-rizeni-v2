import Link from "next/link";
import { GLOBAL_ROLE_LABELS, MEMBER_ACCESS_LABELS } from "@/domain/values";
import { formatDateCz } from "@/domain/calendar/calendar";
import { EventDateBadge, MilestoneBadge } from "@/ui/Badges";
import { SavedNotice } from "@/ui/Notices";
import { btnPrimary, btnSecondary, card } from "@/ui/styles";
import { loadProject } from "./data";

const SAVED: Record<string, string> = {
  zakazka: "Zakázka byla založena a uložena. Vedoucí má přístup pro úpravy.",
  udalost: "Událost byla uložena.",
  archiv: "Zakázka byla archivována.",
};

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function ProjectOverview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ulozeno?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const loaded = await loadProject(id);
  if (!loaded) return null;
  const d = loaded.detail;
  const p = d.project;
  return (
    <div className="space-y-4">
      <SavedNotice show={!!sp.ulozeno}>{SAVED[sp.ulozeno ?? ""] ?? "Změna byla uložena."}</SavedNotice>

      {p.status === "archived" && (
        <div className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          <strong>Archivováno</strong> {p.archivedAt ? fmtTime(p.archivedAt) : ""} ({d.archivedByName}). Důvod: {p.archiveReason}. Zakázka je jen pro čtení.
        </div>
      )}

      <section id="terminy" className={card} aria-labelledby="terminy-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="terminy-h" className="text-lg font-semibold text-slate-900">
            Termíny a milníky
          </h2>
          {d.can.editEvents && (
            <Link href={`/zakazky/${p.id}/udalosti/nova`} className={btnPrimary}>
              + Přidat událost
            </Link>
          )}
        </div>
        {d.events.length === 0 ? (
          <p className="text-sm text-slate-600">Zatím žádné události. Termíny zakázky se zadávají jen zde – jako události.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.events.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 font-medium text-slate-900">{e.title}</span>
                  {e.isMilestone && <MilestoneBadge />}
                  {d.nearestEvent?.id === e.id && <span className="text-xs font-semibold text-accent-dark">nejbližší</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <EventDateBadge dates={e} />
                  {d.can.editEvents && (
                    <Link href={`/zakazky/${p.id}/udalosti/${e.id}`} className="ml-auto inline-flex min-h-9 items-center text-sm font-semibold text-accent-dark hover:underline">
                      Upravit / zapsat skutečnost
                    </Link>
                  )}
                </div>
                <dl className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-500">
                  <div>
                    <dt>Smluvně</dt>
                    <dd className="text-slate-700">{e.contractDate ? formatDateCz(e.contractDate) : "neuvedeno"}</dd>
                  </div>
                  <div>
                    <dt>Plán</dt>
                    <dd className="text-slate-700">{e.plannedDate ? formatDateCz(e.plannedDate) : "neuvedeno"}</dd>
                  </div>
                  <div>
                    <dt>Skutečně</dt>
                    <dd className="text-slate-700">{e.actualDate ? formatDateCz(e.actualDate) : "zatím ne"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
        {d.cancelledEvents.length > 0 && (
          <details className="mt-3 text-sm text-slate-600">
            <summary className="cursor-pointer">Zrušené události ({d.cancelledEvents.length})</summary>
            <ul className="mt-2 space-y-1">
              {d.cancelledEvents.map((e) => (
                <li key={e.id}>
                  <s>{e.title}</s> – důvod: {e.cancelReason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={card} aria-labelledby="udaje-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="udaje-h" className="text-lg font-semibold text-slate-900">
            Základní údaje
          </h2>
          {(d.can.edit || d.can.archive || d.can.unarchive) && (
            <Link href={`/zakazky/${p.id}/upravit`} className={btnSecondary}>
              Upravit
            </Link>
          )}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Odpovědný vedoucí</dt>
            <dd className="font-medium">{d.leaderName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Objednatel</dt>
            <dd className="font-medium">{p.clientName ?? "neuvedeno"}</dd>
          </div>
        </dl>
      </section>

      <section className={card} aria-labelledby="clenove-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="clenove-h" className="text-lg font-semibold text-slate-900">
            Kdo má přístup
          </h2>
          <Link href={`/zakazky/${p.id}/clenove`} className={btnSecondary}>
            {d.can.manageMembers ? "Spravovat přístup" : "Zobrazit"}
          </Link>
        </div>
        <ul className="space-y-1 text-sm">
          {d.members.map((m) => (
            <li key={m.userId}>
              {m.displayName} <span className="text-slate-500">· {GLOBAL_ROLE_LABELS[m.globalRole]} · {MEMBER_ACCESS_LABELS[m.access]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={card} aria-labelledby="zmena-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="zmena-h" className="text-lg font-semibold text-slate-900">
            Poslední změna
          </h2>
          <Link href={`/zakazky/${p.id}/historie`} className={btnSecondary}>
            Historie změn
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-700">{d.lastChange ? `${fmtTime(d.lastChange.at)} · ${d.lastChange.actorName}` : "—"}</p>
      </section>
    </div>
  );
}
