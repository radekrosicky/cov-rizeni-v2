// „Co dnes řešit“ – třídění dodávek a návrh montážní události.
import { describe, expect, it } from "vitest";
import { computeSchedule, type ScheduleInput } from "./schedule.ts";
import { suggestAssemblyEvent, TODAY_GROUP_INFO, todayGroupOf, type SuggestableEvent } from "./today.ts";

const base: ScheduleInput = {
  event: { name: "Montáž linka 1", status: "active", contractDate: "2027-03-31", plannedDate: "2027-03-01", actualDate: null },
  offsetDays: -7,
  dateOverride: null,
  dateOverrideReason: null,
  leadTimeDays: 42,
  leadTimeUnit: "calendar",
  leadTimeStatus: "confirmed",
  reserveDays: 14,
  responsibleAssigned: true,
  archived: false,
};
const group = (over: Partial<ScheduleInput>, today = "2026-11-18") => todayGroupOf(computeSchedule({ ...base, ...over }, today));

describe("todayGroupOf", () => {
  it("po termínu a proběhlá událost → „Ověřte stav objednávky“", () => {
    expect(group({}, "2027-01-04")).toBe("verify_order");
    expect(group({ event: { ...base.event!, actualDate: "2027-03-02" } }, "2027-03-05")).toBe("verify_order");
  });
  it("do 14 dní → „Objednat do 14 dní“; dál a vše ověřené → nic", () => {
    expect(group({}, "2026-12-20")).toBe("order_soon");
    expect(group({}, "2026-11-18")).toBeNull();
  });
  it("chybějící / neověřený termín montáže", () => {
    expect(group({ event: null })).toBe("missing_date");
    expect(group({ event: { ...base.event!, plannedDate: null, contractDate: null } })).toBe("missing_date");
    expect(group({ event: { ...base.event!, status: "cancelled" } })).toBe("missing_date");
    expect(group({ event: { ...base.event!, plannedDate: null } })).toBe("missing_date"); // jen smluvní
  });
  it("neznámá nebo odhadnutá dodací lhůta", () => {
    expect(group({ leadTimeDays: null, leadTimeUnit: null, leadTimeStatus: null })).toBe("lead_time");
    expect(group({ leadTimeStatus: "estimate" })).toBe("lead_time");
    // odhad, ale už po termínu → naléhavější skupina
    expect(group({ leadTimeStatus: "estimate" }, "2027-01-04")).toBe("verify_order");
  });
  it("archivovaná dodávka se v přehledu neobjeví", () => {
    expect(group({ archived: true }, "2027-01-04")).toBeNull();
  });
  it("texty skupin netvrdí „neobjednáno“", () => {
    for (const g of Object.values(TODAY_GROUP_INFO)) expect(`${g.title} ${g.why}`).not.toMatch(/neobjedn/i);
    expect(TODAY_GROUP_INFO.verify_order.title).toBe("Ověřte stav objednávky");
  });
});

describe("suggestAssemblyEvent – jen návrh", () => {
  const e = (id: string, over: Partial<SuggestableEvent> = {}): SuggestableEvent => ({ id, kind: "assembly_start", title: `Montáž ${id}`, status: "active", contractDate: null, plannedDate: null, actualDate: null, ...over });
  it("nejbližší budoucí neproběhlá montáž; ignoruje zrušené, proběhlé a jiné typy", () => {
    const list = [
      e("old", { plannedDate: "2026-01-10", actualDate: "2026-01-12" }),
      e("l2", { plannedDate: "2027-05-10" }),
      e("l1", { plannedDate: "2027-03-01" }),
      e("x", { plannedDate: "2026-12-01", status: "cancelled" }),
      e("trial", { kind: "trial_operation", plannedDate: "2026-12-05" }),
    ];
    expect(suggestAssemblyEvent(list, "2026-11-18")?.id).toBe("l1");
  });
  it("smluvní datum se počítá, když plán chybí; bez kandidátů null", () => {
    expect(suggestAssemblyEvent([e("a", { contractDate: "2027-04-01" }), e("b")], "2026-11-18")?.id).toBe("a");
    expect(suggestAssemblyEvent([e("t", { kind: "other", plannedDate: "2027-01-01" })], "2026-11-18")).toBeNull();
  });
});
