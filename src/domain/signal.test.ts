import { describe, expect, it } from "vitest";
import { SIGNALS, signalLabel, type Signal } from "./signal";

describe("signal – jazyk upozornění", () => {
  it("každý signál má neprázdný slovní popis (nikdy jen barva)", () => {
    for (const [key, value] of Object.entries(SIGNALS)) {
      expect(value.label.trim(), key).not.toBe("");
      expect(value.meaning.trim(), key).not.toBe("");
    }
  });

  it("neověřeno se nikdy nevydává za problém ani za splnění", () => {
    expect(signalLabel("unverified")).toBe("Neověřeno");
    expect(SIGNALS.unverified.meaning).toContain("neznamená nesplněno");
    const labels = (Object.keys(SIGNALS) as Signal[]).map(signalLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
