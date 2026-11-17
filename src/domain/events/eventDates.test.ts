import { describe, expect, it } from "vitest";
import { eventDateView, validateEventDateChange, type EventDates } from "./eventDates.ts";

const d = (contractDate: string | null, plannedDate: string | null, actualDate: string | null): EventDates => ({
  contractDate,
  plannedDate,
  actualDate,
});
const TODAY = "2026-11-17";

describe("eventDateView – vždy s původem data", () => {
  it("bez termínů = čeká na ověření, nic se nevymýšlí", () => {
    expect(eventDateView(d(null, null, null))).toEqual({ date: null, basis: "unknown", label: "Termín čeká na ověření" });
  });
  it("plán se nikdy nevydává za nastalé", () => {
    const v = eventDateView(d("2027-04-30", "2027-03-01", null));
    expect(v.basis).toBe("planned");
    expect(v.label).toBe("Plán 1. 3. 2027 (zatím nenastalo)");
  });
  it("jen smluvní termín", () => {
    expect(eventDateView(d("2027-04-30", null, null)).label).toBe("Smluvně do 30. 4. 2027");
  });
  it("skutečné datum má přednost", () => {
    expect(eventDateView(d("2027-04-30", "2027-03-01", "2027-03-03")).basis).toBe("actual");
  });
});

describe("validateEventDateChange", () => {
  it("všechny termíny smí zůstat prázdné", () => {
    expect(validateEventDateChange({ before: d(null, null, null), after: d(null, null, null), today: TODAY, reason: null })).toEqual([]);
  });
  it("odmítne neplatné datum", () => {
    const issues = validateEventDateChange({ before: d(null, null, null), after: d("2027-02-30", null, null), today: TODAY, reason: null });
    expect(issues).toEqual([{ field: "contractDate", code: "invalid_date" }]);
  });
  it("skutečné datum nesmí být v budoucnosti", () => {
    const issues = validateEventDateChange({ before: d(null, null, null), after: d(null, null, "2026-11-18"), today: TODAY, reason: null });
    expect(issues).toEqual([{ field: "actualDate", code: "actual_in_future" }]);
  });
  it("první zápis smluvního i skutečného data nevyžaduje důvod", () => {
    expect(validateEventDateChange({ before: d(null, null, null), after: d("2027-01-10", null, "2026-11-17"), today: TODAY, reason: null })).toEqual([]);
  });
  it("změna smluvního termínu a oprava skutečného data vyžadují důvod", () => {
    const before = d("2027-01-10", "2027-01-05", "2026-11-10");
    const after = d("2027-01-20", "2027-01-05", "2026-11-11");
    expect(validateEventDateChange({ before, after, today: TODAY, reason: "  " })).toEqual([
      { field: "contractDate", code: "reason_required" },
      { field: "actualDate", code: "reason_required" },
    ]);
    expect(validateEventDateChange({ before, after, today: TODAY, reason: "Dodatek č. 1 (fiktivní)" })).toEqual([]);
  });
  it("změna plánu důvod nevyžaduje", () => {
    expect(validateEventDateChange({ before: d(null, "2027-01-05", null), after: d(null, "2027-02-05", null), today: TODAY, reason: null })).toEqual([]);
  });
});

describe("nearestOpenEvent / sortEvents", () => {
  const ev = (id: string, title: string, dates: EventDates, status: "active" | "cancelled" = "active") => ({ id, title, status, ...dates });
  it("vybere nejbližší nenastalou aktivní událost; bez termínu až nakonec", async () => {
    const { nearestOpenEvent } = await import("./eventDates.ts");
    const events = [
      ev("a", "Předání staveniště", d(null, null, "2026-10-05")),
      ev("b", "Montáž – linka 2", d(null, "2027-05-10", null)),
      ev("c", "Montáž – linka 1", d("2027-03-31", "2027-03-01", null)),
      ev("d", "Zkušební provoz", d(null, null, null)),
      ev("e", "Zrušená", d(null, "2026-12-01", null), "cancelled"),
    ];
    expect(nearestOpenEvent(events)?.id).toBe("c");
    expect(nearestOpenEvent([events[3]!])?.id).toBe("d");
    expect(nearestOpenEvent([events[0]!])).toBeNull();
  });
});
