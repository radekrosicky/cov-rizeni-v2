// Limity zpracování Excelového rozpočtu – chrání paměť a stabilitu aplikace (schváleno k V2-3).
// Platí pro JEDNOTLIVÝ list i pro CELÝ soubor (mnoho malých listů nesmí dohromady překročit bezpečnou velikost).
export const BUDGET_LIMITS = {
  /** Rozbalená velikost listů + sdílených textů celého souboru. */
  maxUncompressedBytes: 40 * 1024 * 1024,
  maxSheets: 50,
  maxRowsPerSheet: 20_000,
  maxColumnsPerSheet: 200,
  /** Celý soubor dohromady. */
  maxRowsTotal: 50_000,
  maxCellsTotal: 1_000_000,
  /** Kolik řádků ukázat v náhledu listu. */
  previewRows: 60,
} as const;

export const LIMIT_MESSAGE =
  "Rozpočet je příliš rozsáhlý pro bezpečné zpracování. Nic nebylo uloženo. Rozdělte ho prosím na menší soubory nebo odstraňte nepotřebné listy.";
