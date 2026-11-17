// Nahrání souboru dokumentu (nový dokument i nová revize) – samostatná adresa s PRŮBĚŽNÝM zpracováním.
// Proč ne serverová akce: ta načítá celý požadavek do paměti a její limit platí pro všechny formuláře
// (viz docs/DATABAZE-V2-2.md, kap. 5). Zde se soubor zapisuje po částech a nahrávání se přeruší hned
// po překročení limitu (MAX_UPLOAD_MB, výchozí 50 MB).
//
// Ochrany: CSRF (Origin + povinná vlastní hlavička), identita, oprávnění podle KONKRÉTNÍ zakázky (ve službě),
// kontrola typu podle obsahu, žádné přepsání existujícího souboru, úklid při chybě či přerušení.
import { maxUploadBytes } from "@/domain/documents/fileKinds";
import { isSameOriginRequest } from "@/lib/requestOrigin";
import { META_HEADER, UPLOAD_HEADER } from "@/lib/uploadProtocol";
import { uploadDocumentRevision, type UploadMeta } from "@/server/app";
import { DomainError } from "@/server/errors";
import { getCurrentActor } from "@/server/identity/session";

export const dynamic = "force-dynamic";

const STATUS: Record<DomainError["code"], number> = { validation: 422, not_found: 404, forbidden: 403, conflict: 409, too_large: 413 };

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function parseMeta(raw: string | null): UploadMeta | null {
  if (!raw || raw.length > 16_384) return null;
  try {
    const m = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)))) as Record<string, unknown>;
    const s = (k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
    const filename = s("filename");
    if (!filename) return null;
    return {
      documentId: s("documentId"),
      expectedVersion: typeof m.expectedVersion === "number" && Number.isInteger(m.expectedVersion) ? m.expectedVersion : null,
      category: s("category"),
      title: s("title"),
      documentDate: s("documentDate"),
      revisionLabel: s("revisionLabel"),
      note: s("note"),
      filename,
    };
  } catch {
    return null;
  }
}

async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 1) CSRF: požadavek jen z naší stránky; vlastní hlavičku cizí stránka bez souhlasu serveru neodešle.
  if (req.headers.get(UPLOAD_HEADER) !== "1" || !isSameOriginRequest(req.headers, process.env)) {
    return json(403, { ok: false, message: "Požadavek byl odmítnut (neplatný původ)." });
  }
  // 2) Identita (v produkci zatím žádná → nic se nenahraje).
  const actor = await getCurrentActor();
  if (!actor) return json(401, { ok: false, message: "Nejste přihlášen(a)." });

  // 3) Rychlé odmítnutí podle ohlášené velikosti (skutečná velikost se hlídá i během přenosu).
  const limit = maxUploadBytes(process.env);
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > limit) {
    return json(413, { ok: false, message: `Soubor je větší než povolený limit ${Math.round(limit / 1024 / 1024)} MB. Nic nebylo uloženo.` });
  }
  if ((req.headers.get("content-type") ?? "").split(";")[0] !== "application/octet-stream" || !req.body) {
    return json(400, { ok: false, message: "Neplatný požadavek." });
  }
  const meta = parseMeta(req.headers.get(META_HEADER));
  if (!meta) return json(400, { ok: false, message: "Chybí údaje o souboru." });

  const { id } = await params;
  try {
    const r = await uploadDocumentRevision(actor, id, meta, chunksOf(req.body));
    return json(201, { ok: true, ...r });
  } catch (e) {
    if (e instanceof DomainError) return json(STATUS[e.code], { ok: false, message: e.message, fieldErrors: e.fieldErrors });
    console.error(e);
    return json(500, { ok: false, message: "Nahrání se nezdařilo. Nic nebylo uloženo." });
  }
}
