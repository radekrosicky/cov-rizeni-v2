// Dohoda mezi formulářem v prohlížeči a adresou pro nahrávání (POST /zakazky/<id>/dokumenty/nahrat).
// Soubor = tělo požadavku (application/octet-stream); ostatní údaje = JSON v Base64 v hlavičce.
export const UPLOAD_HEADER = "x-cov-upload";
export const META_HEADER = "x-cov-meta";

export interface UploadMetaPayload {
  documentId?: string | null;
  expectedVersion?: number | null;
  category?: string | null;
  title?: string | null;
  documentDate?: string | null;
  revisionLabel?: string | null;
  note?: string | null;
  filename: string;
}

/** UTF-8 → Base64 (hlavičky smí obsahovat jen ASCII; české znaky v názvech se tak přenesou bezpečně). */
export function encodeMeta(meta: UploadMetaPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const uploadUrl = (projectId: string) => `/zakazky/${projectId}/dokumenty/nahrat`;
export const fileUrl = (projectId: string, revisionId: string, open = false) =>
  `/zakazky/${projectId}/dokumenty/soubor/${revisionId}${open ? "?zobrazit=1" : ""}`;
