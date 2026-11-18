// Kolik z položky rozpočtu už je převzato do dodávek a kolik zbývá. Původní množství se nikdy nemění.
export interface Allocation {
  /** Množství v rozpočtu (null = nečíselné / chybí). */
  budget: number | null;
  taken: number;
  remaining: number | null;
  over: boolean;
  /** Položka už je v nějaké (nearchivované) dodávce. */
  tracked: boolean;
}

export function allocationOf(budgetQuantity: string | null, taken: (string | null)[]): Allocation {
  const budget = budgetQuantity === null ? null : Number(budgetQuantity);
  const sum = taken.reduce<number>((s, t) => s + (t === null ? 0 : Number(t)), 0);
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return {
    budget,
    taken: round(sum),
    remaining: budget === null ? null : round(Math.max(budget - sum, 0)),
    over: budget !== null && round(sum) > budget,
    tracked: taken.length > 0,
  };
}

/** Navržené převzaté množství pro novou dodávku: zbývající množství (nic se nevymýšlí u nečíselné položky). */
export function suggestedTake(budgetQuantity: string | null, taken: (string | null)[]): string | null {
  const a = allocationOf(budgetQuantity, taken);
  if (a.budget === null) return null;
  return a.remaining && a.remaining > 0 ? String(a.remaining) : String(a.budget);
}
