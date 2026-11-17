// Události a milníky. Jediné místo, kde se zapisují termíny zakázky.
// Každá událost má vlastní id a vlastní smluvní / plánovaný / skutečný termín (všechny nepovinné).
import { and, eq } from "drizzle-orm";
import { pragueToday } from "../../domain/calendar/calendar.ts";
import { validateEventDateChange, type EventDateIssue, type EventDates } from "../../domain/events/eventDates.ts";
import { EVENT_KIND_LABELS, EVENT_KINDS, type EventKind } from "../../domain/values.ts";
import type { Db } from "../db/client.ts";
import { events, type ProjectEvent } from "../db/schema.ts";
import { DomainError } from "../errors.ts";
import { conflictError, diff, isUuid, requireProject, requireReason, writeHistory, type SessionActor } from "./common.ts";

export interface EventInput {
  kind: string;
  title: string;
  isMilestone: boolean;
  contractDate: string | null;
  plannedDate: string | null;
  actualDate: string | null;
  note: string | null;
}

const FIELDS = ["kind", "title", "isMilestone", "contractDate", "plannedDate", "actualDate", "note"] as const;

const ISSUE_TEXT: Record<EventDateIssue["code"], string> = {
  invalid_date: "Neplatné datum.",
  actual_in_future: "Skutečné datum nemůže být v budoucnosti – událost ještě nenastala.",
  reason_required: "Změna tohoto termínu vyžaduje důvod.",
};

function normalize(input: EventInput) {
  const fieldErrors: Record<string, string> = {};
  if (!(EVENT_KINDS as readonly string[]).includes(input.kind)) fieldErrors.kind = "Vyberte typ události.";
  const kind = input.kind as EventKind;
  // U typové události se bez vlastního názvu použije název typu; u „jiné“ je název povinný.
  const title = input.title.trim() || (kind !== "other" && EVENT_KIND_LABELS[kind] ? EVENT_KIND_LABELS[kind] : "");
  if (!title) fieldErrors.title = "Vyplňte název události.";
  const empty = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    fieldErrors,
    value: {
      kind,
      title,
      isMilestone: input.isMilestone,
      contractDate: empty(input.contractDate),
      plannedDate: empty(input.plannedDate),
      actualDate: empty(input.actualDate),
      note: empty(input.note),
    },
  };
}

function checkDates(before: EventDates, after: EventDates, reason: string | null, fieldErrors: Record<string, string>) {
  for (const issue of validateEventDateChange({ before, after, today: pragueToday(), reason })) {
    fieldErrors[issue.code === "reason_required" ? "reason" : issue.field] = ISSUE_TEXT[issue.code];
  }
  if (Object.keys(fieldErrors).length) throw new DomainError("validation", "Formulář obsahuje chyby.", fieldErrors);
}

const NO_DATES: EventDates = { contractDate: null, plannedDate: null, actualDate: null };

export async function createEvent(db: Db, actor: SessionActor, projectId: string, input: EventInput): Promise<ProjectEvent> {
  const { fieldErrors, value } = normalize(input);
  checkDates(NO_DATES, value, null, fieldErrors);
  return db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "event.edit");
    const now = new Date();
    const [e] = await tx
      .insert(events)
      .values({
        projectId,
        ...value,
        actualRecordedAt: value.actualDate ? now : null,
        actualRecordedBy: value.actualDate ? actor.id : null,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "event", entityId: e!.id, action: "create", changes: diff(null, e!, FIELDS) });
    return e!;
  });
}

async function loadEvent(db: Db | Parameters<Parameters<Db["transaction"]>[0]>[0], projectId: string, eventId: string) {
  if (!isUuid(eventId)) throw new DomainError("not_found", "Událost nebyla nalezena.");
  const [e] = await db.select().from(events).where(and(eq(events.id, eventId), eq(events.projectId, projectId)));
  if (!e) throw new DomainError("not_found", "Událost nebyla nalezena.");
  return e;
}

export async function getEvent(db: Db, actor: SessionActor, projectId: string, eventId: string) {
  await requireProject(db, actor, projectId, "project.view");
  return loadEvent(db, projectId, eventId);
}

export async function updateEvent(
  db: Db,
  actor: SessionActor,
  projectId: string,
  eventId: string,
  version: number,
  input: EventInput,
  reason: string | null,
): Promise<ProjectEvent> {
  const { fieldErrors, value } = normalize(input);
  return db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "event.edit");
    const before = await loadEvent(tx, projectId, eventId);
    if (before.status !== "active") throw new DomainError("validation", "Zrušenou událost nelze upravit.");
    if (before.version !== version) throw conflictError();
    checkDates(before, value, reason, fieldErrors);
    const actualChanged = before.actualDate !== value.actualDate;
    const now = new Date();
    const [after] = await tx
      .update(events)
      .set({
        ...value,
        ...(actualChanged
          ? { actualRecordedAt: value.actualDate ? now : null, actualRecordedBy: value.actualDate ? actor.id : null }
          : {}),
        version: before.version + 1,
        updatedBy: actor.id,
        updatedAt: now,
      })
      .where(and(eq(events.id, eventId), eq(events.version, version)))
      .returning();
    if (!after) throw conflictError();
    const changes = diff(before, after, FIELDS);
    if (Object.keys(changes).length) {
      const onlyActualSet = actualChanged && before.actualDate === null && Object.keys(changes).length === 1;
      await writeHistory(tx, {
        actorId: actor.id,
        projectId,
        entityType: "event",
        entityId: eventId,
        action: onlyActualSet ? "record_actual" : "update",
        changes,
        reason,
      });
    }
    return after;
  });
}

export async function cancelEvent(db: Db, actor: SessionActor, projectId: string, eventId: string, version: number, reason: string) {
  const r = requireReason(reason);
  return db.transaction(async (tx) => {
    await requireProject(tx, actor, projectId, "event.edit");
    const before = await loadEvent(tx, projectId, eventId);
    if (before.status !== "active") throw new DomainError("validation", "Událost už je zrušená.");
    const [after] = await tx
      .update(events)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy: actor.id, cancelReason: r, version: before.version + 1, updatedBy: actor.id, updatedAt: new Date() })
      .where(and(eq(events.id, eventId), eq(events.version, version)))
      .returning();
    if (!after) throw conflictError();
    await writeHistory(tx, { actorId: actor.id, projectId, entityType: "event", entityId: eventId, action: "cancel", changes: { status: { before: "active", after: "cancelled" } }, reason: r });
    return after;
  });
}
