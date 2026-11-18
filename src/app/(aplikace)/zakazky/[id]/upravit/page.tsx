import type { Metadata } from "next";
import { listLeaderCandidates } from "@/server/app";
import { ActionForm, SelectField, TextArea } from "@/ui/Form";
import { btnDanger, btnSecondary, card } from "@/ui/styles";
import { archiveProjectAction, unarchiveProjectAction, updateProjectAction } from "../../actions";
import { ProjectFields } from "../../ProjectFields";
import { loadProject } from "../data";

export const metadata: Metadata = { title: "Upravit zakázku" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadProject(id);
  if (!loaded) return null;
  const { project: p, can } = loaded.detail;
  const leaders = can.edit ? await listLeaderCandidates() : [];
  return (
    <div className="space-y-4">
      {can.edit ? (
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">Základní údaje</h2>
          <ActionForm action={updateProjectAction.bind(null, p.id)} submitLabel="Uložit změny">
            <input type="hidden" name="version" value={p.version} />
            <ProjectFields leaders={leaders} defaults={p} />
            <SelectField
              name="status"
              label="Stav"
              defaultValue={p.status}
              options={[
                { value: "preparation", label: "Příprava" },
                { value: "realization", label: "Realizace" },
              ]}
            />
          </ActionForm>
        </section>
      ) : (
        <section className={card}>
          <p className="text-sm text-slate-600">Základní údaje nemůžete upravit{p.status === "archived" ? " – zakázka je archivovaná" : ""}.</p>
        </section>
      )}

      {can.archive && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Archivovat zakázku</h2>
          <p className="mb-3 mt-1 text-sm text-slate-600">Zakázka zůstane dohledatelná jen pro čtení. Nic se nemaže. Vyžaduje důvod.</p>
          <ActionForm action={archiveProjectAction.bind(null, p.id)} submitLabel="Archivovat" submitClassName={btnDanger}>
            <input type="hidden" name="version" value={p.version} />
            <TextArea name="reason" label="Důvod archivace" required />
          </ActionForm>
        </section>
      )}

      {can.unarchive && (
        <section className={card}>
          <h2 className="text-lg font-semibold">Obnovit z archivu</h2>
          <ActionForm action={unarchiveProjectAction.bind(null, p.id)} submitLabel="Obnovit zakázku" submitClassName={btnSecondary}>
            <input type="hidden" name="version" value={p.version} />
            <TextArea name="reason" label="Důvod obnovení" required />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
