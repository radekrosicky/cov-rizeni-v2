// Výpočet termínu potřeby a doporučeného objednání – termíny, české svátky, víkendy a neznámé údaje.
// Všechna data jsou fiktivní; „dnes“ je v testech vždy pevně zadané.
import { describe, expect, it } from "vitest";
import { computeSchedule, dayCount, previousWorkingDay, type ScheduleEvent, type ScheduleInput } from "./schedule.ts";

const assembly = (over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  name: "Zahájení montáže technologie – linka 1",
  status: "active",
  contractDate: "2027-03-31",
  plannedDate: "2027-03-01",
  actualDate: null,
  ...over,
});

const need = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  event: assembly(),
  offsetDays: -7,
  dateOverride: null,
  dateOverrideReason: null,
  leadTimeDays: 42,
  leadTimeUnit: "calendar",
  leadTimeStatus: "confirmed",
  reserveDays: 14,
  responsibleAssigned: true,
  archived: false,
  ...over,
});

const TODAY = "2026-11-18";
const codes = (s: ReturnType<typeof computeSchedule>) => s.warnings.map((w) => w.code);

describe("základní výpočet (ověřené příklady z plánu V2-4)", () => {
  it("plán 1. 3. 2027, posun −7, rezerva 14, lhůta 42 kalendářních → objednat do 28. 12. 2026", () => {
    const s = computeSchedule(need(), TODAY);
    expect([s.basis, s.needDate, s.deliverBy, s.orderBy]).toEqual(["planned", "2027-02-22", "2027-02-08", "2026-12-28"]);
    expect(s.preliminary).toBe(false);
    expect(s.state).toBe("order_planned");
    expect(s.daysToOrder).toBe(40);
    expect(s.warnings).toEqual([]);
    expect(s.steps.join(" ")).toMatch(/1\. 3\. 2027.*7 dní před.*22\. 2\. 2027.*14 kalendářních dní.*8\. 2\. 2027.*42 kalendářních dní.*28\. 12\. 2026/);
  });

  it("30 pracovních dní přes Vánoce a Nový rok → 23. 12. 2026 (24.–26. 12. a 1. 1. se nepočítají)", () => {
    const s = computeSchedule(need({ leadTimeDays: 30, leadTimeUnit: "working" }), TODAY);
    expect(s.orderBy).toBe("2026-12-23");
    expect(codes(s)).not.toContain("order_date_shifted");
  });

  it("kladný posun: materiál až 10 dní po zahájení montáže", () => {
    const s = computeSchedule(need({ offsetDays: 10 }), TODAY);
    expect(s.needDate).toBe("2027-03-11");
    expect(s.steps.join(" ")).toMatch(/10 dní po událostí/);
  });

  it("nulový posun = den události; rezerva 0 = dodat v den potřeby", () => {
    const s = computeSchedule(need({ offsetDays: 0, reserveDays: 0 }), TODAY);
    expect([s.needDate, s.deliverBy]).toEqual(["2027-03-01", "2027-03-01"]);
    expect(s.steps.join(" ")).toMatch(/v den události/);
  });

  it("rezerva je vlastní údaj dodávky: 21 dní posune „dodat“ i „objednat“", () => {
    const s = computeSchedule(need({ reserveDays: 21 }), TODAY);
    expect(s.deliverBy).toBe("2027-02-01");
    expect(s.orderBy).toBe("2026-12-21");
  });
});

describe("víkendy a české svátky – objednání se posune na PŘEDCHOZÍ pracovní den", () => {
  // Pomůcka: vlastní datum potřeby tak, aby „dodat nejpozději“ = deliverBy (rezerva 0).
  const fromDeliverBy = (deliverBy: string, lead: number, unit: "calendar" | "working" = "calendar") =>
    computeSchedule(need({ event: null, offsetDays: 0, dateOverride: deliverBy, dateOverrideReason: "Fiktivní test", reserveDays: 0, leadTimeDays: lead, leadTimeUnit: unit }), "2026-01-02");

  it.each([
    ["Velikonoční pondělí 29. 3. 2027 (a Velký pátek 26. 3.) → 25. 3. 2027", "2027-04-12", 14, "2027-03-25", /Velikonoční pondělí/],
    ["Štědrý den 24. 12. 2026 → 23. 12. 2026", "2027-01-07", 14, "2026-12-23", /Štědrý den/],
    ["Nový rok 1. 1. 2027 → 31. 12. 2026", "2027-01-15", 14, "2026-12-31", /Nový rok|obnovy/],
    ["Svátek práce 1. 5. 2026 (pátek) → 30. 4. 2026", "2026-05-15", 14, "2026-04-30", /práce/],
    ["Den vítězství 8. 5. 2026 (pátek) → 7. 5. 2026", "2026-05-22", 14, "2026-05-07", /vítězství/],
    ["Hus 6. 7. 2027 (úterý) + Cyril a Metoděj 5. 7. + víkend → 2. 7. 2027", "2027-07-20", 14, "2027-07-02", /Husa/],
    ["Den české státnosti 28. 9. 2026 (pondělí) → 25. 9. 2026", "2026-10-12", 14, "2026-09-25", /státnosti/],
    ["28. 10. 2026 (středa) → 27. 10. 2026", "2026-11-11", 14, "2026-10-27", /samostatného/],
    ["17. 11. 2026 (úterý) → 16. 11. 2026", "2026-12-01", 14, "2026-11-16", /svobodu/],
    ["sobota 13. 2. 2027 → pátek 12. 2. 2027", "2027-02-20", 7, "2027-02-12", /sobota/],
    ["neděle 14. 2. 2027 → pátek 12. 2. 2027", "2027-02-21", 7, "2027-02-12", /neděle/],
  ])("%s", (_label, deliverBy, lead, expected, reason) => {
    const s = fromDeliverBy(deliverBy, lead);
    expect(s.orderBy).toBe(expected);
    const w = s.warnings.find((x) => x.code === "order_date_shifted");
    expect(w?.text).toMatch(reason);
    expect(w?.text).toMatch(/předchozí pracovní den/);
  });

  it("pracovní den se neposouvá a nemá upozornění", () => {
    const s = fromDeliverBy("2027-02-22", 7); // 15. 2. 2027 je pondělí
    expect(s.orderBy).toBe("2027-02-15");
    expect(codes(s)).not.toContain("order_date_shifted");
  });

  it("pracovní dny přes Velikonoce 2027: 5 pracovních dní před 30. 3. → 19. 3. (26. 3. a 29. 3. ani víkend se nepočítají)", () => {
    expect(fromDeliverBy("2027-03-30", 5, "working").orderBy).toBe("2027-03-19");
  });

  it("previousWorkingDay: celé období 24.–27. 12. 2026 → 23. 12. 2026", () => {
    for (const d of ["2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27"]) expect(previousWorkingDay(d)).toBe("2026-12-23");
    expect(previousWorkingDay("2026-12-23")).toBe("2026-12-23");
  });
});

describe("výběr termínu události", () => {
  it("chybí plánované → smluvní, výpočet PŘEDBĚŽNÝ s upozorněním „plánovaný termín není ověřen“", () => {
    const s = computeSchedule(need({ event: assembly({ plannedDate: null }) }), TODAY);
    expect(s.basis).toBe("contract");
    expect(s.needDate).toBe("2027-03-24");
    expect(s.preliminary).toBe(true);
    expect(s.warnings.find((w) => w.code === "preliminary_contract_date")?.text).toMatch(/PŘEDBĚŽNÝ.*plánovaný termín .* není ověřen/);
  });

  it("plánovaný pozdější než smluvní → počítá z plánovaného a upozorní na rozpor", () => {
    const s = computeSchedule(need({ event: assembly({ plannedDate: "2027-04-15", contractDate: "2027-03-31" }) }), TODAY);
    expect(s.basis).toBe("planned");
    expect(s.needDate).toBe("2027-04-08");
    expect(s.warnings.find((w) => w.code === "planned_after_contract")?.text).toMatch(/15\. 4\. 2027.*pozdější než smluvní.*31\. 3\. 2027/);
  });

  it("plánovaný dřívější nebo stejný jako smluvní → bez upozornění na rozpor", () => {
    expect(codes(computeSchedule(need(), TODAY))).not.toContain("planned_after_contract");
    expect(codes(computeSchedule(need({ event: assembly({ plannedDate: "2027-03-31" }) }), TODAY))).not.toContain("planned_after_contract");
  });

  it("skutečné datum = historický fakt: nový termín objednání se nepočítá", () => {
    const s = computeSchedule(need({ event: assembly({ actualDate: "2027-03-02" }) }), "2027-03-10");
    expect(s.state).toBe("event_happened");
    expect([s.basis, s.basisDate, s.needDate, s.orderBy]).toEqual(["actual", "2027-03-02", null, null]);
    expect(s.headline).toMatch(/proběhla 2\. 3\. 2027.*ověřte stav/);
    expect(s.headline).not.toMatch(/neobjedn/i);
  });

  it("posun montáže v události přepočte doporučení (nic se neukládá)", () => {
    const before = computeSchedule(need(), TODAY);
    const after = computeSchedule(need({ event: assembly({ plannedDate: "2027-03-15" }) }), TODAY);
    expect(after.orderBy).toBe("2027-01-11");
    expect(before.orderBy).toBe("2026-12-28");
  });

  it("vlastní datum potřeby (výjimka s důvodem) – bez události", () => {
    const s = computeSchedule(need({ event: null, offsetDays: 0, dateOverride: "2027-06-01", dateOverrideReason: "Dodávka mimo montáž (fiktivní)" }), TODAY);
    expect([s.basis, s.needDate, s.deliverBy]).toEqual(["override", "2027-06-01", "2027-05-18"]);
    expect(s.warnings.find((w) => w.code === "need_date_override")?.text).toMatch(/Dodávka mimo montáž/);
  });
});

describe("neznámé a chybějící údaje – nic se nevymýšlí", () => {
  it("neznámá dodací lhůta → žádné datum objednání, ale „dodat nejpozději“ ano", () => {
    const s = computeSchedule(need({ leadTimeDays: null, leadTimeUnit: null, leadTimeStatus: null }), TODAY);
    expect(s.state).toBe("lead_time_unknown");
    expect(s.orderBy).toBeNull();
    expect(s.daysToOrder).toBeNull();
    expect(s.deliverBy).toBe("2027-02-08");
    expect(s.headline).toMatch(/Ověřit dodací lhůtu/);
  });

  it("odhad dodací lhůty → orientační datum s výrazným „Dodací lhůtu ověřit“", () => {
    const s = computeSchedule(need({ leadTimeStatus: "estimate" }), TODAY);
    expect(s.orderBy).toBe("2026-12-28");
    expect(s.preliminary).toBe(true);
    expect(s.warnings.find((w) => w.code === "lead_time_estimate")?.text).toMatch(/^Dodací lhůtu ověřit/);
  });

  it("událost bez plánovaného i smluvního data → „chybí termín“, žádná data", () => {
    const s = computeSchedule(need({ event: assembly({ plannedDate: null, contractDate: null }) }), TODAY);
    expect(s.state).toBe("event_without_date");
    expect([s.needDate, s.deliverBy, s.orderBy]).toEqual([null, null, null]);
    expect(s.headline).toMatch(/Chybí termín/);
  });

  it("bez události i vlastního data → „Určete, kdy materiál potřebujete“", () => {
    const s = computeSchedule(need({ event: null }), TODAY);
    expect(s.state).toBe("no_need_date");
    expect(s.orderBy).toBeNull();
  });

  it("zrušená událost → žádný výpočet, výzva vybrat jinou", () => {
    const s = computeSchedule(need({ event: assembly({ status: "cancelled" }) }), TODAY);
    expect(s.state).toBe("event_cancelled");
    expect(s.orderBy).toBeNull();
  });

  it("chybí odpovědný → upozornění, výpočet tím neblokuje", () => {
    const s = computeSchedule(need({ responsibleAssigned: false }), TODAY);
    expect(s.orderBy).toBe("2026-12-28");
    expect(codes(s)).toContain("responsible_missing");
  });

  it("archivovaná dodávka se nepočítá", () => {
    expect(computeSchedule(need({ archived: true }), TODAY).state).toBe("archived");
  });
});

describe("stav vůči dnešku – „blíží se“ je hranice před objednáním, ne rezerva", () => {
  // objednat nejpozději 28. 12. 2026
  it.each([
    ["2026-12-13", "order_planned", 15],
    ["2026-12-14", "order_soon", 14],
    ["2026-12-28", "order_soon", 0],
    ["2026-12-29", "order_overdue", -1],
  ])("dnes %s → %s (%i dní)", (today, state, d) => {
    const s = computeSchedule(need(), today);
    expect(s.state).toBe(state);
    expect(s.daysToOrder).toBe(d);
  });

  it("po termínu netvrdí, že nebylo objednáno – vyzve k ověření", () => {
    const s = computeSchedule(need(), "2027-01-05");
    expect(s.headline).toMatch(/uplynul – ověřte, zda je objednáno/);
    expect(s.headline).not.toMatch(/neobjedn/i);
  });

  it("dnes je poslední den → „Doporučeno objednat dnes“", () => {
    expect(computeSchedule(need(), "2026-12-28").headline).toMatch(/objednat dnes/);
  });

  it("hranici „blíží se“ lze změnit nezávisle na rezervě", () => {
    expect(computeSchedule(need(), "2026-12-13", { soonDays: 30 }).state).toBe("order_soon");
    expect(computeSchedule(need({ reserveDays: 30 }), "2026-11-18").deliverBy).toBe("2027-01-23");
  });
});

describe("české tvary", () => {
  it("dayCount", () => {
    expect(dayCount(1, "calendar")).toBe("1 kalendářní den");
    expect(dayCount(3, "working")).toBe("3 pracovní dny");
    expect(dayCount(14, "calendar")).toBe("14 kalendářních dní");
    expect(dayCount(0, "calendar")).toBe("0 kalendářních dní");
  });
});
