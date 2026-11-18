// Formulář termínu potřeby a dodací lhůty – nic se tiše nedosazuje ani nezahazuje.
import { describe, expect, it } from "vitest";
import { parseScheduleForm, parseWholeNumber, type ScheduleFormInput } from "./scheduleForm.ts";

const EV = "11111111-1111-4111-8111-111111111111";
const form = (over: Partial<ScheduleFormInput> = {}): ScheduleFormInput => ({
  needEventId: EV,
  needOffsetDays: "-7",
  needDateOverride: null,
  needDateOverrideReason: null,
  leadTimeState: "confirmed",
  leadTimeDays: "42",
  leadTimeUnit: "calendar",
  reserveDays: "14",
  ...over,
});

describe("parseWholeNumber", () => {
  it("přijme záporná čísla i s typografickým minus a mezerami; prázdné = null; jiné = neplatné", () => {
    expect(parseWholeNumber("-7")).toBe(-7);
    expect(parseWholeNumber("−7")).toBe(-7);
    expect(parseWholeNumber(" + 10 ")).toBe(10);
    expect(parseWholeNumber("0")).toBe(0);
    expect(parseWholeNumber("")).toBeNull();
    expect(parseWholeNumber("  ")).toBeNull();
    expect(parseWholeNumber("7,5")).toBeUndefined();
    expect(parseWholeNumber("týden")).toBeUndefined();
  });
});

describe("parseScheduleForm", () => {
  it("událost + posun + potvrzená lhůta + rezerva", () => {
    const { fields, errors } = parseScheduleForm(form());
    expect(errors).toEqual({});
    expect(fields).toEqual({ needEventId: EV, needOffsetDays: -7, needDateOverride: null, needDateOverrideReason: null, leadTimeDays: 42, leadTimeUnit: "calendar", leadTimeStatus: "confirmed", reserveDays: 14 });
  });

  it("neznámá lhůta = vše prázdné (nikdy 0); vyplněný počet dní u neznámé lhůty je chyba, ne tichá ztráta", () => {
    const ok = parseScheduleForm(form({ leadTimeState: "unknown", leadTimeDays: null }));
    expect(ok.errors).toEqual({});
    expect([ok.fields.leadTimeDays, ok.fields.leadTimeUnit, ok.fields.leadTimeStatus]).toEqual([null, null, null]);
    expect(parseScheduleForm(form({ leadTimeState: "unknown", leadTimeDays: "30" })).errors.leadTimeDays).toMatch(/neznámé lhůty/);
  });

  it("lhůta 0 dní (skladem) jen výslovně zadaná; prázdná u odhadu / potvrzené je chyba", () => {
    const zero = parseScheduleForm(form({ leadTimeDays: "0" }));
    expect(zero.errors).toEqual({});
    expect(zero.fields.leadTimeDays).toBe(0);
    expect(parseScheduleForm(form({ leadTimeDays: "" })).errors.leadTimeDays).toMatch(/0 = skladem/);
    expect(parseScheduleForm(form({ leadTimeDays: "731" })).errors.leadTimeDays).toMatch(/0 do 730/);
    expect(parseScheduleForm(form({ leadTimeDays: "-1" })).errors.leadTimeDays).toMatch(/0 do 730/);
    expect(parseScheduleForm(form({ leadTimeUnit: "tydny" })).errors.leadTimeUnit).toBeTruthy();
    expect(parseScheduleForm(form({ leadTimeState: "mozna" })).errors.leadTimeState).toBeTruthy();
  });

  it("posun −365 … +365; posun bez události je chyba", () => {
    expect(parseScheduleForm(form({ needOffsetDays: "365" })).errors).toEqual({});
    expect(parseScheduleForm(form({ needOffsetDays: "-366" })).errors.needOffsetDays).toBeTruthy();
    expect(parseScheduleForm(form({ needEventId: null, needOffsetDays: "-7" })).errors.needOffsetDays).toMatch(/jen s vybranou událostí/);
    expect(parseScheduleForm(form({ needEventId: null, needOffsetDays: "0" })).errors).toEqual({});
  });

  it("vlastní datum jen s důvodem a bez události", () => {
    const ok = parseScheduleForm(form({ needEventId: null, needOffsetDays: "0", needDateOverride: "2027-06-01", needDateOverrideReason: "Mimo montáž (fiktivní)" }));
    expect(ok.errors).toEqual({});
    expect(ok.fields.needDateOverride).toBe("2027-06-01");
    expect(parseScheduleForm(form({ needEventId: null, needOffsetDays: "0", needDateOverride: "2027-06-01" })).errors.needDateOverrideReason).toBeTruthy();
    expect(parseScheduleForm(form({ needDateOverride: "2027-06-01", needDateOverrideReason: "x" })).errors.needDateOverride).toMatch(/ne obojí/);
    expect(parseScheduleForm(form({ needEventId: null, needOffsetDays: "0", needDateOverride: "2027-02-30", needDateOverrideReason: "x" })).errors.needDateOverride).toMatch(/platné datum/);
    expect(parseScheduleForm(form({ needDateOverrideReason: "důvod bez data" })).errors.needDateOverrideReason).toBeTruthy();
  });

  it("rezerva povinná 0–365 (výchozí 14 je předvyplněná ve formuláři)", () => {
    expect(parseScheduleForm(form({ reserveDays: "0" })).fields.reserveDays).toBe(0);
    expect(parseScheduleForm(form({ reserveDays: "" })).errors.reserveDays).toMatch(/výchozí 14/);
    expect(parseScheduleForm(form({ reserveDays: "400" })).errors.reserveDays).toBeTruthy();
  });
});
