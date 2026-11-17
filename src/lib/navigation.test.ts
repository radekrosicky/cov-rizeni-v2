import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isNavItemActive } from "./navigation";

describe("navigace", () => {
  it("obsahuje přesně tři schválené položky ve správném pořadí", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Co dnes řešit", "Zakázky", "Moje úkoly"]);
  });

  it("úvodní stránka je aktivní jen přesně na „/“", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/zakazky")).toBe(false);
  });

  it("sekce je aktivní i na podstránkách, ale ne na podobném názvu", () => {
    expect(isNavItemActive("/zakazky", "/zakazky")).toBe(true);
    expect(isNavItemActive("/zakazky", "/zakazky/abc")).toBe(true);
    expect(isNavItemActive("/zakazky", "/zakazkyx")).toBe(false);
  });
});
