import type { Metadata } from "next";
import { assignableAccess } from "@/domain/access/permissions";
import { GLOBAL_ROLE_LABELS, MEMBER_ACCESS_LABELS } from "@/domain/values";
import { listMemberCandidates } from "@/server/app";
import { ActionForm, SelectField } from "@/ui/Form";
import { SavedNotice } from "@/ui/Notices";
import { btnDanger, btnSecondary, card } from "@/ui/styles";
import { addMemberAction, changeMemberAccessAction, removeMemberAction } from "../../actions";
import { loadProject } from "../data";

export const metadata: Metadata = { title: "Přístup k zakázce" };

export default async function MembersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ulozeno?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const loaded = await loadProject(id);
  if (!loaded) return null;
  const d = loaded.detail;
  const manage = d.can.manageMembers;
  const candidates = manage ? await listMemberCandidates(loaded.actor, id) : [];
  return (
    <div className="space-y-4">
      <SavedNotice show={!!sp.ulozeno} />
      <section className={card}>
        <h2 className="text-lg font-semibold">Kdo má přístup</h2>
        {!manage && <p className="mt-1 text-sm text-slate-600">Přístupy přiděluje jen správce.</p>}
        <ul className="mt-3 divide-y divide-slate-100">
          {d.members.map((m) => {
            const isLeader = m.userId === d.project.leaderUserId;
            return (
              <li key={m.userId} className="py-3">
                <div className="font-medium">
                  {m.displayName} {isLeader && <span className="text-xs font-semibold text-accent-dark">· vedoucí</span>}
                </div>
                <div className="text-sm text-slate-500">
                  {GLOBAL_ROLE_LABELS[m.globalRole]} · {MEMBER_ACCESS_LABELS[m.access]}
                </div>
                {manage && !isLeader && (
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    {assignableAccess(m.globalRole).length > 1 && (
                      <ActionForm action={changeMemberAccessAction.bind(null, id, m.userId)} submitLabel="Změnit přístup" submitClassName={btnSecondary}>
                        <SelectField
                          name="access"
                          label="Přístup"
                          defaultValue={m.access}
                          options={assignableAccess(m.globalRole).map((a) => ({ value: a, label: MEMBER_ACCESS_LABELS[a] }))}
                        />
                      </ActionForm>
                    )}
                    <ActionForm action={removeMemberAction.bind(null, id, m.userId)} submitLabel="Odebrat přístup" submitClassName={btnDanger}>
                      <span />
                    </ActionForm>
                  </div>
                )}
                {manage && isLeader && <p className="mt-1 text-xs text-slate-500">Vedoucí má vždy přístup pro úpravy. Pro změnu nejprve změňte vedoucího.</p>}
              </li>
            );
          })}
        </ul>
      </section>
      {manage && candidates.length > 0 && (
        <section className={card}>
          <h2 className="mb-3 text-lg font-semibold">Přidat přístup</h2>
          <ActionForm action={addMemberAction.bind(null, id)} submitLabel="Přidat">
            <SelectField
              name="userId"
              label="Uživatel"
              options={candidates.map((c) => ({ value: c.id, label: `${c.displayName} (${GLOBAL_ROLE_LABELS[c.globalRole]})` }))}
            />
            <SelectField
              name="access"
              label="Přístup"
              defaultValue="read"
              hint="Sledujícímu lze přidělit jen čtení."
              options={[
                { value: "read", label: MEMBER_ACCESS_LABELS.read },
                { value: "edit", label: MEMBER_ACCESS_LABELS.edit },
              ]}
            />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
