"use client";

// Nahrání dokumentu / nové revize. Soubor se posílá samostatnou adresou s průběžným zpracováním.
// „Uloženo“ až po potvrzení serverem; při chybě, přerušení nebo výpadku sítě se jasně ukáže, že NIC nebylo uloženo.
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { ACCEPT_ATTRIBUTE, formatBytes, titleFromFilename } from "@/domain/documents/fileKinds";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/domain/values";
import { encodeMeta, META_HEADER, UPLOAD_HEADER, uploadUrl } from "@/lib/uploadProtocol";
import { btnPrimary, btnSecondary, inputCls } from "@/ui/styles";

type State =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number }
  | { phase: "error"; message: string; fieldErrors: Record<string, string> };

export function UploadForm({
  projectId,
  maxBytes,
  newRevisionOf,
  defaultCategory,
}: {
  projectId: string;
  maxBytes: number;
  /** Nová revize existujícího dokumentu (jinak nový dokument). */
  newRevisionOf?: { documentId: string; version: number; title: string };
  defaultCategory?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  // Nahrávání potřebuje skript v prohlížeči. Dokud se formulář „neoživí“, tlačítko je vypnuté –
  // nic se nesmí odeslat naslepo (např. při pomalém spojení).
  const ready = useSyncExternalStore(
    () => () => {},
    () => true, // v prohlížeči po oživení
    () => false, // při vykreslení na serveru
  );
  const isRevision = !!newRevisionOf;
  const fieldErrors = state.phase === "error" ? state.fieldErrors : {};

  function onFile(file: File | undefined) {
    if (file && !isRevision && !titleTouched) setTitle(titleFromFilename(file.name));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    // Soubor přímo z výběru souboru (spolehlivé i u velkých souborů).
    const file = (form.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
    if (!file || file.size === 0) {
      setState({ phase: "error", message: "Vyberte soubor.", fieldErrors: { file: "Vyberte soubor." } });
      return;
    }
    if (file.size > maxBytes) {
      setState({ phase: "error", message: `Soubor má ${formatBytes(file.size)} – povolený limit je ${formatBytes(maxBytes)}. Nic nebylo odesláno.`, fieldErrors: { file: "Soubor je příliš velký." } });
      return;
    }
    const str = (k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : null);
    const meta = encodeMeta({
      documentId: newRevisionOf?.documentId ?? null,
      expectedVersion: newRevisionOf?.version ?? null,
      category: isRevision ? null : str("category"),
      title: isRevision ? null : str("title"),
      documentDate: str("documentDate"),
      revisionLabel: str("revisionLabel"),
      note: str("note"),
      filename: file.name,
    });

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", uploadUrl(projectId));
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.setRequestHeader(UPLOAD_HEADER, "1");
    xhr.setRequestHeader(META_HEADER, meta);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setState({ phase: "uploading", percent: Math.round((ev.loaded / ev.total) * 100) });
    };
    xhr.onload = () => {
      xhrRef.current = null;
      let body: { ok?: boolean; message?: string; fieldErrors?: Record<string, string>; documentId?: string; revisionNo?: number } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* nečitelná odpověď = chyba */
      }
      if (xhr.status === 201 && body.ok && body.documentId) {
        router.push(`/zakazky/${projectId}/dokumenty/${body.documentId}?ulozeno=${isRevision ? `revize-${body.revisionNo}` : "dokument"}`);
        router.refresh();
        return;
      }
      setState({
        phase: "error",
        message: body.message ?? (xhr.status === 413 ? "Soubor je příliš velký. Nic nebylo uloženo." : `Nahrání se nezdařilo (chyba ${xhr.status}). Nic nebylo uloženo.`),
        fieldErrors: body.fieldErrors ?? {},
      });
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setState({ phase: "error", message: "Spojení se přerušilo. NIC NEBYLO ULOŽENO – zkuste to znovu.", fieldErrors: {} });
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setState({ phase: "error", message: "Nahrávání jste zrušili. Nic nebylo uloženo.", fieldErrors: {} });
    };
    setState({ phase: "uploading", percent: 0 });
    xhr.send(file);
  }

  const uploading = state.phase === "uploading";
  const err = (k: string) =>
    fieldErrors[k] ? (
      <p id={`e-${k}`} className="mt-1 text-sm font-medium text-signal-problem">
        {fieldErrors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
      {state.phase === "error" && (
        <div role="alert" className="rounded-md border border-red-200 bg-signal-problem-bg px-3 py-2 text-sm font-medium text-signal-problem">
          {state.message}
        </div>
      )}
      <div>
        <label htmlFor="f-file" className="mb-1 block text-sm font-medium text-slate-800">
          Soubor *
        </label>
        <input
          id="f-file"
          name="file"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={uploading}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-sm text-slate-700 file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-accent file:px-4 file:text-sm file:font-semibold file:text-white"
          aria-invalid={!!fieldErrors.file}
        />
        <p className="mt-1 text-xs text-slate-500">PDF, XLSX, DOCX, JPG, PNG, WEBP, HEIC, TIFF, DWG, DXF · max. {formatBytes(maxBytes)} · na mobilu lze vyfotit</p>
        {err("file")}
      </div>
      {!isRevision && (
        <>
          <div>
            <label htmlFor="f-category" className="mb-1 block text-sm font-medium text-slate-800">
              Druh *
            </label>
            <select id="f-category" name="category" defaultValue={defaultCategory ?? "contract"} className={inputCls} disabled={uploading}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            {err("category")}
          </div>
          <div>
            <label htmlFor="f-title" className="mb-1 block text-sm font-medium text-slate-800">
              Název
            </label>
            <input
              id="f-title"
              name="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              className={inputCls}
              disabled={uploading}
            />
            <p className="mt-1 text-xs text-slate-500">Předvyplní se z názvu souboru. Dodatek smlouvy nahrajte jako samostatný dokument.</p>
          </div>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-documentDate" className="mb-1 block text-sm font-medium text-slate-800">
            Datum dokumentu
          </label>
          <input id="f-documentDate" name="documentDate" type="date" className={inputCls} disabled={uploading} />
          {err("documentDate")}
        </div>
        <div>
          <label htmlFor="f-revisionLabel" className="mb-1 block text-sm font-medium text-slate-800">
            Označení revize
          </label>
          <input id="f-revisionLabel" name="revisionLabel" placeholder="např. B" className={inputCls} disabled={uploading} />
        </div>
      </div>
      <div>
        <label htmlFor="f-note" className="mb-1 block text-sm font-medium text-slate-800">
          {isRevision ? "Co se v revizi změnilo" : "Poznámka"}
        </label>
        <textarea id="f-note" name="note" rows={2} className={`${inputCls} py-2`} disabled={uploading} />
      </div>
      {uploading && (
        <div role="status" aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
            <div className="h-full bg-accent transition-all" style={{ width: `${state.percent}%` }} />
          </div>
          <p className="mt-1 text-sm text-slate-700">Nahrávám… {state.percent} % (ještě NEULOŽENO)</p>
        </div>
      )}
      {!ready && (
        <p className="text-sm text-slate-600">
          Načítám formulář… Pokud se tlačítko neaktivuje, obnovte stránku (nahrávání potřebuje zapnutý JavaScript).
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={`${btnPrimary} w-full sm:w-auto`} disabled={uploading || !ready}>
          {!ready ? "Načítám…" : uploading ? "Nahrávám…" : isRevision ? "Nahrát novou revizi" : "Nahrát dokument"}
        </button>
        {uploading && (
          <button type="button" className={`${btnSecondary} w-full sm:w-auto`} onClick={() => xhrRef.current?.abort()}>
            Zrušit nahrávání
          </button>
        )}
      </div>
    </form>
  );
}
