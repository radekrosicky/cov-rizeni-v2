"use server";

// Serverové akce rozpočtu a sledovaných dodávek (V2-3). Oprávnění, transakce a historie řeší služby.
import { redirect } from "next/navigation";
import type { SheetMapping } from "@/domain/budget/types";
import {
  addSourcesToNeed,
  archiveNeed,
  confirmImport,
  createManualNeed,
  createNeedsFromItems,
  markItemReviewed,
  removeSource,
  setItemKind,
  unarchiveNeed,
  updateNeed,
  updateSourceQuantity,
  voidImport,
  type NeedFields,
  type SourceInput,
} from "@/server/app";
import { getCurrentActor } from "@/server/identity/session";
import type { FormState } from "@/ui/formState";
import { int, NOT_SIGNED_IN, optStr, str, toFormState } from "../_lib/actionResult";

const base = (projectId: string) => `/zakazky/${projectId}/material`;

function needFields(fd: FormData): NeedFields {
  return {
    name: str(fd, "name"),
    trackingReason: str(fd, "trackingReason"),
    trackingReasonNote: optStr(fd, "trackingReasonNote"),
    plannedQuantity: optStr(fd, "plannedQuantity"),
    unit: optStr(fd, "unit"),
    responsibleUserId: optStr(fd, "responsibleUserId"),
    note: optStr(fd, "note"),
  };
}

function sourcesFrom(fd: FormData): SourceInput[] {
  return fd.getAll("itemId").map((id, i) => ({
    budgetItemId: String(id),
    quantityTaken: optStr(fd, `source.${i}.quantityTaken`),
    overAllocationReason: optStr(fd, `source.${i}.overAllocationReason`),
  }));
}

export async function confirmImportAction(projectId: string, revisionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  let importId: string;
  try {
    const mappings = JSON.parse(str(fd, "mappings")) as SheetMapping[];
    const r = await confirmImport(actor, projectId, revisionId, {
      mappings,
      currency: optStr(fd, "currency"),
      vatBasis: optStr(fd, "vatBasis"),
      reviewAcknowledged: fd.get("reviewAcknowledged") === "on",
      sameFileAcknowledged: fd.get("sameFileAcknowledged") === "on",
    });
    importId = r.importId;
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/polozky?import=${importId}&ulozeno=import`);
}

export async function voidImportAction(projectId: string, importId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await voidImport(actor, projectId, importId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}?ulozeno=zneplatneno`);
}

export async function createNeedsAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  let ids: string[];
  try {
    ids = await createNeedsFromItems(actor, projectId, {
      mode: str(fd, "mode") === "each" ? "each" : "one",
      fields: needFields(fd),
      sources: sourcesFrom(fd),
      acknowledgeTracked: fd.get("acknowledgeTracked") === "on",
    });
  } catch (e) {
    return toFormState(e);
  }
  redirect(ids.length === 1 ? `${base(projectId)}/${ids[0]}?ulozeno=vytvoreno` : `${base(projectId)}?ulozeno=vytvoreno-${ids.length}`);
}

export async function createManualNeedAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  let id: string;
  try {
    id = await createManualNeed(actor, projectId, needFields(fd));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${id}?ulozeno=vytvoreno`);
}

export async function updateNeedAction(projectId: string, needId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await updateNeed(actor, projectId, needId, int(fd, "version"), needFields(fd));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${needId}?ulozeno=1`);
}

export async function addSourcesAction(projectId: string, needId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await addSourcesToNeed(actor, projectId, needId, int(fd, "version"), sourcesFrom(fd), fd.get("acknowledgeTracked") === "on");
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${needId}?ulozeno=pridano`);
}

export async function updateSourceAction(projectId: string, needId: string, sourceId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await updateSourceQuantity(actor, projectId, sourceId, optStr(fd, "quantityTaken"), optStr(fd, "overAllocationReason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${needId}?ulozeno=1`);
}

export async function removeSourceAction(projectId: string, needId: string, sourceId: string): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await removeSource(actor, projectId, sourceId);
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${needId}?ulozeno=odebrano`);
}

export async function archiveNeedAction(projectId: string, needId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await archiveNeed(actor, projectId, needId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${needId}?ulozeno=archiv`);
}

export async function unarchiveNeedAction(projectId: string, needId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await unarchiveNeed(actor, projectId, needId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/${needId}?ulozeno=obnoveno`);
}

export async function setItemKindAction(projectId: string, itemId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await setItemKind(actor, projectId, itemId, str(fd, "kind"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/polozky/${itemId}?ulozeno=1`);
}

export async function markItemReviewedAction(projectId: string, itemId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await markItemReviewed(actor, projectId, itemId, optStr(fd, "note"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`${base(projectId)}/polozky/${itemId}?ulozeno=1`);
}
