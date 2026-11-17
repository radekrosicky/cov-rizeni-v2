// Povolené druhy souborů a jejich rozpoznání PODLE OBSAHU (ne podle přípony ani údaje prohlížeče).
// Seznam povolených – vše ostatní se odmítne (ZIP, HTML, SVG, skripty, spustitelné soubory…).
// Čisté funkce bez Node.js API: vstupem jsou první bajty souboru.
import type { FileKind } from "../values.ts";

export interface FileKindInfo {
  label: string;
  extensions: readonly string[];
  /** Content-Type při stahování – určuje ho server, nikdy uživatel. */
  contentType: string;
  /** Smí se otevřít přímo v prohlížeči (jen bezpečně zobrazitelné formáty). */
  inline: boolean;
}

export const FILE_KIND_INFO: Record<FileKind, FileKindInfo> = {
  pdf: { label: "PDF", extensions: ["pdf"], contentType: "application/pdf", inline: true },
  xlsx: { label: "Excel (XLSX)", extensions: ["xlsx"], contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", inline: false },
  docx: { label: "Word (DOCX)", extensions: ["docx"], contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", inline: false },
  jpeg: { label: "Obrázek JPG", extensions: ["jpg", "jpeg"], contentType: "image/jpeg", inline: true },
  png: { label: "Obrázek PNG", extensions: ["png"], contentType: "image/png", inline: true },
  webp: { label: "Obrázek WEBP", extensions: ["webp"], contentType: "image/webp", inline: true },
  heic: { label: "Fotografie HEIC", extensions: ["heic", "heif"], contentType: "image/heic", inline: false },
  tiff: { label: "Obrázek TIFF", extensions: ["tif", "tiff"], contentType: "image/tiff", inline: false },
  // Výkresy: jen uložit a stáhnout, nic se nevykresluje ani neinterpretuje.
  dwg: { label: "Výkres DWG", extensions: ["dwg"], contentType: "application/octet-stream", inline: false },
  dxf: { label: "Výkres DXF", extensions: ["dxf"], contentType: "application/octet-stream", inline: false },
};

/** Hodnota pro atribut `accept` výběru souboru (jen nápověda pro prohlížeč – rozhoduje server). */
export const ACCEPT_ATTRIBUTE = Object.values(FILE_KIND_INFO)
  .flatMap((k) => k.extensions.map((e) => `.${e}`))
  .join(",");

/** Kolik prvních bajtů stačí k rozpoznání. */
export const SNIFF_BYTES = 4096;

const ascii = (b: Uint8Array, start: number, len: number) => String.fromCharCode(...b.subarray(start, start + len));
const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"]);

export type SniffResult = FileKind | "ooxml" | null;

/**
 * Rozpozná druh podle prvních bajtů. XLSX/DOCX vrátí jako „ooxml“ – je to ZIP kontejner,
 * jehož strukturu musí ještě ověřit server (inspectOoxml). Jinak null = nepovolený / neznámý obsah.
 */
export function sniffFileKind(head: Uint8Array): SniffResult {
  if (head.length < 4) return null;
  if (ascii(head, 0, 5) === "%PDF-") return "pdf";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return "webp";
  if (ascii(head, 4, 4) === "ftyp" && HEIC_BRANDS.has(ascii(head, 8, 4))) return "heic";
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (/^AC10\d\d$/.test(ascii(head, 0, 6))) return "dwg";
  if (ascii(head, 0, 18) === "AutoCAD Binary DXF") return "dxf";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "ooxml";
  if (isTextDxf(head)) return "dxf";
  return null;
}

/** Textové DXF: čitelný text bez nulových bajtů, začíná skupinou „0 / SECTION“ nebo komentářem „999“. */
function isTextDxf(head: Uint8Array): boolean {
  if (head.includes(0)) return false;
  for (const byte of head) if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
  const text = ascii(head, 0, Math.min(head.length, 512));
  return /^\s*0\s*\r?\n\s*SECTION\s*\r?\n/.test(text) || /^\s*999\s*\r?\n/.test(text);
}

export function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename.trim());
  return m ? m[1]!.toLowerCase() : "";
}

/** Druh určený z obsahu musí odpovídat příponě (např. PNG přejmenované na .pdf se odmítne). */
export function extensionMatches(kind: FileKind, filename: string): boolean {
  return FILE_KIND_INFO[kind].extensions.includes(extensionOf(filename));
}

/** Očekávaný druh kontejneru Office podle přípony (null = přípona nepatří XLSX/DOCX). */
export function ooxmlKindForExtension(filename: string): "xlsx" | "docx" | null {
  const ext = extensionOf(filename);
  return ext === "xlsx" ? "xlsx" : ext === "docx" ? "docx" : null;
}

/**
 * Očištění názvu souboru – slouží JEN k zobrazení a jménu při stažení (úložiště používá vlastní klíč).
 * Odstraní cestu, lomítka, řídicí znaky; zkrátí na 255 znaků se zachováním přípony.
 */
export function sanitizeFilename(input: string): string {
  const base = input.split(/[/\\]/).pop() ?? "";
  let name = base.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  name = name.replace(/^\.+/, "");
  if (!name) name = "soubor";
  if (name.length > 255) {
    const ext = extensionOf(name);
    name = name.slice(0, 255 - (ext ? ext.length + 1 : 0)) + (ext ? `.${ext}` : "");
  }
  return name;
}

/** Název dokumentu předvyplněný z názvu souboru (bez přípony). */
export function titleFromFilename(filename: string): string {
  return sanitizeFilename(filename).replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").trim() || "Dokument";
}

/** Limit velikosti souboru z MAX_UPLOAD_MB (výchozí 50 MB; povoleno 1–500). */
export function maxUploadBytes(env: Record<string, string | undefined>): number {
  const n = Number(env.MAX_UPLOAD_MB);
  const mb = Number.isFinite(n) && n >= 1 && n <= 500 ? Math.floor(n) : 50;
  return mb * 1024 * 1024;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
