import type { Metadata } from "next";
import Link from "next/link";
import { formatDateCz } from "@/domain/calendar/calendar";
import { TODAY_GROUP_INFO, TODAY_GROUPS } from "@/domain/material/today";
import { listTodayMaterial, type TodayItem } from "@/server/app";
import { getCurrentActor, identityMode } from "@/server/identity/session";
import { IdentityGate } from "@/ui/Notices";
import { PageHeader } from "@/ui/PageHeader";
import { SignalLegend } from "@/ui/SignalLegend";
import { btnSecondary, card } from "@/ui/styles";
import { ScheduleBadge, TONE_CLS } from "./zakazky/[id]/material/ScheduleView";

export const metadata: Metadata = { title: "Co dnes řešit" };
export const dynamic = "force-dynamic";

function Item({ it }: { it: TodayItem }) {
  const s = it.schedule;
  const reason = s.warnings.find((w) => w.code !== "responsible_missing" && w.code !== "order_date_shifted")?.text;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{it.projectName}</p>
          <p className="text-base font-semibold text-slate-900">{it.needName}</p>
        </div>
        <ScheduleBadge schedule={s} />
      </div>
      <p className="mt-1 text-sm text-slate-800">{s.headline}</p>
      {reason && <p className="mt-0.5 text-sm text-slate-600">Proč: {reason}</p>}
      <p className="mt-1 text-xs text-slate-500">
        {s.orderBy ? `Objednat nejpozději ${formatDateCz(s.orderBy)} · ` : ""}
        {s.deliverBy ? `dodat do ${formatDateCz(s.deliverBy)} · ` : ""}
        {it.eventTitle ? `${it.eventTitle} · ` : ""}
        dodací lhůta {it.leadTime} · odpovědný:{" "}
        <span className={it.responsibleName ? "" : "font-semibold text-signal-risk"}>{it.responsibleName ?? "Nepřiřazeno"}</span>
      </p>
      <Link href={`/zakazky/${it.projectId}/material/${it.needId}`} className={`${btnSecondary} mt-2`}>
        Otevřít dodávku
      </Link>
    </li>
  );
}

export default async function TodayPage() {
  const actor = await getCurrentActor();
  if (!actor) return <IdentityGate mode={identityMode()} />;
  const data = await listTodayMaterial(actor);
  const total = TODAY_GROUPS.reduce((n, g) => n + data.groups[g].length, 0);
  return (
    <>
      <PageHeader title="Co dnes řešit" lead={`Materiál napříč vašimi zakázkami – stav k ${formatDateCz(data.today)}. Co objednat, kdy a proč.`} />
      <div className="space-y-4">
        <p role="note" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          Přehled se počítá z aktuálních termínů událostí, dodacích lhůt a rezerv. <strong>Objednávky aplikace zatím neeviduje</strong> – „Ověřte stav objednávky“
          neznamená, že objednáno není.
        </p>
        {data.projectCount === 0 ? (
          <section className={card}>
            <p className="text-sm text-slate-700">Nemáte přidělenou žádnou zakázku. Přístup přiděluje správce.</p>
          </section>
        ) : total === 0 ? (
          <section className={card}>
            <p className="text-sm text-slate-700">V materiálu dnes není nic k řešení.</p>
          </section>
        ) : (
          TODAY_GROUPS.filter((g) => data.groups[g].length > 0).map((g) => {
            const info = TODAY_GROUP_INFO[g];
            return (
              <section key={g} className={card} aria-labelledby={`g-${g}`}>
                <h2 id={`g-${g}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
                  <span className={`rounded-full px-2.5 py-0.5 text-sm ${TONE_CLS[info.tone]}`}>{data.groups[g].length}</span>
                  {info.title}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{info.why}</p>
                <ul className="mt-2 divide-y divide-slate-100">
                  {data.groups[g].map((it) => (
                    <Item key={it.needId} it={it} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
        <section className={card}>
          <h2 className="text-sm font-semibold text-slate-900">Další akce přibudou v dalších etapách</h2>
          <p className="mt-1 text-sm text-slate-600">Připravenost stavby, úkoly a změny z kontrolních dnů zde zatím nejsou – tato část ještě není naprogramovaná.</p>
        </section>
        <SignalLegend />
      </div>
    </>
  );
}
