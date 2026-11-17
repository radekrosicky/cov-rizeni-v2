import { describe, expect, it } from "vitest";
import type { GlobalRole, MemberAccess, ProjectStatus } from "../values";
import { canGlobal, canProject, effectiveAccess, type Actor, type ProjectAction } from "./permissions";

const actor = (globalRole: GlobalRole, status: Actor["status"] = "active"): Actor => ({ id: "u", globalRole, status });
const ctx = (membership: MemberAccess | null, status: ProjectStatus = "realization") => ({ membership, status });
const ok = (a: Actor, action: ProjectAction, c = ctx("edit")) => canProject(a, action, c).allowed;

const ALL: ProjectAction[] = [
  "project.view",
  "history.view",
  "project.edit",
  "event.edit",
  "project.archive",
  "project.unarchive",
  "members.manage",
];

describe("oprávnění – správce", () => {
  it("smí vše i bez členství (kromě obnovy nearchivované zakázky)", () => {
    const a = actor("admin");
    for (const action of ALL.filter((x) => x !== "project.unarchive")) expect(ok(a, action, ctx(null)), action).toBe(true);
    expect(canGlobal(a, "project.create").allowed).toBe(true);
  });
  it("archivovanou zakázku jen čte a smí ji obnovit", () => {
    const a = actor("admin");
    const archived = ctx(null, "archived");
    expect(ok(a, "project.view", archived)).toBe(true);
    expect(ok(a, "project.unarchive", archived)).toBe(true);
    expect(ok(a, "project.edit", archived)).toBe(false);
    expect(ok(a, "event.edit", archived)).toBe(false);
    expect(ok(a, "project.archive", archived)).toBe(false);
  });
});

describe("oprávnění – zástupce", () => {
  const a = actor("deputy");
  it("smí zakládat zakázky", () => expect(canGlobal(a, "project.create").allowed).toBe(true));
  it("upravuje přidělenou zakázku a její události", () => {
    expect(ok(a, "project.edit")).toBe(true);
    expect(ok(a, "event.edit")).toBe(true);
    expect(ok(a, "history.view")).toBe(true);
  });
  it("nepřiděluje oprávnění a nearchivuje (Q11)", () => {
    expect(canProject(a, "members.manage", ctx("edit"))).toEqual({ allowed: false, reason: "admin_only" });
    expect(canProject(a, "project.archive", ctx("edit"))).toEqual({ allowed: false, reason: "admin_only" });
  });
  it("nepřidělenou zakázku nevidí", () => {
    for (const action of ALL) expect(canProject(a, action, ctx(null))).toEqual({ allowed: false, reason: "not_member" });
  });
  it("s členstvím jen pro čtení neupravuje", () => {
    expect(canProject(a, "event.edit", ctx("read"))).toEqual({ allowed: false, reason: "read_only" });
  });
});

describe("oprávnění – sledující (S16)", () => {
  const a = actor("viewer");
  it("čte přidělenou zakázku i její historii", () => {
    expect(ok(a, "project.view", ctx("read"))).toBe(true);
    expect(ok(a, "history.view", ctx("read"))).toBe(true);
  });
  it("nezapisuje, ani kdyby měl omylem členství „edit“", () => {
    expect(effectiveAccess(a, "edit")).toBe("read");
    for (const action of ["project.edit", "event.edit"] as const) {
      expect(canProject(a, action, ctx("edit")).allowed).toBe(false);
    }
  });
  it("nezakládá zakázky a nepřidělenou zakázku nevidí", () => {
    expect(canGlobal(a, "project.create").allowed).toBe(false);
    expect(ok(a, "project.view", ctx(null))).toBe(false);
  });
});

describe("oprávnění – deaktivovaný účet", () => {
  it("nesmí nic, ani jako správce", () => {
    const a = actor("admin", "deactivated");
    for (const action of ALL) expect(canProject(a, action, ctx("edit"))).toEqual({ allowed: false, reason: "inactive" });
    expect(canGlobal(a, "project.create").allowed).toBe(false);
  });
});
