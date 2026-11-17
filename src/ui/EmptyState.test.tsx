import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState, NOT_IMPLEMENTED_LABEL } from "./EmptyState";

describe("EmptyState", () => {
  it("jasně označí, že funkce zatím není k dispozici", () => {
    const html = renderToStaticMarkup(<EmptyState title="Zakázky" purpose="Seznam zakázek." />);
    expect(html).toContain(NOT_IMPLEMENTED_LABEL);
    expect(html).toContain("ještě není naprogramovaná");
    expect(html).toContain("Zakázky");
  });

  it("neobsahuje žádné tlačítko ani formulář, které by předstíraly funkci", () => {
    const html = renderToStaticMarkup(<EmptyState title="Moje úkoly" purpose="Úkoly." />);
    expect(html).not.toMatch(/<(button|form|input|a)\b/);
  });
});
