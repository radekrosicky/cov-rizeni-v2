import { GLOBAL_ROLE_LABELS, type GlobalRole } from "@/domain/values";

/** Pruh nahoře: pravdivě říká, kdo je „přihlášen“, že nejde o zabezpečení, a umožní odhlášení. */
export function IdentityBar({ actor, signOut }: { actor: { displayName: string; globalRole: GlobalRole }; signOut: () => Promise<void> }) {
  return (
    <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-700 px-4 py-2 text-xs text-white md:px-8">
      <strong className="font-bold tracking-wide">POUZE TESTOVACÍ REŽIM – nejde o zabezpečené přihlášení</strong>
      <span>
        Jste: <strong>{actor.displayName}</strong> · {GLOBAL_ROLE_LABELS[actor.globalRole]}
      </span>
      <form action={signOut} className="ml-auto">
        <button type="submit" className="inline-flex min-h-9 items-center rounded border border-white/70 px-3 font-semibold hover:bg-white/10">
          Odhlásit se
        </button>
      </form>
    </div>
  );
}
