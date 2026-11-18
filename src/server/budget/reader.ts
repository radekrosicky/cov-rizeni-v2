// Řízení samostatného procesu pro čtení Excelu (readerProcess.ts) z aplikace.
// Ochrany: strop paměti JavaScriptu v procesu, hlídání skutečné spotřeby paměti procesu (RSS, Linux /proc),
// časový limit, omezení velikosti výstupu a nejvýše JEDNO čtení najednou. Proces nedostane žádné tajné proměnné.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ClassifiedRow, ImportSummary } from "../../domain/budget/classify.ts";
import type { Row, SheetMapping } from "../../domain/budget/types.ts";

export const READER_LIMITS = {
  heapMb: 384,
  rssMb: 640,
  timeoutMs: 60_000,
  maxOutputBytes: 80 * 1024 * 1024,
  queueWaitMs: 30_000,
};

export interface PreviewSheet {
  name: string;
  hidden: boolean;
  rowCount: number;
  colCount: number;
  nonEmptyRows: number;
  suggestion: SheetMapping;
  previewRows: { rowNumber: number; cells: Row }[];
}

export type ReaderFailure = { ok: false; kind: "limit" | "format" | "mapping" | "busy" | "crash"; message: string };
export type PreviewResult = { ok: true; sheets: PreviewSheet[] } | ReaderFailure;
export type ExtractResult = { ok: true; rows: ClassifiedRow[]; summary: ImportSummary } | ReaderFailure;

const SCRIPT = path.join(process.cwd(), "src/server/budget/readerProcess.ts");

// Nejvýše jedno čtení najednou (ostatní počkají, nebo dostanou srozumitelnou odpověď).
let queue: Promise<unknown> = Promise.resolve();
let waiting = 0;

function rssMb(pid: number): number | null {
  try {
    const m = /VmRSS:\s+(\d+)\s+kB/.exec(fs.readFileSync(`/proc/${pid}/status`, "utf8"));
    return m ? Number(m[1]) / 1024 : null;
  } catch {
    return null; // mimo Linux / proces už skončil – zůstává strop paměti a časový limit
  }
}

function runOnce(mode: "preview" | "extract", file: string, input: string | null, limits = READER_LIMITS): Promise<PreviewResult | ExtractResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${limits.heapMb}`, "--disable-warning=ExperimentalWarning", SCRIPT, mode, file], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "", NODE_ENV: process.env.NODE_ENV ?? "production" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: ReaderFailure | null = null;
    const kill = (f: ReaderFailure) => {
      if (!failure) failure = f;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => kill({ ok: false, kind: "limit", message: "Zpracování rozpočtu trvalo příliš dlouho. Nic nebylo uloženo – rozdělte ho na menší soubory." }), limits.timeoutMs);
    const watch = setInterval(() => {
      const rss = child.pid ? rssMb(child.pid) : null;
      if (rss !== null && rss > limits.rssMb) kill({ ok: false, kind: "limit", message: "Rozpočet je příliš rozsáhlý pro bezpečné zpracování (paměť). Nic nebylo uloženo." });
    }, 100);
    child.stdout.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limits.maxOutputBytes) kill({ ok: false, kind: "limit", message: "Rozpočet je příliš rozsáhlý pro bezpečné zpracování. Nic nebylo uloženo." });
      else chunks.push(c);
    });
    child.stderr.on("data", () => {}); // varování Node.js se nezobrazují uživateli
    child.on("error", () => kill({ ok: false, kind: "crash", message: "Čtení rozpočtu se nepodařilo spustit." }));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearInterval(watch);
      if (failure) return resolve(failure);
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as PreviewResult | ExtractResult;
        return resolve(parsed);
      } catch {
        const oom = signal !== null || code === 134 || code === null;
        return resolve({
          ok: false,
          kind: oom ? "limit" : "crash",
          message: oom ? "Rozpočet je příliš rozsáhlý pro bezpečné zpracování (paměť). Nic nebylo uloženo." : "Soubor se nepodařilo přečíst jako sešit Excel. Nic nebylo uloženo.",
        });
      }
    });
    child.stdin.end(input ?? "");
  });
}

async function queued<T>(fn: () => Promise<T>): Promise<T | ReaderFailure> {
  if (waiting >= 3) return { ok: false, kind: "busy", message: "Právě se zpracovávají jiné rozpočty. Zkuste to prosím za chvíli." };
  waiting++;
  const prev = queue;
  let release!: () => void;
  queue = new Promise<void>((r) => (release = r));
  try {
    const timedOut = await Promise.race([prev.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), READER_LIMITS.queueWaitMs))]);
    if (timedOut) return { ok: false, kind: "busy", message: "Právě se zpracovává jiný rozpočet. Zkuste to prosím za chvíli." };
    return await fn();
  } finally {
    waiting--;
    release();
  }
}

export function previewBudgetFile(file: string, limits = READER_LIMITS): Promise<PreviewResult> {
  return queued(() => runOnce("preview", file, null, limits)) as Promise<PreviewResult>;
}

export function extractBudgetFile(file: string, mappings: SheetMapping[], limits = READER_LIMITS): Promise<ExtractResult> {
  return queued(() => runOnce("extract", file, JSON.stringify(mappings), limits)) as Promise<ExtractResult>;
}
