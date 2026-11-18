import { notFound } from "next/navigation";
import { getDocumentDetail, listDocuments } from "@/server/app";
import { DomainError } from "@/server/errors";
import { getCurrentActor } from "@/server/identity/session";

const guard = async <T,>(p: Promise<T>): Promise<T> =>
  p.catch((e: unknown) => {
    if (e instanceof DomainError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  });

export async function loadDocuments(projectId: string) {
  const actor = await getCurrentActor();
  if (!actor) return null;
  return guard(listDocuments(actor, projectId));
}

export async function loadDocument(projectId: string, documentId: string) {
  const actor = await getCurrentActor();
  if (!actor) return null;
  return guard(getDocumentDetail(actor, projectId, documentId));
}
