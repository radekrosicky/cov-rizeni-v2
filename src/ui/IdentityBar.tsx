import Link from "next/link";
import { GLOBAL_ROLE_LABELS, type GlobalRole } from "@/domain/values";

/** Pruh nahoře: pravdivě říká, kdo je „přihlášen“ a že nejde o zabezpečení. */
export function IdentityBar({ mode, actor }: { mode: "dev" | "none"; actor: { displayName: string; globalRole: GlobalRole } | null }) {
  if (mode === "dev") {
    return (
      <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-700 px-4 py-2 text-xs text-white md:px-8">
        <strong className="font-bold tracking-wide">VÝVOJOVÁ IDENTITA – NENÍ ZABEZPEČENO – jen fiktivní data</strong>
        <span>
          {actor ? (
            <>
              Jste: <strong>{actor.displayName}</strong> · {GLOBAL_ROLE_LABELS[actor.globalRole]}
            </>
          ) : (
            "Nevybrána žádná identita"
          )}
        </span>
        <Link href="/vyvoj/identita" className="ml-auto inline-flex min-h-9 items-center rounded border border-white/70 px-3 font-semibold hover:bg-white/10">
          Přepnout
        </Link>
      </div>
    );
  }
  return (
    <div role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 md:px-8">
      <strong className="font-semibold">Vývojová verze.</strong> Bez skutečného přihlášení. Nevkládejte skutečné firemní údaje.
    </div>
  );
}
