// Společné typy pro rozpočet. Čistý TypeScript (bez Node.js, knihoven a databáze).

/** Buňka tak, jak ji vrátí čtení XLSX: hodnota beze změny + příznaky ze struktury listu. */
export interface Cell {
  value: string | number | boolean | null;
  /** Datum (value je pak ISO text RRRR-MM-DD). */
  date?: boolean;
  /** Buňka obsahuje vzorec (value = poslední uložený výsledek, pokud existuje). */
  formula?: boolean;
  /** Chybová hodnota Excelu (#REF!, #DIV/0! …). */
  error?: string;
}

/** Řádek listu: písmeno sloupce → buňka (jen neprázdné buňky). */
export type Row = Record<string, Cell>;

export const ROLES = ["code", "description", "unit", "quantity", "unitPrice", "totalPrice"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  code: "Kód",
  description: "Popis položky",
  unit: "MJ",
  quantity: "Množství",
  unitPrice: "Jednotková cena",
  totalPrice: "Cena celkem",
};

export interface SheetMapping {
  sheetName: string;
  /** Řádek záhlaví (jen informace pro dohledatelnost). */
  headerRow: number | null;
  /** První řádek s daty (řádky nad ním se neimportují). */
  firstDataRow: number;
  columns: Partial<Record<Role, string>>;
}
