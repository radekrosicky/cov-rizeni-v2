// Fiktivní sledované dodávky s termíny (V2-4) pro ukázku „Co musím objednat, kdy a proč?“.
// Zakládá se přes služby (vznikne i historie). Volá se až po seedDevData – vyžaduje schéma s migrací 0004.
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { events } from "../db/schema.ts";
import type { SessionActor } from "../services/common.ts";
import { createManualNeed, updateNeedSchedule } from "../services/material.ts";

interface Seeded {
  users: SessionActor[];
  projects: string[];
}

export async function seedDevMaterial(db: Db, seeded: Seeded) {
  const [, deputy] = seeded.users as [SessionActor, SessionActor];
  const [p1, p2] = seeded.projects as [string, string];
  const eventId = async (projectId: string, title: string) => {
    const [e] = await db.select({ id: events.id }).from(events).where(and(eq(events.projectId, projectId), eq(events.title, title)));
    if (!e) throw new Error(`Fiktivní událost „${title}“ nenalezena.`);
    return e.id;
  };
  const line1 = await eventId(p1, "Zahájení montáže technologie – linka 1");
  const line2 = await eventId(p1, "Zahájení montáže technologie – linka 2");
  const trial = await eventId(p1, "Zkušební provoz / komplexní zkoušky");

  const need = async (
    projectId: string,
    name: string,
    o: { reason?: "critical_technology" | "long_lead_time" | "may_block_assembly"; qty?: string; unit?: string; responsible?: boolean; event?: string | null; offset?: number; lead?: [number, "calendar" | "working", "estimate" | "confirmed"] | null; reserve?: number },
  ) => {
    const id = await createManualNeed(db, deputy, projectId, {
      name,
      trackingReason: o.reason ?? "critical_technology",
      trackingReasonNote: null,
      plannedQuantity: o.qty ?? null,
      unit: o.unit ?? null,
      responsibleUserId: o.responsible === false ? null : deputy.id,
      note: null,
    });
    await updateNeedSchedule(db, deputy, projectId, id, 1, {
      needEventId: o.event ?? null,
      needOffsetDays: String(o.offset ?? 0),
      needDateOverride: null,
      needDateOverrideReason: null,
      leadTimeState: o.lead ? o.lead[2] : "unknown",
      leadTimeDays: o.lead ? String(o.lead[0]) : null,
      leadTimeUnit: o.lead ? o.lead[1] : null,
      reserveDays: String(o.reserve ?? 14),
    });
  };

  // ČOV Fiktivín – montáž linky 1 plán 1. 3. 2027 (smluvně 31. 3.), linka 2 plán 10. 5. 2027, zkušební provoz bez data.
  await need(p1, "Dmychadla D1–D2 (fiktivní)", { qty: "2", unit: "ks", event: line1, offset: -7, lead: [42, "calendar", "confirmed"] });
  await need(p1, "Česle strojně stírané (fiktivní)", { reason: "long_lead_time", qty: "1", unit: "ks", event: line1, offset: -14, lead: [90, "working", "estimate"] });
  await need(p1, "Náhradní díly kalových čerpadel (fiktivní)", { reason: "may_block_assembly", event: line1, offset: -30, lead: [45, "calendar", "confirmed"] });
  await need(p1, "Rozvaděč RM1 (fiktivní)", { event: line2, offset: -10, lead: null, responsible: false });
  await need(p1, "Membránové difuzory (fiktivní)", { qty: "320", unit: "ks", event: trial, offset: -21, lead: [6, "working", "confirmed"] });
  await need(p1, "Spojovací materiál nerez (fiktivní)", { reason: "may_block_assembly", event: line1, offset: 0, lead: [0, "calendar", "confirmed"], reserve: 3 });
  // ČOV Testovice – zatím bez termínu montáže.
  await need(p2, "Dmychadla – strojovna (fiktivní)", { reason: "long_lead_time", event: null, lead: [60, "calendar", "estimate"] });
}
