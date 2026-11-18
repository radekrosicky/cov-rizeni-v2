import { PROJECT_TYPE_LABELS, PROJECT_TYPES, GLOBAL_ROLE_LABELS, type GlobalRole } from "@/domain/values";
import { SelectField, TextField } from "@/ui/Form";

/** Pole zakázky – sdílená pro založení i úpravu. */
export function ProjectFields({
  leaders,
  defaults,
}: {
  leaders: { id: string; displayName: string; globalRole: GlobalRole }[];
  defaults?: { name: string; projectType: string; projectTypeNote: string | null; leaderUserId: string; clientName: string | null };
}) {
  return (
    <>
      <TextField name="name" label="Název zakázky" required defaultValue={defaults?.name} />
      <SelectField
        name="projectType"
        label="Typ"
        required
        defaultValue={defaults?.projectType ?? "new_plant"}
        options={PROJECT_TYPES.map((t) => ({ value: t, label: PROJECT_TYPE_LABELS[t] }))}
      />
      <TextField name="projectTypeNote" label="Upřesnění typu" hint="Vyplňte jen u typu „Jiná“." defaultValue={defaults?.projectTypeNote} />
      <SelectField
        name="leaderUserId"
        label="Odpovědný vedoucí"
        required
        hint="Vedoucím může být jen správce nebo zástupce. Automaticky získá přístup pro úpravy."
        defaultValue={defaults?.leaderUserId}
        options={leaders.map((l) => ({ value: l.id, label: `${l.displayName} (${GLOBAL_ROLE_LABELS[l.globalRole]})` }))}
      />
      <TextField name="clientName" label="Objednatel" hint="Nepovinné." defaultValue={defaults?.clientName} />
    </>
  );
}
