import type { ReactNode } from "react";
import { requireActor } from "@/server/identity/session";
import { AppShell } from "@/ui/AppShell";
import { IdentityBar } from "@/ui/IdentityBar";
import { signOutAction } from "../prihlaseni/actions";

// Všechny obrazovky s navigací a daty. Bez platné identity (ověřené na serveru v databázi) → vstupní obrazovka.
// V produkčním režimu identita neexistuje nikdy, takže se sem nikdo nedostane.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  return <AppShell topBar={<IdentityBar actor={actor} signOut={signOutAction} />}>{children}</AppShell>;
}
