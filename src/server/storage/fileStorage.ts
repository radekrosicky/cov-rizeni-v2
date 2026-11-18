// Rozhraní úložiště souborů dokumentů. Aplikace pracuje JEN s tímto rozhraním –
// místní vývojové úložiště (LocalFileStorage) se později vymění za zabezpečené firemní úložiště.
//
// Zásady:
//  - soubor se nejdřív průběžně přijme do DOČASNÉHO souboru (limit velikosti hlídán za běhu),
//  - na konečný klíč se přesune jen pokud tam ještě nic není (NIKDY nepřepsat existující soubor),
//  - klíč generuje server; jméno od uživatele se do cesty nikdy nedostane.
import type { Readable } from "node:stream";

export interface ReceivedFile {
  /** Identifikátor dočasného souboru (jen pro toto úložiště). */
  tempId: string;
  sizeBytes: number;
  sha256: string;
  /** První bajty souboru (pro rozpoznání druhu podle obsahu). */
  head: Uint8Array;
}

export class UploadTooLargeError extends Error {
  readonly limitBytes: number;
  constructor(limitBytes: number) {
    super("Soubor překračuje povolenou velikost.");
    this.limitBytes = limitBytes;
    this.name = "UploadTooLargeError";
  }
}

export class StorageKeyExistsError extends Error {
  constructor(key: string) {
    super(`Soubor s klíčem ${key} už existuje – nepřepisuje se.`);
    this.name = "StorageKeyExistsError";
  }
}

export interface FileStorage {
  /** Průběžně přijme data do dočasného souboru. Při překročení limitu nebo přerušení dočasný soubor smaže a vyhodí chybu. */
  receive(body: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, limitBytes: number): Promise<ReceivedFile>;
  /** Přečte úsek dočasného souboru (kontrola struktury XLSX/DOCX). */
  readTempRange(tempId: string, start: number, length: number): Promise<Uint8Array>;
  /** Přesune dočasný soubor na konečný klíč – jen pokud klíč ještě neexistuje. */
  commit(tempId: string, key: string): Promise<void>;
  /** Smaže dočasný soubor (bez chyby, pokud už neexistuje). */
  discard(tempId: string): Promise<void>;
  /** Vrácení právě uloženého souboru, když selže zápis do databáze (jen pro tento případ). */
  rollbackCommitted(key: string): Promise<void>;
  /** Otevře uložený soubor ke čtení. */
  openRead(key: string): Promise<{ stream: Readable; sizeBytes: number }>;
  /** Smaže dočasné soubory starší než daný věk (úklid po pádu serveru během nahrávání). */
  cleanupStaleTemp(olderThanMs: number): Promise<number>;
  /** Zpřístupní uložený soubor jako místní soubor jen pro čtení (např. pro samostatný proces čtečky rozpočtu).
   *  Místní úložiště předá přímo cestu; vzdálené úložiště ho později dočasně stáhne a po skončení smaže. */
  withLocalFile<T>(key: string, fn: (path: string) => Promise<T>): Promise<T>;
  /** Přímý zápis malého souboru (jen fiktivní data seedu) – stejné zásady jako receive + commit. */
  putNew(key: string, data: Uint8Array): Promise<{ sizeBytes: number; sha256: string }>;
}

/** Klíč souboru revize: projects/<id zakázky>/<id revize>. */
export function revisionStorageKey(projectId: string, revisionId: string): string {
  return `projects/${projectId}/${revisionId}`;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_-]*$/;
export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//") || key.endsWith("/")) {
    throw new Error(`Neplatný klíč souboru: ${key}`);
  }
}
