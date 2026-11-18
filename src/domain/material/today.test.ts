// „Co dnes řešit“ – třídění dodávek a návrh montážní události.
import { describe, expect, it } from "vitest";
import { computeSchedule, type ScheduleInput } from "./schedule.ts";
import { compareTodayUrgency, suggestAssemblyEvent, todayAction, todayGroupOf, todayWhen, type SuggestableEvent, type TodayGroup } from "./today.ts";

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
});

describe("karta „Co dnes řešit“ – akce a denní odpočet", () => {
  const card = (over: Partial<ScheduleInput>, today: string) => {
    const s = computeSchedule({ ...base, ...over }, today);
    const g = todayGroupOf(s)!;
    return { action: todayAction(s, g), when: todayWhen(s) };
  };
  // objednat nejpozději 28. 12. 2026
  it.each([
    ["2026-12-14", "Objednat", "Nejpozději za 14 dní"],
    ["2026-12-25", "Objednat", "Nejpozději za 3 dny"],
    ["2026-12-27", "Objednat", "Nejpozději zítra"],
    ["2026-12-28", "Objednat", "Dnes"],
    ["2026-12-29", "Ověřit objednání", "Po termínu o 1 den"],
    ["2026-12-30", "Ověřit objednání", "Po termínu o 2 dny"],
    ["2027-01-04", "Ověřit objednání", "Po termínu o 7 dní"],
  ])("dnes %s → „%s“ · „%s“", (today, action, when) => {
    expect(card({}, today)).toEqual({ action, when });
  });

  it("bez data objednání „Termín neznámý“; proběhlá montáž", () => {
    expect(card({ leadTimeDays: null, leadTimeUnit: null, leadTimeStatus: null }, "2026-11-18")).toEqual({ action: "Ověřit dodací lhůtu", when: "Termín neznámý" });
    expect(card({ event: null }, "2026-11-18")).toEqual({ action: "Doplnit termín montáže", when: "Termín neznámý" });
    expect(card({ event: { ...base.event!, plannedDate: null } }, "2026-11-18").action).toBe("Ověřit termín montáže");
    expect(card({ event: { ...base.event!, actualDate: "2027-03-02" } }, "2027-03-05")).toEqual({ action: "Ověřit objednání", when: "Montáž už proběhla" });
  });

  it("žádná akce ani časový údaj netvrdí „neobjednáno“", () => {
    for (const today of ["2026-11-18", "2026-12-20", "2027-02-01", "2027-06-01"]) {
      for (const over of [{}, { leadTimeStatus: "estimate" as const }, { leadTimeDays: null, leadTimeUnit: null, leadTimeStatus: null }, { event: null }]) {
        const s = computeSchedule({ ...base, ...over }, today);
        const g = todayGroupOf(s);
        if (g) expect(`${todayAction(s, g)} ${todayWhen(s)}`).not.toMatch(/neobjedn/i);
      }
    }
  });

  it("řazení podle naléhavosti: po termínu → do 14 dní → chybí termín → lhůta; uvnitř podle data", () => {
    const today = "2026-12-20";
    const mk = (name: string, over: Partial<ScheduleInput>) => {
      const schedule = computeSchedule({ ...base, ...over }, today);
      return { name, schedule, group: todayGroupOf(schedule) as TodayGroup };
    };
    const list = [
      mk("lhůta", { leadTimeDays: null, leadTimeUnit: null, leadTimeStatus: null }),
      mk("bez termínu", { event: null }),
      mk("do 14 dní", {}),
      mk("po termínu – starší", { leadTimeDays: 120 }),
      mk("po termínu – novější", { leadTimeDays: 60 }),
    ];
    expect(list.sort(compareTodayUrgency).map((x) => x.name)).toEqual(["po termínu – starší", "po termínu – novější", "do 14 dní", "bez termínu", "lhůta"]);
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
