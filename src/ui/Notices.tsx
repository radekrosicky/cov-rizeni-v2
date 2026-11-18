import Link from "next/link";
import type { ReactNode } from "react";
import { btnPrimary } from "./styles";

/** Potvrzení po úspěšném uložení – zobrazí se jen po přesměrování ze serveru (uložení proběhlo). */
export function SavedNotice({ show, children = "Změna byla uložena." }: { show: boolean; children?: ReactNode }) {
  if (!show) return null;
  return (
    <div role="status" className="mb-4 rounded-md border border-green-200 bg-signal-done-bg px-3 py-2 text-sm font-semibold text-signal-done">
      ✓ {children}
    </div>
  );
}

/** Pojistka, kdyby stránka přesto běžela bez identity (rozvržení aplikace ji jinak přesměruje na vstup). */
export function IdentityGate() {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Nejste přihlášeni</h1>
      <Link href="/prihlaseni" className={`${btnPrimary} mt-4`}>
        Přejít na přihlášení
      </Link>
    </section>
  );
}
