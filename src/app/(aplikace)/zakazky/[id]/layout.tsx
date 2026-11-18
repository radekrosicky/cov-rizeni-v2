import type { ReactNode } from "react";
import Link from "next/link";
import { MEMBER_ACCESS_LABELS, PROJECT_TYPE_LABELS } from "@/domain/values";
import { ProjectStatusBadge } from "@/ui/Badges";
import { IdentityGate } from "@/ui/Notices";
import { loadProject } from "./data";
import { ProjectTabs } from "./ProjectTabs";

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadProject(id);
  if (!loaded) return <IdentityGate />;
  const { project, membership, can } = loaded.detail;
  const accessLabel = loaded.actor.globalRole === "admin" ? "Správce – plný přístup" : can.edit ? MEMBER_ACCESS_LABELS.edit : MEMBER_ACCESS_LABELS.read;
  return (
    <>
      <Link href="/zakazky" className="mb-2 inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Zakázky
      </Link>
      <header className="mb-3">
        <div className="flex flex-wrap items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl font-bold text-slate-900">{project.name}</h1>
          <ProjectStatusBadge status={project.status} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {PROJECT_TYPE_LABELS[project.projectType]}
          {project.projectTypeNote ? ` – ${project.projectTypeNote}` : ""} · Váš přístup:{" "}
          <strong className={can.edit ? "text-slate-800" : "text-signal-unverified"}>{membership || loaded.actor.globalRole === "admin" ? accessLabel : "—"}</strong>
        </p>
      </header>
      <ProjectTabs projectId={project.id} />
      {children}
    </>
  );
}
