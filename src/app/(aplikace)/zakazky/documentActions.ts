"use server";

// Serverové akce dokumentů bez souboru (malé formuláře). Soubory jdou samostatnou adresou /dokumenty/nahrat.
import { redirect } from "next/navigation";
import { archiveDocument, setCurrentRevision, unarchiveDocument, updateDocumentInfo } from "@/server/app";
import { getCurrentActor } from "@/server/identity/session";
import type { FormState } from "@/ui/formState";
import { int, NOT_SIGNED_IN, optStr, str, toFormState } from "../_lib/actionResult";

const detail = (projectId: string, documentId: string, saved: string) => `/zakazky/${projectId}/dokumenty/${documentId}?ulozeno=${saved}`;

export async function setCurrentRevisionAction(projectId: string, documentId: string, revisionId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await setCurrentRevision(actor, projectId, documentId, revisionId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(detail(projectId, documentId, "aktualni"));
}

export async function updateDocumentInfoAction(projectId: string, documentId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await updateDocumentInfo(actor, projectId, documentId, int(fd, "version"), { title: str(fd, "title"), category: str(fd, "category"), note: optStr(fd, "note") });
  } catch (e) {
    return toFormState(e);
  }
  redirect(detail(projectId, documentId, "udaje"));
}

export async function archiveDocumentAction(projectId: string, documentId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await archiveDocument(actor, projectId, documentId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(detail(projectId, documentId, "archiv"));
}

export async function unarchiveDocumentAction(projectId: string, documentId: string, _: FormState, fd: FormData): Promise<FormState> {
  const actor = await getCurrentActor();
  if (!actor) return NOT_SIGNED_IN;
  try {
    await unarchiveDocument(actor, projectId, documentId, int(fd, "version"), str(fd, "reason"));
  } catch (e) {
    return toFormState(e);
  }
  redirect(detail(projectId, documentId, "obnoven"));
}
