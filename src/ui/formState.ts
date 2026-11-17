// Výsledek serverové akce formuláře. Úspěch = přesměrování (uložení potvrdil server), chyba = tento stav.
export type FormState = { ok: false; message: string; fieldErrors: Record<string, string> } | null;
