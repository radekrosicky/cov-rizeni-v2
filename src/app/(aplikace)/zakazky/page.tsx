import type { Metadata } from "next";
import Link from "next/link";
import { canGlobal } from "@/domain/access/permissions";
import { PROJECT_TYPE_LABELS } from "@/domain/values";
import { getCurrentActor } from "@/server/identity/session";
import { listProjects } from "@/server/app";
import { EventDateBadge, ProjectStatusBadge } from "@/ui/Badges";
import { IdentityGate } from "@/ui/Notices";
import { PageHeader } from "@/ui/PageHeader";
import { btnPrimary, card } from "@/ui/styles";

export const metadata: Metadata = { title: "Zakázky" };

export default async function ProjectsPage() {
  const actor = await getCurrentActor();
  if (!actor) return <IdentityGate />;
  const items = await listProjects(actor);
  const canCreate = canGlobal(actor, "project.create").allowed;
  return (
    <>
      <PageHeader
        title="Zakázky"
        lead={actor.globalRole === "admin" ? "Všechny zakázky." : "Zakázky, ke kterým máte přístup."}
        action={
          canCreate ? (
            <Link href="/zakazky/nova" className={btnPrimary}>
              + Nová zakázka
            </Link>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <section className={card}>
          <p className="text-sm text-slate-700">Zatím nemáte přidělenou žádnou zakázku.</p>
          {!canCreate && <p className="mt-1 text-sm text-slate-500">Přístup k zakázkám přiděluje správce.</p>}
        </section>
      ) : (
        <ul className="space-y-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link href={`/zakazky/${p.id}`} className={`${card} block border border-transparent hover:border-accent`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 text-base font-semibold text-slate-900">{p.name}</h2>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {PROJECT_TYPE_LABELS[p.projectType]} · Vedoucí: {p.leaderName}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span className="text-slate-500">Nejbližší:</span>
                  {p.nearestEvent ? (
                    <>
                      <span className="font-medium">{p.nearestEvent.title}</span>
                      <EventDateBadge dates={p.nearestEvent} />
                    </>
                  ) : (
                    <span className="text-slate-500">žádná otevřená událost</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
