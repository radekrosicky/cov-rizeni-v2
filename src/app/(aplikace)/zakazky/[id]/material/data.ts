import { notFound } from "next/navigation";
import { DomainError } from "@/server/errors";
import { getCurrentActor } from "@/server/identity/session";
import type { SessionActor } from "@/server/services/common";

/** Načtení dat stránky: bez identity → null (stránku obstará rozvržení), nečlen / cizí záznam → 404. */
export async function load<T>(fn: (actor: SessionActor) => Promise<T>): Promise<{ actor: SessionActor; data: T } | null> {
  const actor = await getCurrentActor();
  if (!actor) return null;
  try {
    return { actor, data: await fn(actor) };
  } catch (e) {
    if (e instanceof DomainError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
}

export const fmtQty = (q: string | number | null | undefined, unit?: string | null) =>
  q === null || q === undefined ? "neurčeno" : `${Number(q).toLocaleString("cs-CZ", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;

export const fmtMoney = (v: string | null) => (v === null ? "—" : Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
