// Generátor malých ZJEVNĚ FIKTIVNÍCH souborů pro vývoj a testy (R9 – žádné skutečné dokumenty).
// Obsahuje i jednoduchý zápis ZIP (pro XLSX/DOCX a pro testy podvržených souborů).
import zlib from "node:zlib";

const enc = new TextEncoder();

/** Jednostránkové PDF s několika řádky textu (jen ASCII – standardní písmo Helvetica). */
export function fictivePdf(lines: string[]): Uint8Array {
  const text = ["FIKTIVNI DOKUMENT - POUZE PRO VYVOJ", ...lines]
    .map((l, i) => `BT /F1 ${i === 0 ? 16 : 12} Tf 50 ${780 - i * 22} Td (${l.replace(/[()\\]/g, "")}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

function crcChunk(type: string, data: Uint8Array): Uint8Array {
  const t = enc.encode(type);
  const body = new Uint8Array(t.length + data.length);
  body.set(t);
  body.set(data, t.length);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(8 + data.length, zlib.crc32(body) >>> 0);
  return out;
}

/** Obrázek PNG – barevná plocha s pruhy (fiktivní „fotka“). */
export function fictivePng(width = 160, height = 120, rgb: [number, number, number] = [36, 99, 181]): Uint8Array {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const stripe = Math.floor((x + y) / 12) % 2 === 0;
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = stripe ? rgb[0] : 246;
      raw[o + 1] = stripe ? rgb[1] : 248;
      raw[o + 2] = stripe ? rgb[2] : 251;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    crcChunk("IHDR", ihdr),
    crcChunk("IDAT", zlib.deflateSync(raw)),
    crcChunk("IEND", new Uint8Array()),
  ];
  return concat(parts);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export interface ZipFileSpec {
  name: string;
  data: Uint8Array | string;
  /** Výchozí deflate. */
  store?: boolean;
  /** Jen pro testy: podvržené údaje v adresáři ZIP. */
  fakeUncompressedSize?: number;
  flags?: number;
}

/** Minimální zápis ZIP (bez ZIP64). */
export function makeZip(files: ZipFileSpec[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const comp = f.store ? data : new Uint8Array(zlib.deflateRawSync(data));
    const name = enc.encode(f.name);
    const crc = zlib.crc32(data) >>> 0;
    const usize = f.fakeUncompressedSize ?? data.length;
    const lh = new Uint8Array(30 + name.length);
    const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, f.flags ?? 0, true);
    l.setUint16(8, f.store ? 0 : 8, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, comp.length, true);
    l.setUint32(22, usize, true);
    l.setUint16(26, name.length, true);
    lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length);
    const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, f.flags ?? 0, true);
    c.setUint16(10, f.store ? 0 : 8, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, comp.length, true);
    c.setUint32(24, usize, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh, comp);
    centrals.push(ch);
    offset += lh.length + comp.length;
  }
  const cd = concat(centrals);
  const eocd = new Uint8Array(22);
  const e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cd.length, true);
  e.setUint32(16, offset, true);
  return concat([...locals, cd, eocd]);
}

const CT_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const CT_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

export function contentTypesXml(main: "xlsx" | "docx", extra = ""): string {
  const part = main === "xlsx" ? `<Override PartName="/xl/workbook.xml" ContentType="${CT_XLSX}"/>` : `<Override PartName="/word/document.xml" ContentType="${CT_DOCX}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/>${part}${extra}</Types>`;
}

/** Minimální sešit XLSX (struktura stačí pro uložení; obsah se v V2-2 nečte). */
export function fictiveXlsx(extra: ZipFileSpec[] = []): Uint8Array {
  return makeZip([
    { name: "[Content_Types].xml", data: contentTypesXml("xlsx") },
    { name: "xl/workbook.xml", data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="FIKTIVNI rozpocet" sheetId="1"/></sheets></workbook>' },
    { name: "xl/worksheets/sheet1.xml", data: '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>' },
    ...extra,
  ]);
}

export function fictiveDocx(extra: ZipFileSpec[] = []): Uint8Array {
  return makeZip([
    { name: "[Content_Types].xml", data: contentTypesXml("docx") },
    { name: "word/document.xml", data: '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>FIKTIVNI zapis z kontrolniho dne</w:t></w:r></w:p></w:body></w:document>' },
    ...extra,
  ]);
}

export function fictiveDxf(): Uint8Array {
  return enc.encode("999\nFIKTIVNI VYKRES\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n11\n100.0\n21\n50.0\n0\nENDSEC\n0\nEOF\n");
}
