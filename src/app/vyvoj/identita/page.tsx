import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GLOBAL_ROLE_LABELS } from "@/domain/values";
import { listDevIdentities } from "@/server/app";
import { getCurrentActor, identityMode } from "@/server/identity/session";
import { PageHeader } from "@/ui/PageHeader";
import { btnSecondary } from "@/ui/styles";
import { clearDevIdentityAction, switchDevIdentityAction } from "./actions";

export const metadata: Metadata = { title: "Fiktivní identita" };

const ROLE_HINT = {
  admin: "Vidí a smí vše, přiděluje přístupy, archivuje.",
  deputy: "Zakládá zakázky a upravuje přidělené. Nepřiděluje přístupy.",
  viewer: "Jen čte přidělené zakázky a jejich historii.",
} as const;

export default async function DevIdentityPage() {
  // V produkčním režimu stránka neexistuje.
  if (identityMode() !== "dev") notFound();
  const [identities, current] = await Promise.all([listDevIdentities(), getCurrentActor()]);
  return (
    <>
      <PageHeader title="Fiktivní identita" lead="Jen pro vývoj s fiktivními daty. Toto NENÍ přihlášení ani zabezpečení." />
      <div className="mb-4 rounded-md border border-red-200 bg-signal-problem-bg px-3 py-2 text-sm text-signal-problem">
        Výběr uživatele bez hesla funguje jen ve vývojovém režimu. V produkčním sestavení je technicky vypnutý.
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {identities.map((u) => {
          const active = current?.id === u.id;
          return (
            <li key={u.id}>
              <form action={switchDevIdentityAction}>
                <input type="hidden" name="userId" value={u.id} />
                <button
                  type="submit"
                  aria-pressed={active}
                  className={`w-full rounded-xl border-2 bg-white p-4 text-left shadow-sm transition-colors hover:border-accent ${active ? "border-accent" : "border-transparent"}`}
                >
                  <span className="block text-base font-semibold text-slate-900">{u.displayName}</span>
                  <span className="mt-0.5 block text-sm font-medium text-accent-dark">{GLOBAL_ROLE_LABELS[u.globalRole]}</span>
                  <span className="mt-1 block text-xs text-slate-500">{ROLE_HINT[u.globalRole]}</span>
                  {active && <span className="mt-2 inline-block text-xs font-semibold text-signal-done">✓ Právě vybráno</span>}
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      {current && (
        <form action={clearDevIdentityAction} className="mt-4">
          <button type="submit" className={btnSecondary}>
            Zrušit výběr identity
          </button>
        </form>
      )}
    </>
  );
}
