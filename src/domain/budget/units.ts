// Sjednocení měrných jednotek. Neznámá jednotka se NEPŘEVÁDÍ – zůstane původní a jde k ruční kontrole.
const UNIT_MAP: Record<string, string> = {
  ks: "ks", "ks.": "ks", kus: "ks", kusy: "ks", kusů: "ks", pc: "ks", pcs: "ks",
  m: "m", "bm": "m", "m.": "m",
  m2: "m²", "m²": "m²", "m^2": "m²",
  m3: "m³", "m³": "m³", "m^3": "m³",
  kpl: "kpl", "kpl.": "kpl", komplet: "kpl", soubor: "kpl", sada: "kpl", soub: "kpl",
  kg: "kg", t: "t", tun: "t",
  h: "h", hod: "h", "hod.": "h", hodina: "h", hodin: "h", nh: "h", "Nh": "h",
  l: "l", litr: "l",
};

export function normalizeUnit(raw: string | number | boolean | null | undefined): { unit: string | null; known: boolean; raw: string | null } {
  if (raw === null || raw === undefined || raw === "") return { unit: null, known: false, raw: null };
  const r = String(raw).trim();
  if (!r) return { unit: null, known: false, raw: null };
  const key = r.toLowerCase().replace(/\s+/g, "");
  const unit = UNIT_MAP[key] ?? UNIT_MAP[r] ?? null;
  return { unit, known: unit !== null, raw: r };
}
