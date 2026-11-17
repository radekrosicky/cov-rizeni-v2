import type { Metadata } from "next";
import Link from "next/link";
import { FILE_KIND_INFO, formatBytes } from "@/domain/documents/fileKinds";
import { formatDateCz } from "@/domain/calendar/calendar";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from "@/domain/values";
import { fileUrl } from "@/lib/uploadProtocol";
import { btnPrimary, btnSecondary, card } from "@/ui/styles";
import { loadDocuments } from "./data";

export const metadata: Metadata = { title: "Dokumenty" };

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).format(d);

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ druh?: string; archiv?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await loadDocuments(id);
  if (!data) return null;
  const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(sp.druh ?? "") ? (sp.druh as DocumentCategory) : null;
  const showArchived = sp.archiv === "1";
  const active = data.documents.filter((d) => d.status === "active");
  const archived = data.documents.filter((d) => d.status === "archived");
  const visible = (showArchived ? archived : active).filter((d) => !category || d.category === category);
  const counts = new Map(DOCUMENT_CATEGORIES.map((c) => [c, active.filter((d) => d.category === c).length]));
  const base = `/zakazky/${id}/dokumenty`;
  const q = (c: string | null, a = showArchived) => {
    const p = new URLSearchParams();
    if (c) p.set("druh", c);
    if (a) p.set("archiv", "1");
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{showArchived ? "Archivované dokumenty" : "Dokumenty"}</h2>
        {data.manage && !showArchived && (
          <Link href={`${base}/novy${category ? `?druh=${category}` : ""}`} className={btnPrimary}>
            + Nahrát dokument
          </Link>
        )}
      </div>

      <nav aria-label="Filtr podle druhu" className="flex flex-wrap gap-2">
        <FilterChip href={q(null)} active={!category} label={`Vše (${showArchived ? archived.length : active.length})`} />
        {DOCUMENT_CATEGORIES.filter((c) => (counts.get(c) ?? 0) > 0 || c === category).map((c) => (
          <FilterChip key={c} href={q(c)} active={category === c} label={`${DOCUMENT_CATEGORY_LABELS[c]} (${counts.get(c) ?? 0})`} />
        ))}
      </nav>

      {visible.length === 0 ? (
        <section className={card}>
          <p className="text-sm text-slate-700">{showArchived ? "Žádné archivované dokumenty." : category ? "V tomto druhu zatím nejsou žádné dokumenty." : "Zatím žádné dokumenty."}</p>
          {!data.manage && !showArchived && <p className="mt-1 text-sm text-slate-500">Dokumenty nahrává správce nebo zástupce.</p>}
        </section>
      ) : (
        <ul className="space-y-3">
          {visible.map((d) => {
            const cur = d.current;
            const info = cur ? FILE_KIND_INFO[cur.fileKind] : null;
            return (
              <li key={d.id} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link href={`${base}/${d.id}`} className="min-w-0 text-base font-semibold text-slate-900 hover:text-accent-dark hover:underline">
                    {d.title}
                  </Link>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{DOCUMENT_CATEGORY_LABELS[d.category]}</span>
                </div>
                {cur && (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-medium text-signal-done">Aktuální: rev. {cur.revisionNo}{cur.revisionLabel ? ` (${cur.revisionLabel})` : ""}</span>
                    {" · "}
                    {cur.documentDate ? `datum ${formatDateCz(cur.documentDate)}` : "datum neuvedeno"} · {info?.label} · {formatBytes(cur.sizeBytes)}
                  </p>
                )}
                {cur && (
                  <p className="text-xs text-slate-500">
                    Nahrál(a) {cur.uploadedByName} {fmtTime(cur.uploadedAt)}
                    {d.revisionCount > 1 && (
                      <>
                        {" · "}
                        <Link href={`${base}/${d.id}`} className="font-semibold text-accent-dark hover:underline">
                          {d.revisionCount} revize
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {cur && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {info?.inline && (
                      <a href={fileUrl(id, cur.id, true)} target="_blank" rel="noopener" className={btnSecondary}>
                        Otevřít
                      </a>
                    )}
                    <a href={fileUrl(id, cur.id)} className={btnSecondary} download>
                      Stáhnout
                    </a>
                    <Link href={`${base}/${d.id}`} className={btnSecondary}>
                      Detail a revize
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm">
        {showArchived ? (
          <Link href={q(category, false)} className="text-accent-dark hover:underline">
            ← Zpět na platné dokumenty
          </Link>
        ) : archived.length > 0 ? (
          <Link href={q(category, true)} className="text-accent-dark hover:underline">
            Archivované dokumenty ({archived.length})
          </Link>
        ) : null}
      </p>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm ${active ? "border-accent bg-accent text-white" : "border-slate-300 bg-white text-slate-700 hover:border-accent"}`}
    >
      {label}
    </Link>
  );
}
