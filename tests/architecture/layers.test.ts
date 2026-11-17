// Hlídá hranice vrstev i bez spuštění lintu:
// doména (src/domain) nesmí importovat React, Next.js, obrazovky ani serverové/databázové moduly.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");
const domainDir = path.join(root, "src/domain");

function listTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listTs(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

const FORBIDDEN = [/^react/, /^next/, /^node:/, /^@\/(app|ui|server)\//, /\/(app|ui|server)\//];
const IMPORT_RE = /(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

describe("architektura – čistá doména", () => {
  const files = listTs(domainDir).filter((f) => !f.endsWith(".test.ts"));

  it("doména obsahuje alespoň jeden modul", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(root, f), f]))("%s nemá zakázané závislosti", (_rel, file) => {
    const src = fs.readFileSync(file, "utf8");
    const imports = [...src.matchAll(IMPORT_RE)].map((m) => m[1] ?? m[2] ?? "");
    const bad = imports.filter((i) => FORBIDDEN.some((re) => re.test(i)));
    expect(bad).toEqual([]);
  });
});
