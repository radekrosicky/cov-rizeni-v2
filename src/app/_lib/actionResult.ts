import { DomainError } from "@/server/errors";
import type { FormState } from "@/ui/formState";

/** Převod chyby služby na stav formuláře. Neočekávanou chybu nezamlčet – ale ani neukázat technické detaily. */
export function toFormState(e: unknown): FormState {
  if (e instanceof DomainError) return { ok: false, message: e.message, fieldErrors: e.fieldErrors };
  console.error(e);
  return { ok: false, message: "Nastala neočekávaná chyba. NIC NEBYLO ULOŽENO.", fieldErrors: {} };
}

export const NOT_SIGNED_IN: FormState = { ok: false, message: "Nejste přihlášen(a). Vyberte identitu a zkuste to znovu.", fieldErrors: {} };

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};
export const optStr = (fd: FormData, key: string) => {
  const v = str(fd, key).trim();
  return v ? v : null;
};
export const int = (fd: FormData, key: string) => Number.parseInt(str(fd, key), 10) || 0;
