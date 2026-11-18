// Stažení / otevření souboru revize. Při KAŽDÉM požadavku: identita + přístup ke konkrétní zakázce
// + revize musí patřit dokumentu této zakázky (jinak 404 – zakázka „neexistuje“).
import { Readable } from "node:stream";
import { openRevisionFile } from "@/server/app";
import { DomainError } from "@/server/errors";
import { getCurrentActor } from "@/server/identity/session";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Soubor nebyl nalezen.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** Jméno souboru v hlavičce: ASCII náhrada + přesné UTF-8 (RFC 6266 / 5987). */
function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "_") || "soubor";
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const actor = await getCurrentActor();
  if (!actor) return notFound();
  const { id, revisionId } = await params;
  let file;
  try {
    file = await openRevisionFile(actor, id, revisionId);
  } catch (e) {
    if (e instanceof DomainError) return notFound();
    throw e;
  }
  // „Otevřít“ jen u bezpečně zobrazitelných formátů (PDF, JPG, PNG, WEBP); ostatní vždy stáhnout.
  const inline = new URL(req.url).searchParams.get("zobrazit") === "1" && file.info.inline;
  const headers = new Headers({
    "content-type": file.info.contentType,
    "content-length": String(file.sizeBytes),
    "content-disposition": contentDisposition(inline ? "inline" : "attachment", file.revision.originalFilename),
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
  });
  // Obrázky v izolovaném režimu (nemohou spustit nic v aplikaci). PDF zobrazuje vestavěný prohlížeč PDF,
  // který v izolovaném režimu nefunguje; bezpečnost zajišťuje ověřený obsah (%PDF-), pevný typ a nosniff.
  if (inline && file.revision.fileKind !== "pdf") headers.set("content-security-policy", "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  return new Response(Readable.toWeb(file.stream) as ReadableStream, { status: 200, headers });
}
