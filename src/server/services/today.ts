// „Co dnes řešit“ (V2-4: materiál). Vypočítá se vždy z aktuálních údajů – nic se neukládá podruhé.
// Zobrazí jen zakázky, ke kterým má uživatel přístup (správce všechny, ostatní své členství).
// Objednávky zatím neevidujeme: přehled nikdy netvrdí „neobjednáno“, jen vyzývá k ověření.
import { and, eq, inArray, ne } from "drizzle-orm";
import { canProject } from "../../domain/access/permissions.ts";
import { pragueToday, type IsoDate } from "../../domain/calendar/calendar.ts";
import { TODAY_GROUPS, todayGroupOf, todaySortKey, type TodayGroup } from "../../domain/material/today.ts";
import type { Db } from "../db/client.ts";
import { events, materialNeeds, projectMembers, projects, users } from "../db/schema.ts";
import type { SessionActor } from "./common.ts";
import { leadTimeText, scheduleOf } from "./material.ts";

export async function listTodayMaterial(db: Db, actor: SessionActor, today: IsoDate = pragueToday()) {
  const empty = Object.fromEntries(TODAY_GROUPS.map((g) => [g, []])) as unknown as Record<TodayGroup, TodayItem[]>;
  if (actor.status !== "active") return { today, groups: empty, projectCount: 0 };
  const memberships = await db.select().from(projectMembers).where(eq(projectMembers.userId, actor.id));
  const access = new Map(memberships.map((m) => [m.projectId, m.access]));
  const all = await db.select().from(projects).where(ne(projects.status, "archived"));
  const visible = all.filter((p) => canProject(actor, "material.view", { status: p.status, membership: access.get(p.id) ?? null }).allowed);
  if (!visible.length) return { today, groups: empty, projectCount: 0 };
  const ids = visible.map((p) => p.id);
  const [needs, evs] = await Promise.all([
    db.select().from(materialNeeds).where(and(inArray(materialNeeds.projectId, ids), ne(materialNeeds.status, "archived"))),
    db.select().from(events).where(inArray(events.projectId, ids)),
  ]);
  const respIds = [...new Set(needs.map((n) => n.responsibleUserId).filter(Boolean))] as string[];
  const names = new Map((respIds.length ? await db.select({ id: users.id, n: users.displayName }).from(users).where(inArray(users.id, respIds)) : []).map((u) => [u.id, u.n]));
  const evById = new Map(evs.map((e) => [e.id, e]));
  const projName = new Map(visible.map((p) => [p.id, p.name]));
  const groups: Record<TodayGroup, TodayItem[]> = { verify_order: [], order_soon: [], missing_date: [], lead_time: [] };
  for (const n of needs) {
    const ev = n.needEventId ? evById.get(n.needEventId) ?? null : null;
    const schedule = scheduleOf(n, ev, today);
    const g = todayGroupOf(schedule);
    if (!g) continue;
    groups[g].push({
      projectId: n.projectId,
      projectName: projName.get(n.projectId) ?? "?",
      needId: n.id,
      needName: n.name,
      responsibleName: n.responsibleUserId ? names.get(n.responsibleUserId) ?? "?" : null,
      eventTitle: ev?.title ?? null,
      leadTime: leadTimeText(n),
      schedule,
    });
  }
  for (const g of TODAY_GROUPS) groups[g].sort((a, b) => todaySortKey(a.schedule).localeCompare(todaySortKey(b.schedule)) || a.needName.localeCompare(b.needName, "cs"));
  return { today, groups, projectCount: visible.length };
}

export interface TodayItem {
  projectId: string;
  projectName: string;
  needId: string;
  needName: string;
  responsibleName: string | null;
  eventTitle: string | null;
  leadTime: string;
  schedule: ReturnType<typeof scheduleOf>;
}
