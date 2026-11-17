import type { Metadata } from "next";
import { canGlobal } from "@/domain/access/permissions";
import { getCurrentActor, identityMode } from "@/server/identity/session";
import { listLeaderCandidates } from "@/server/app";
import { ActionForm } from "@/ui/Form";
import { IdentityGate } from "@/ui/Notices";
import { PageHeader } from "@/ui/PageHeader";
import { card } from "@/ui/styles";
import { createProjectAction } from "../actions";
import { ProjectFields } from "../ProjectFields";

export const metadata: Metadata = { title: "Nová zakázka" };

export default async function NewProjectPage() {
  const actor = await getCurrentActor();
  if (!actor) return <IdentityGate mode={identityMode()} />;
  if (!canGlobal(actor, "project.create").allowed) {
    return (
      <section className={card}>
        <h1 className="text-xl font-bold">Nová zakázka</h1>
        <p className="mt-2 text-sm text-slate-600">Zakládat zakázky smí jen správce nebo zástupce.</p>
      </section>
    );
  }
  const leaders = await listLeaderCandidates();
  return (
    <>
      <PageHeader title="Nová zakázka" lead="Stačí základní údaje. Termíny přidáte jako události v přehledu zakázky." />
      <section className={card}>
        <ActionForm action={createProjectAction} submitLabel="Založit zakázku">
          <ProjectFields leaders={leaders} defaults={{ name: "", projectType: "new_plant", projectTypeNote: null, leaderUserId: actor.globalRole === "viewer" ? "" : actor.id, clientName: null }} />
        </ActionForm>
      </section>
    </>
  );
}
