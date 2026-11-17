import type { ReactNode } from "react";
import { MainNav } from "./MainNav";

/** Rám aplikace: navigace + pruh s identitou + obsah. */
export function AppShell({ children, topBar }: { children: ReactNode; topBar: ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-nav text-slate-200 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="px-4 pt-3 pb-2 md:px-5 md:pt-6 md:pb-6">
          <div className="text-base font-bold text-white md:text-lg">ČOV Řízení 2.0</div>
          <div className="hidden text-xs text-slate-400 md:block">Řízení realizací ČOV</div>
        </div>
        <MainNav />
      </aside>
      <div className="min-w-0 flex-1">
        {topBar}
        <main className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
