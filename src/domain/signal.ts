// Jednotný jazyk upozornění (Master zadání, kap. 7).
// Barva nikdy nenese význam sama – každý signál má vždy i slovní popis.
// Čistý TypeScript: žádný React, Next.js ani databáze.

export type Signal = "problem" | "risk" | "unverified" | "done" | "neutral";

export interface SignalMeaning {
  /** Krátký slovní popis, který se zobrazí vždy vedle barvy */
  label: string;
  /** Co signál znamená – pro nápovědu a dokumentaci */
  meaning: string;
}

export const SIGNALS: Readonly<Record<Signal, SignalMeaning>> = {
  problem: { label: "Problém", meaning: "Známý, doložený problém (červená)." },
  risk: { label: "Blíží se riziko", meaning: "Blížící se termín nebo riziko (oranžová)." },
  unverified: { label: "Neověřeno", meaning: "Zatím neověřeno – neznamená nesplněno (šedá)." },
  done: { label: "Doloženo splněno", meaning: "Splnění je doložené (zelená)." },
  neutral: { label: "Informace", meaning: "Informativní údaj bez naléhavosti." },
};

export function signalLabel(signal: Signal): string {
  return SIGNALS[signal].label;
}
