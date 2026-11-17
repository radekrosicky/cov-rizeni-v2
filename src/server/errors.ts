// Chyba, kterou lze srozumitelně ukázat uživateli (česky). Vše ostatní je neočekávaná chyba.
export type DomainErrorCode = "validation" | "not_found" | "forbidden" | "conflict";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly fieldErrors: Record<string, string>;
  constructor(code: DomainErrorCode, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
