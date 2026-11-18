"use server";

// Serverové akce zakázek. Každá: zjistí přihlášeného uživatele → zavolá službu (oprávnění + transakce + historie)
// → při úspěchu přesměruje s potvrzením „uloženo“. Oprávnění rozhoduje služba, ne obrazovka.
import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/identity/session";
import { cancelEvent, createEvent, updateEvent, type EventInput } from "@/server/app";
import { addMember, changeMemberAccess, removeMember } from "@/server/app";
import { archiveProject, createProject, unarchiveProject, updateProject } from "@/server/app";
import type { FormState } from "@/ui/formState";
import { int, NOT_SIGNED_IN, optStr, str, toFormState } from "../_lib/actionResult";

function projectInput(fd: FormData) {
  return {
    name: str(fd, "name"),
    projectType: str(fd, "projectType"),
    projectTypeNote: optStr(fd, "projectTypeNote"),
    leaderUserId: str(fd, "leaderUserId"),
    clientName: optStr(fd, "clientName"),
  };
}

function eventInput(fd: FormData): EventInput {
  return {
    kind: str(fd, "kind"),
    title: str(fd, "title"),
    isMilestone: fd.get("isMilestone") === "on",
    contractDate: optStr(fd, "contractDate"),
    plannedDate: optStr(fd, "plannedDate"),
    actualDate: optStr(fd, "actualDate"),
    note: optStr(fd, "note"),
  };
}

export async function createProjectAction(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  let id: string;
  try {
    id = (await createProject(actor, projectInput(fd))).id;
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${id}?ulozeno=zakazka`);
}

export async function updateProjectAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await updateProject(actor, projectId, int(fd, "version"), { ...projectInput(fd), status: str(fd, "status") });
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}?ulozeno=1`);
}

export async function archiveProjectAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await archiveProject(actor, projectId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}?ulozeno=archiv`);
}

export async function unarchiveProjectAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await unarchiveProject(actor, projectId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}?ulozeno=1`);
}

export async function createEventAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await createEvent(actor, projectId, eventInput(fd));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}?ulozeno=udalost#terminy`);
}

export async function updateEventAction(projectId: string, eventId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await updateEvent(actor, projectId, eventId, int(fd, "version"), eventInput(fd), optStr(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}?ulozeno=udalost#terminy`);
}

export async function cancelEventAction(projectId: string, eventId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await cancelEvent(actor, projectId, eventId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}?ulozeno=1#terminy`);
}

export async function addMemberAction(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await addMember(actor, projectId, str(fd, "userId"), str(fd, "access"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}/clenove?ulozeno=1`);
}

export async function changeMemberAccessAction(projectId: string, userId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await changeMemberAccess(actor, projectId, userId, str(fd, "access"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}/clenove?ulozeno=1`);
}

export async function removeMemberAction(projectId: string, userId: string): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await removeMember(actor, projectId, userId);
  } catch (e) {
    return toFormState(e);
  }
  redirect(`/zakazky/${projectId}/clenove?ulozeno=1`);
}
