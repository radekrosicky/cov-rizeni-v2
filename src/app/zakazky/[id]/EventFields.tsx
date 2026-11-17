import { EVENT_KIND_LABELS, EVENT_KINDS } from "@/domain/values";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/Form";

type Defaults = {
  kind: string;
  title: string;
  isMilestone: boolean;
  contractDate: string | null;
  plannedDate: string | null;
  actualDate: string | null;
  note: string | null;
};

/** Pole události. Všechny termíny jsou nepovinné – neznámý termín se nevymýšlí. */
export function EventFields({ defaults }: { defaults?: Defaults }) {
  return (
    <>
      <SelectField
        name="kind"
        label="Typ události"
        required
        defaultValue={defaults?.kind ?? "assembly_start"}
        options={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABELS[k] }))}
        hint="Výchozí nabídka. Více událostí stejného typu je v pořádku (např. linka 1 a linka 2)."
      />
      <TextField name="title" label="Vlastní název" defaultValue={defaults?.title} hint="Např. „Zahájení montáže technologie – linka 2“. Prázdné = název typu." />
      <CheckboxField name="isMilestone" label="Milník (významná událost)" defaultChecked={defaults?.isMilestone} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="contractDate" type="date" label="Smluvní termín" defaultValue={defaults?.contractDate} hint="Nepovinné." />
        <TextField name="plannedDate" type="date" label="Plán" defaultValue={defaults?.plannedDate} hint="Nepovinné." />
        <TextField name="actualDate" type="date" label="Skutečně nastalo" defaultValue={defaults?.actualDate} hint="Jen pokud už nastalo." />
      </div>
      <TextArea name="note" label="Poznámka" defaultValue={defaults?.note} />
    </>
  );
}
