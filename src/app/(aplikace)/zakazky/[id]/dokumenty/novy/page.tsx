import type { Metadata } from "next";
import Link from "next/link";
import { maxUploadBytes } from "@/domain/documents/fileKinds";
import { card } from "@/ui/styles";
import { loadDocuments } from "../data";
import { UploadForm } from "../UploadForm";

export const metadata: Metadata = { title: "Nahrát dokument" };

export default async function NewDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ druh?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const data = await loadDocuments(id);
  if (!data) return null;
  if (!data.manage) {
    return (
      <section className={card}>
        <p className="text-sm text-slate-600">Dokumenty této zakázky nemůžete nahrávat. Nahrává je správce nebo zástupce.</p>
      </section>
    );
  }
  return (
    <section className={card}>
      <Link href={`/zakazky/${id}/dokumenty`} className="mb-2 inline-flex min-h-9 items-center text-sm text-accent-dark hover:underline">
        ← Dokumenty
      </Link>
      <h2 className="mb-3 text-lg font-semibold">Nahrát dokument</h2>
      <UploadForm projectId={id} maxBytes={maxUploadBytes(process.env)} defaultCategory={sp.druh} />
    </section>
  );
}
