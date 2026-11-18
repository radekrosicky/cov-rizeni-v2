import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GLOBAL_ROLE_LABELS } from "@/domain/values";
import { listDevIdentities } from "@/server/app";
import { getCurrentActor, identityMode } from "@/server/identity/session";
import { signInDevAction } from "./actions";

export const metadata: Metadata = { title: "Přihlášení" };
export const dynamic = "force-dynamic";

const ROLE_HINT = {
  admin: "Vidí a smí vše, přiděluje přístupy, archivuje.",
  deputy: "Zakládá zakázky a upravuje přidělené.",
  viewer: "Jen čte přidělené zakázky.",
} as const;

/** Vstupní obrazovka. Bez přihlášení je to jediná dostupná stránka (hlídá proxy i rozvržení aplikace). */
export default async function LoginPage() {
  const mode = identityMode();
  if (mode === "dev" && (await getCurrentActor())) redirect("/");
  const identities = mode === "dev" ? await listDevIdentities() : [];
  return (
    <main className="flex min-h-screen items-start justify-center bg-nav px-4 py-10 md:items-center">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center text-white">
          <h1 className="text-3xl font-bold">ČOV Řízení 2.0</h1>
          <p className="mt-1 text-sm text-slate-300">Řízení realizací čistíren odpadních vod</p>
        </div>
        <section className="rounded-xl bg-white p-5 shadow-lg md:p-6">
          {mode === "dev" ? (
            <>
              <p role="note" className="rounded-md bg-red-700 px-3 py-2 text-center text-sm font-bold tracking-wide text-white">
                POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení
              </p>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">Vyberte fiktivní identitu</h2>
              <p className="mt-1 text-sm text-slate-600">Jen fiktivní uživatelé a fiktivní data. Skutečné přihlášení e-mailem a heslem bude samostatná etapa.</p>
              <ul className="mt-4 space-y-2">
                {identities.map((u) => (
                  <li key={u.id}>
                    <form action={signInDevAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button
                        type="submit"
                        className="flex min-h-14 w-full flex-col items-start rounded-lg border border-slate-200 px-4 py-2.5 text-left transition-colors hover:border-accent hover:bg-slate-50"
                      >
                        <span className="text-base font-semibold text-slate-900">{u.displayName}</span>
                        <span className="text-xs text-slate-500">
                          {GLOBAL_ROLE_LABELS[u.globalRole]} · {ROLE_HINT[u.globalRole]}
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Přihlášení zatím není k dispozici</h2>
              <p className="mt-2 text-sm text-slate-600">
                Aplikace je uzavřená. Skutečné přihlášení e-mailem a heslem se teprve připravuje, proto se nezobrazují žádná data.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
