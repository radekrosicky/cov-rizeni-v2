"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveDevActor } from "@/server/app";
import { DEV_IDENTITY_COOKIE, devIdentitiesEnabled } from "@/server/identity/devIdentity";

/** Přepnutí fiktivní identity. V produkčním režimu technicky nefunguje (vyhodí chybu, nic nenastaví). */
export async function switchDevIdentityAction(formData: FormData): Promise<void> {
  if (!devIdentitiesEnabled(process.env)) throw new Error("Vývojové identity jsou v tomto režimu vypnuté.");
  const userId = String(formData.get("userId") ?? "");
  const actor = await resolveDevActor(userId);
  if (!actor) throw new Error("Neplatná vývojová identita.");
  const store = await cookies();
  store.set(DEV_IDENTITY_COOKIE, actor.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/zakazky");
}

export async function clearDevIdentityAction(): Promise<void> {
  const store = await cookies();
  store.delete(DEV_IDENTITY_COOKIE);
  redirect("/vyvoj/identita");
}
