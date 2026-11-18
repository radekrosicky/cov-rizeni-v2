import { cache } from "react";
import { notFound } from "next/navigation";
import { DomainError } from "@/server/errors";
import { getCurrentActor } from "@/server/identity/session";
import { getProjectDetail } from "@/server/app";

/** Detail zakázky pro jeden požadavek (sdílí ho rozvržení i stránky). Nečlen → 404. */
export const loadProject = cache(async (id: string) => {
  const actor = await getCurrentActor();
  if (!actor) return null;
  try {
    return { actor, detail: await getProjectDetail(actor, id) };
  } catch (e) {
    if (e instanceof DomainError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
});
