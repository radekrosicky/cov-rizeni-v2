// Převzato z V1 (radekrosicky/cov-rizeni, b7168b6, src/server/scheduling/scheduling.test.ts) – jen testy kalendáře.
import { describe, expect, it } from "vitest";
import {
  addMonths,
  addWorkingDays,
  czechHolidays,
  easterSunday,
  endOfPragueDay,
  holidayName,
  isIsoDate,
  isWorkingDay,
  pragueParts,
  pragueToInstant,
  pragueToday,
} from "./calendar.ts";

const at = (s: string) => new Date(s);
describe("kalendář – české svátky", () => {
  it("Velikonoce", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });
  it("13 dnů pracovního klidu včetně Velkého pátku", () => {
    const h = czechHolidays(2027);
    expect(h.size).toBe(13);
    expect(holidayName("2027-03-26")).toBe("Velký pátek");
    expect(holidayName("2027-03-29")).toBe("Velikonoční pondělí");
    expect(holidayName("2026-04-03")).toBe("Velký pátek");
    expect(holidayName("2026-12-24")).toBe("Štědrý den");
    expect(holidayName("2026-11-17")).toMatch(/svobodu/);
    expect(holidayName("2026-11-18")).toBeNull();
  });
  it("pracovní dny", () => {
    expect(isWorkingDay("2026-11-16")).toBe(true); // pondělí
    expect(isWorkingDay("2026-11-17")).toBe(false); // svátek v úterý
    expect(isWorkingDay("2026-11-21")).toBe(false); // sobota
    expect(isWorkingDay("2026-11-22")).toBe(false); // neděle
    expect(isWorkingDay("2027-01-01")).toBe(false);
  });
});

describe("kalendář – posun o pracovní dny", () => {
  it("přes Vánoce a víkend", () => {
    // 24., 25., 26. 12. 2026 = čt, pá, so (svátky), 27. ne → první pracovní den po 23. 12. je 28. 12.
    expect(addWorkingDays("2026-12-23", 1)).toBe("2026-12-28");
  });
  it("přes přelom roku", () => {
    // 31. 12. čt (pracovní), 1. 1. 2027 pá svátek, so, ne → 4. 1.
    expect(addWorkingDays("2026-12-30", 2)).toBe("2027-01-04");
  });
  it("přes Velikonoce 2027", () => {
    expect(addWorkingDays("2027-03-25", 1)).toBe("2027-03-30");
  });
  it("přes svátek 17. 11.", () => {
    // po 16. 11. → út 17. 11. svátek → st 18. 11.
    expect(addWorkingDays("2026-11-16", 1)).toBe("2026-11-18");
    expect(addWorkingDays("2026-11-16", 5)).toBe("2026-11-24");
  });
  it("dozadu", () => {
    expect(addWorkingDays("2026-12-28", -1)).toBe("2026-12-23");
    expect(addWorkingDays("2027-01-04", -2)).toBe("2026-12-30");
  });
  it("událost o víkendu – počítá se od následujícího pracovního dne", () => {
    // so 21. 11. 2026 + 1 pracovní den = po 23. 11.
    expect(addWorkingDays("2026-11-21", 1)).toBe("2026-11-23");
  });
});

describe("kalendář – měsíce (§ 605)", () => {
  it("konec měsíce", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2027-03-31", -1)).toBe("2027-02-28");
    expect(addMonths("2026-11-16", 24)).toBe("2028-11-16");
  });
});

describe("kalendář – čas Europe/Prague", () => {
  it("zimní a letní čas", () => {
    expect(pragueToInstant("2026-11-16", "10:00").toISOString()).toBe("2026-11-16T09:00:00.000Z");
    expect(pragueToInstant("2027-07-01", "10:00").toISOString()).toBe("2027-07-01T08:00:00.000Z");
  });
  it("neexistující čas při přechodu na letní čas se posune dopředu", () => {
    const t = pragueToInstant("2027-03-28", "02:30");
    expect(t.toISOString()).toBe("2027-03-28T01:30:00.000Z");
    expect(pragueParts(t)).toEqual({ date: "2027-03-28", time: "03:30" });
  });
  it("dvojznačný čas při přechodu na zimní čas = dřívější okamžik", () => {
    expect(pragueToInstant("2027-10-31", "02:30").toISOString()).toBe("2027-10-31T00:30:00.000Z");
  });
  it("konec dne a dnešní datum v Praze", () => {
    expect(endOfPragueDay("2027-03-28").toISOString()).toBe("2027-03-28T21:59:59.999Z");
    expect(endOfPragueDay("2026-12-31").toISOString()).toBe("2026-12-31T22:59:59.999Z");
    // 23:30 UTC 31. 12. je už 1. 1. v Praze
    expect(pragueToday(at("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});

// Doplněno ve V2: kontrola formátu data (používá validace událostí).
describe("kalendář – platnost data", () => {
  it("přijme jen existující den ve tvaru RRRR-MM-DD", () => {
    expect(isIsoDate("2027-02-28")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2027-13-01")).toBe(false);
    expect(isIsoDate("1. 3. 2027")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});
