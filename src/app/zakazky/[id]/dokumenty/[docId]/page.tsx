import type { Metadata } from "next";
import Link from "next/link";
import { FILE_KIND_INFO, formatBytes, maxUploadBytes } from "@/domain/documents/fileKinds";
import { formatDateCz } from "@/domain/calendar/calendar";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/domain/values";
import { fileUrl } from "@/lib/uploadProtocol";
import { ActionForm, SelectField, TextArea, TextField } from "@/ui/Form";
import { SavedNotice } from "@/ui/Notices";
import { btnDanger, btnSecondary, card } from "@/ui/styles";
import { archiveDocumentAction, setCurrentRevisionAction, unarchiveDocumentAction, updateDocumentInfoAction } from "../../../documentActions";
import { loadDocument } from "../data";
import { UploadForm } from "../UploadForm";

export const metadata: Metadata = { title: "Dokument" };

const SAVED: Record<string, string> = {
  dokument: "Dokument byl nahrán a uložen. Revize 1 je aktuální.",
  aktualni: "Aktuální revize byla změněna. Důvod je v historii.",
  udaje: "Údaje dokumentu byly uloženy.",
  archiv: "Dokument byl archivován. Soubory zůstávají dohledatelné.",
  obnoven: "Dokument byl obnoven z archivu.",
};

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ ulozeno?: string }>;
}) {
  const [{ id, docId }, sp] = await Promise.all([params, searchParams]);
  const data = await loadDocument(id, docId);
  if (!data) return null;
  const { document: d, revisions, manage } = data;
  const saved = sp.ulozeno ?? "";
  const savedText = saved.startsWith("revize-") ? `Nová revize ${saved.slice(7)} byla nahrána a je aktuální. Předchozí revize zůstávají dohledatelné.` : SAVED[saved];

  return (
    <div className="space-y-4">
      <Link href={`/zakazky/${id}/dokumenty`} className="inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Dokumenty
      </Link>
      <SavedNotice show={!!savedText}>{savedText}</SavedNotice>

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="min-w-0 text-xl font-bold text-slate-900">{d.title}</h2>
          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{DOCUMENT_CATEGORY_LABELS[d.category]}</span>
        </div>
        {d.note && <p className="mt-1 text-sm text-slate-700">{d.note}</p>}
        {d.status === "archived" && (
          <p className="mt-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-800">
            <strong>Archivováno</strong> {d.archivedAt ? fmtTime(d.archivedAt) : ""}. Důvod: {d.archiveReason}
          </p>
        )}
      </section>

      <section className={card} aria-labelledby="revize-h">
        <h3 id="revize-h" className="mb-2 text-lg font-semibold">
          Revize ({revisions.length})
        </h3>
        <ol className="divide-y divide-slate-100">
          {revisions.map((r) => {
            const info = FILE_KIND_INFO[r.fileKind];
            return (
              <li key={r.id} className="py-3" data-revision={r.revisionNo}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    Rev. {r.revisionNo}
                    {r.revisionLabel ? ` (${r.revisionLabel})` : ""}
                  </span>
                  {r.isCurrent ? (
                    <span className="rounded-full bg-signal-done-bg px-2.5 py-0.5 text-xs font-semibold text-signal-done">Aktuální</span>
                  ) : (
                    <span className="rounded-full bg-signal-unverified-bg px-2.5 py-0.5 text-xs font-semibold text-signal-unverified">Nahrazeno</span>
                  )}
                </div>
                <p className="mt-1 break-words text-sm text-slate-700">
                  {r.originalFilename} · {info.label} · {formatBytes(r.sizeBytes)} · {r.documentDate ? `datum ${formatDateCz(r.documentDate)}` : "datum neuvedeno"}
                </p>
                <p className="text-xs text-slate-500">
                  Nahrál(a) {r.uploadedByName} {fmtTime(r.uploadedAt)}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {info.inline && (
                    <a href={fileUrl(id, r.id, true)} target="_blank" rel="noopener" className={btnSecondary}>
                      Otevřít
                    </a>
                  )}
                  <a href={fileUrl(id, r.id)} className={btnSecondary} download>
                    Stáhnout
                  </a>
                </div>
                {manage && !r.isCurrent && (
                  <details className="mt-2">
                    <summary className="inline-flex min-h-9 cursor-pointer items-center text-sm font-semibold text-accent-dark">Označit jako aktuální…</summary>
                    <div className="mt-2">
                      <ActionForm action={setCurrentRevisionAction.bind(null, id, d.id, r.id)} submitLabel={`Označit rev. ${r.revisionNo} jako aktuální`} submitClassName={btnSecondary}>
                        <input type="hidden" name="version" value={d.version} />
                        <TextArea name="reason" label="Důvod" required />
                      </ActionForm>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {manage && (
        <section className={card}>
          <h3 className="mb-1 text-lg font-semibold">Nahrát novou revizi</h3>
          <p className="mb-3 text-sm text-slate-600">Nová revize se stane aktuální. Předchozí zůstanou uložené jako „Nahrazeno“.</p>
          <UploadForm projectId={id} maxBytes={maxUploadBytes(process.env)} newRevisionOf={{ documentId: d.id, version: d.version, title: d.title }} />
        </section>
      )}

      {manage && (
        <details className={card}>
          <summary className="cursor-pointer text-lg font-semibold">Upravit údaje dokumentu</summary>
          <div className="mt-3">
            <ActionForm action={updateDocumentInfoAction.bind(null, id, d.id)} submitLabel="Uložit údaje" submitClassName={btnSecondary}>
              <input type="hidden" name="version" value={d.version} />
              <TextField name="title" label="Název" required defaultValue={d.title} />
              <SelectField name="category" label="Druh" defaultValue={d.category} options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABELS[c] }))} />
              <TextArea name="note" label="Poznámka" defaultValue={d.note} />
            </ActionForm>
          </div>
        </details>
      )}

      {manage && (
        <details className={card}>
          <summary className="cursor-pointer text-lg font-semibold">Archivovat dokument</summary>
          <p className="mb-3 mt-1 text-sm text-slate-600">Dokument zmizí ze seznamu platných dokumentů. Nic se nemaže. Vyžaduje důvod.</p>
          <ActionForm action={archiveDocumentAction.bind(null, id, d.id)} submitLabel="Archivovat" submitClassName={btnDanger}>
            <input type="hidden" name="version" value={d.version} />
            <TextArea name="reason" label="Důvod archivace" required />
          </ActionForm>
        </details>
      )}

      {d.status === "archived" && data.canUnarchive && (
        <section className={card}>
          <h3 className="mb-2 text-lg font-semibold">Obnovit z archivu</h3>
          <ActionForm action={unarchiveDocumentAction.bind(null, id, d.id)} submitLabel="Obnovit dokument" submitClassName={btnSecondary}>
            <input type="hidden" name="version" value={d.version} />
            <TextArea name="reason" label="Důvod obnovení" required />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
