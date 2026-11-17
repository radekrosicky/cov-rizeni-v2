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

/** Obrazovka bez přihlášeného uživatele. Ve vývoji nabídne výběr fiktivní identity, v produkci nic. */
export function IdentityGate({ mode }: { mode: "dev" | "none" }) {
  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      {mode === "dev" ? (
        <>
          <h1 className="text-xl font-bold text-slate-900">Vyberte fiktivní identitu</h1>
          <p className="mt-2 text-sm text-slate-600">
            Skutečné přihlášení zatím neexistuje. Ve vývojovém režimu si vyberte jednoho z fiktivních uživatelů.
          </p>
          <Link href="/vyvoj/identita" className={`${btnPrimary} mt-4`}>
            Vybrat fiktivní identitu
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-slate-900">Přihlášení zatím není k dispozici</h1>
          <p className="mt-2 text-sm text-slate-600">
            Tato verze aplikace nemá skutečné přihlášení, proto nezobrazuje žádná data. Vývojové identity jsou v tomto
            režimu vypnuté.
          </p>
        </>
      )}
    </section>
  );
}
