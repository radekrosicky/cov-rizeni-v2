"use server";

// Vstup do aplikace a odhlášení. Zatím jen vývojová fiktivní identita – v produkčním režimu technicky vypnutá.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveDevActor } from "@/server/app";
import { endSession } from "@/server/identity/session";
import { DEV_IDENTITY_COOKIE, LOGIN_PATH, devIdentitiesEnabled } from "@/server/identity/mode";

/** Výběr fiktivní identity → rovnou „Co dnes řešit“. V produkci vyhodí chybu a nic nenastaví. */
export async function signInDevAction(formData: FormData): Promise<void> {
  if (!devIdentitiesEnabled(process.env)) throw new Error("Vývojové identity jsou v tomto režimu vypnuté.");
  const actor = await resolveDevActor(String(formData.get("userId") ?? ""));
  if (!actor) throw new Error("Neplatná vývojová identita.");
  const store = await cookies();
  // Relace prohlížeče (bez data vypršení): zavřením prohlížeče zaniká.
  store.set(DEV_IDENTITY_COOKIE, actor.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}
