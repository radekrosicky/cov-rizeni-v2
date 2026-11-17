// Pravidlo „jeden zdroj termínů“ pro databázové schéma.
//
// CO HLÍDÁ: termíny konkrétních událostí a milníků (předání staveniště, montáž, zkoušky…) se ukládají
// JEN v tabulce events. Jinde se na událost odkazuje přes events.id (a případný posun dní).
//
// CO NEHLÍDÁ (záměrně povoleno): samostatné vlastní termíny jiných věcí – objednávka, potvrzené
// a skutečné dodání materiálu, termín úkolu, datum dokumentu / revize, ruční výjimka data potřeby apod.
// Ty nejsou kopií události, ale vlastním faktem (rozhodnutí vlastníka ke schválení migrace V2-1).
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

/** Tabulka, která je jediným zdrojem termínů událostí a milníků. */
export const EVENT_SOURCE_TABLE = "events";

/** Tabulky, které nesmí mít žádný vlastní datový sloupec (zakázka – všechny její termíny jsou události). */
export const NO_DATE_TABLES = ["projects"] as const;

/** Přesné názvy termínových polí události – mimo events by šlo o jejich kopii. */
const EVENT_FIELD_NAMES = new Set(["contract_date", "planned_date", "actual_date"]);

/** Slova, která v názvu datového sloupce označují termín události / milníku / etapy. */
const EVENT_WORDS =
  /(^|_)(event|milestone|stage|phase|handover|site_handover|assembly|installation|construction_start|commissioning|trial_operation|completion)(_|$)/;

export interface DateColumnRef {
  table: string;
  column: string;
}

export interface DateRuleViolation extends DateColumnRef {
  reason: string;
}

/** Pravidlo nad jedním datovým sloupcem (čistá funkce – testuje se i na smyšlených budoucích tabulkách). */
export function checkDateColumn(ref: DateColumnRef): DateRuleViolation | null {
  if (ref.table === EVENT_SOURCE_TABLE) return null;
  if ((NO_DATE_TABLES as readonly string[]).includes(ref.table)) {
    return { ...ref, reason: "Zakázka nemá vlastní termíny – patří do událostí (events)." };
  }
  if (EVENT_FIELD_NAMES.has(ref.column) || EVENT_WORDS.test(ref.column)) {
    return { ...ref, reason: "Vypadá jako kopie termínu události / milníku – odkažte na events.id (případně s posunem dní)." };
  }
  return null;
}

/** Všechny sloupce typu `date` v daných tabulkách. */
export function dateColumns(tables: readonly PgTable[]): DateColumnRef[] {
  return tables.flatMap((t) => {
    const cfg = getTableConfig(t);
    return cfg.columns.filter((c) => c.getSQLType() === "date").map((c) => ({ table: cfg.name, column: c.name }));
  });
}

export function checkSchemaDates(tables: readonly PgTable[]): DateRuleViolation[] {
  return dateColumns(tables)
    .map(checkDateColumn)
    .filter((v): v is DateRuleViolation => v !== null);
}
