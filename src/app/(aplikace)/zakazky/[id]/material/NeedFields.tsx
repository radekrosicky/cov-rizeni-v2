import { TRACKING_REASON_LABELS, TRACKING_REASONS } from "@/domain/values";
import { SelectField, TextArea, TextField } from "@/ui/Form";

/** Pole sledované dodávky – sdílená pro vytvoření i úpravu. Krátký formulář: povinné jen název a důvod. */
export function NeedFields({
  defaults,
  responsibleOptions,
  hideQuantity,
  hideName,
}: {
  defaults?: Partial<Record<"name" | "trackingReason" | "trackingReasonNote" | "plannedQuantity" | "unit" | "responsibleUserId" | "note", string | null>>;
  responsibleOptions: { id: string; displayName: string }[];
  hideQuantity?: boolean;
  /** „Každou zvlášť“ – název se převezme z každé položky. */
  hideName?: boolean;
}) {
  return (
    <>
      {!hideName && <TextField name="name" label="Název dodávky" required defaultValue={defaults?.name} />}
      <SelectField
        name="trackingReason"
        label="Proč ji sledujeme"
        required
        defaultValue={defaults?.trackingReason ?? "critical_technology"}
        options={TRACKING_REASONS.map((r) => ({ value: r, label: TRACKING_REASON_LABELS[r] }))}
        hint="Cena není důvodem – i levná součást může zastavit montáž."
      />
      <TextField name="trackingReasonNote" label="Vlastní důvod / upřesnění" defaultValue={defaults?.trackingReasonNote} hint="Povinné u „Jiný důvod“." />
      {!hideQuantity && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="plannedQuantity" label="Množství plánované k zajištění" defaultValue={defaults?.plannedQuantity} hint="Nepovinné. Množství z rozpočtu se nemění." />
          <TextField name="unit" label="Jednotka" defaultValue={defaults?.unit} />
        </div>
      )}
      <SelectField
        name="responsibleUserId"
        label="Odpovědný"
        defaultValue={defaults?.responsibleUserId ?? ""}
        options={[{ value: "", label: "Nepřiřazeno" }, ...responsibleOptions.map((o) => ({ value: o.id, label: o.displayName }))]}
        hint="Ve V2-3 nepovinné; před objednáním (V2-4) bude nutné."
      />
      <TextArea name="note" label="Poznámka" defaultValue={defaults?.note} />
    </>
  );
}
