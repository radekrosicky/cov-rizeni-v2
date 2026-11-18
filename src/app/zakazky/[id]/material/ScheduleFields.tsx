// Pole formuláře „Termín potřeby a dodací lhůta“ (V2-4). Kontrolu dělá server (domain/material/scheduleForm).
import { formatDateCz } from "@/domain/calendar/calendar";
import { SelectField, TextField } from "@/ui/Form";

export interface ScheduleEventOption {
  id: string;
  title: string;
  status: "active" | "cancelled";
  contractDate: string | null;
  plannedDate: string | null;
  actualDate: string | null;
}

const eventLabel = (e: ScheduleEventOption, suggestedId: string | null) => {
  const when = e.actualDate
    ? `proběhlo ${formatDateCz(e.actualDate)}`
    : e.plannedDate
      ? `plán ${formatDateCz(e.plannedDate)}`
      : e.contractDate
        ? `jen smluvně ${formatDateCz(e.contractDate)}`
        : "bez termínu";
  return `${e.title} – ${when}${e.status === "cancelled" ? " (ZRUŠENA)" : ""}${e.id === suggestedId ? " ← navrženo" : ""}`;
};

export function ScheduleFields({
  defaults,
  events,
  suggested,
}: {
  defaults: {
    needEventId: string | null;
    needOffsetDays: number;
    needDateOverride: string | null;
    needDateOverrideReason: string | null;
    leadTimeDays: number | null;
    leadTimeUnit: string | null;
    leadTimeStatus: string | null;
    reserveDays: number;
  };
  events: ScheduleEventOption[];
  suggested: ScheduleEventOption | null;
}) {
  const d = defaults;
  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">1. Kdy materiál na stavbě potřebujeme</legend>
        {suggested && (
          <p role="note" className="rounded-md bg-signal-unverified-bg px-3 py-2 text-sm text-signal-unverified">
            Návrh: „{suggested.title}“{suggested.plannedDate ? ` (plán ${formatDateCz(suggested.plannedDate)})` : ""}. Na ČOV může být více etap či linek – vyberte
            událost sami a uložte. Bez vašeho potvrzení se nic nepřiřadí.
          </p>
        )}
        <SelectField
          name="needEventId"
          label="Montážní událost / milník"
          defaultValue={d.needEventId ?? ""}
          options={[{ value: "", label: "— zatím neurčeno —" }, ...events.map((e) => ({ value: e.id, label: eventLabel(e, suggested?.id ?? null) }))]}
          hint="Datum se bere z události (plánované; když chybí, smluvní – pak je výpočet předběžný)."
        />
        <TextField
          name="needOffsetDays"
          label="Posun vůči události (kalendářní dny)"
          defaultValue={String(d.needOffsetDays)}
          hint="Záporné číslo = před událostí (např. −7 = týden před zahájením montáže), kladné = po ní, 0 = v den události."
        />
        <details className="rounded-md border border-slate-200 px-3 py-2" open={!!d.needDateOverride}>
          <summary className="cursor-pointer text-sm font-medium text-slate-800">Výjimečně: vlastní datum potřeby (bez události)</summary>
          <div className="mt-3 space-y-3">
            <TextField name="needDateOverride" type="date" label="Vlastní datum potřeby" defaultValue={d.needDateOverride} hint="Jen když se dodávka neřídí žádnou událostí. Událost pak nechte „zatím neurčeno“." />
            <TextField name="needDateOverrideReason" label="Důvod vlastního data" defaultValue={d.needDateOverrideReason} />
          </div>
        </details>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">2. Dodací lhůta</legend>
        <SelectField
          name="leadTimeState"
          label="Stav dodací lhůty"
          defaultValue={d.leadTimeStatus ?? "unknown"}
          options={[
            { value: "unknown", label: "Neznámá – zeptat se dodavatele" },
            { value: "estimate", label: "Odhad – ověřit u dodavatele" },
            { value: "confirmed", label: "Potvrzená dodavatelem" },
          ]}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="leadTimeDays" label="Dodací lhůta (dny)" defaultValue={d.leadTimeDays === null ? "" : String(d.leadTimeDays)} hint="0 = skladem, k dispozici ihned. U neznámé lhůty nechte prázdné." />
          <SelectField
            name="leadTimeUnit"
            label="Počítat ve dnech"
            defaultValue={d.leadTimeUnit ?? "calendar"}
            options={[
              { value: "calendar", label: "kalendářních" },
              { value: "working", label: "pracovních (bez víkendů a svátků)" },
            ]}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">3. Bezpečnostní rezerva</legend>
        <TextField name="reserveDays" label="Rezerva před potřebou (kalendářní dny)" defaultValue={String(d.reserveDays)} hint="Výchozí 14 dní. O kolik dřív má materiál dorazit, než ho na stavbě potřebujeme." />
      </fieldset>
    </div>
  );
}
