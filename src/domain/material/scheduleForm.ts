// Kontrola formuláře „Termín potřeby a dodací lhůta“ (V2-4). Čistá funkce – žádná databáze.
// Zásady: nic se tiše nedosazuje ani nezahazuje. Neznámá dodací lhůta = prázdné hodnoty, nikdy 0;
// 0 dní (skladem) jde uložit jen výslovně zadanou s jednotkou a stavem.
import { isIsoDate, type IsoDate } from "../calendar/calendar.ts";
import { LEAD_TIME_STATUSES, LEAD_TIME_UNITS, type LeadTimeStatus, type LeadTimeUnit } from "../values.ts";

/** Hodnoty z formuláře (texty, jak je uživatel zadal). */
export interface ScheduleFormInput {
  needEventId: string | null;
  needOffsetDays: string | null;
  needDateOverride: string | null;
  needDateOverrideReason: string | null;
  /** „unknown“ | „estimate“ | „confirmed“ */
  leadTimeState: string | null;
  leadTimeDays: string | null;
  leadTimeUnit: string | null;
  reserveDays: string | null;
}

/** Hodnoty připravené k uložení (odpovídají sloupcům material_needs). */
export interface ScheduleFields {
  needEventId: string | null;
  needOffsetDays: number;
  needDateOverride: IsoDate | null;
  needDateOverrideReason: string | null;
  leadTimeDays: number | null;
  leadTimeUnit: LeadTimeUnit | null;
  leadTimeStatus: LeadTimeStatus | null;
  reserveDays: number;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

/** Celé číslo z formuláře; dovolí mezery, „+“ a typografické minus. Neplatné = undefined. */
export function parseWholeNumber(raw: string | null | undefined): number | null | undefined {
  if (blank(raw)) return null;
  const t = raw!.replace(/\s+/g, "").replace(/[−–]/g, "-");
  if (!/^[+-]?\d{1,4}$/.test(t)) return undefined;
  return Number(t);
}

export function parseScheduleForm(input: ScheduleFormInput): { fields: ScheduleFields; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const eventId = blank(input.needEventId) ? null : input.needEventId!.trim();
  const override = blank(input.needDateOverride) ? null : input.needDateOverride!.trim();
  const reason = blank(input.needDateOverrideReason) ? null : input.needDateOverrideReason!.replace(/\s+/g, " ").trim().slice(0, 500);

  // 1) Termín potřeby: událost + posun, NEBO vlastní datum s důvodem, nebo zatím nic.
  const offset = parseWholeNumber(input.needOffsetDays);
  let offsetDays = 0;
  if (offset === undefined || (offset !== null && (offset < -365 || offset > 365))) {
    errors.needOffsetDays = "Zadejte celé číslo dní od −365 do 365 (záporné = před událostí).";
  } else if (offset !== null) {
    offsetDays = offset;
  }
  if (eventId && override) {
    errors.needDateOverride = "Zvolte buď událost, nebo vlastní datum – ne obojí.";
  }
  if (!eventId && offsetDays !== 0 && !errors.needOffsetDays) {
    errors.needOffsetDays = "Posun platí jen s vybranou událostí. Vyberte událost, nebo nastavte posun 0.";
  }
  if (override && !isIsoDate(override)) errors.needDateOverride = "Zadejte platné datum.";
  if (override && !reason) errors.needDateOverrideReason = "U vlastního data uveďte důvod (proč se neřídí událostí).";
  if (!override && reason) errors.needDateOverrideReason = "Důvod patří jen k vlastnímu datu – doplňte datum, nebo důvod smažte.";

  // 2) Dodací lhůta: neznámá / odhad / potvrzená.
  const state = input.leadTimeState ?? "unknown";
  let leadTimeDays: number | null = null;
  let leadTimeUnit: LeadTimeUnit | null = null;
  let leadTimeStatus: LeadTimeStatus | null = null;
  if (state === "unknown") {
    if (!blank(input.leadTimeDays)) {
      errors.leadTimeDays = "U neznámé lhůty nechte počet dní prázdný – nebo zvolte „Odhad“ či „Potvrzená“.";
    }
  } else if ((LEAD_TIME_STATUSES as readonly string[]).includes(state)) {
    leadTimeStatus = state as LeadTimeStatus;
    const d = parseWholeNumber(input.leadTimeDays);
    if (d === null) errors.leadTimeDays = "Zadejte dodací lhůtu ve dnech (0 = skladem, k dispozici ihned).";
    else if (d === undefined || d < 0 || d > 730) errors.leadTimeDays = "Zadejte celé číslo dní od 0 do 730.";
    else leadTimeDays = d;
    if (!(LEAD_TIME_UNITS as readonly string[]).includes(input.leadTimeUnit ?? "")) errors.leadTimeUnit = "Vyberte kalendářní, nebo pracovní dny.";
    else leadTimeUnit = input.leadTimeUnit as LeadTimeUnit;
  } else {
    errors.leadTimeState = "Vyberte stav dodací lhůty.";
  }

  // 3) Bezpečnostní rezerva (kalendářní dny, povinná – výchozí hodnota je ve formuláři předvyplněná).
  const r = parseWholeNumber(input.reserveDays);
  let reserveDays = 14;
  if (r === null) errors.reserveDays = "Zadejte rezervu v kalendářních dnech (výchozí 14; 0 = bez rezervy).";
  else if (r === undefined || r < 0 || r > 365) errors.reserveDays = "Zadejte celé číslo dní od 0 do 365.";
  else reserveDays = r;

  return {
    fields: {
      needEventId: eventId,
      needOffsetDays: offsetDays,
      needDateOverride: override,
      needDateOverrideReason: override ? reason : null,
      leadTimeDays,
      leadTimeUnit,
      leadTimeStatus,
      reserveDays,
    },
    errors,
  };
}
