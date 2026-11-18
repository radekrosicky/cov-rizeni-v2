import type { Metadata } from "next";
import Link from "next/link";
import { formatDateCz } from "@/domain/calendar/calendar";
import type { TodayTone } from "@/domain/material/today";
import { listTodayMaterial } from "@/server/app";
import { requireActor } from "@/server/identity/session";

export const metadata: Metadata = { title: "Co dnes řešit" };
// Počet zbývajících dní se počítá při každém otevření podle dnešního data (Europe/Prague).
export const dynamic = "force-dynamic";

// Jemné odlišení závažnosti: barevný proužek vlevo + barva časového údaje.
const TONE: Record<TodayTone, { bar: string; when: string }> = {
  problem: { bar: "border-l-signal-problem", when: "text-signal-problem" },
  risk: { bar: "border-l-signal-risk", when: "text-signal-risk" },
  unverified: { bar: "border-l-slate-300", when: "text-slate-500" },
};

export default async function TodayPage() {
  const actor = await requireActor();
  const { today, items, projectCount } = await listTodayMaterial(actor);
  return (
    <div data-wide>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
        <h1 className="text-2xl font-bold text-slate-900">Co dnes řešit</h1>
        <p className="text-sm text-slate-500">{formatDateCz(today)}</p>
      </div>
      {projectCount === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-700 shadow-sm">Nemáte přidělenou žádnou zakázku.</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-700 shadow-sm">Dnes není nic k řešení.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Akce na dnes">
          {items.map((it) => (
            <li key={it.needId}>
              <Link
                href={`/zakazky/${it.projectId}/material/${it.needId}`}
                className={`block h-full rounded-xl border-l-4 bg-white px-4 py-3 shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent ${TONE[it.tone].bar}`}
              >
                <span className="block text-lg font-semibold leading-snug text-slate-900">
                  {it.action}: {it.needName}
                </span>
                <span className="mt-1 block text-sm text-slate-600">
                  {it.projectName} · <span className={`font-semibold ${TONE[it.tone].when}`}>{it.when}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
