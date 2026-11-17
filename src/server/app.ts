// Vstup pro obrazovky a serverové akce: služby s již připojenou databází aplikace.
// Obrazovky tak nikdy nesahají na databázi přímo (hlídá lint) a oprávnění vždy rozhoduje služba.
import { getDb } from "./db/client.ts";
import * as devIdentity from "./identity/devIdentity.ts";
import * as events from "./services/events.ts";
import * as history from "./services/history.ts";
import * as members from "./services/members.ts";
import * as projects from "./services/projects.ts";

type Tail<F> = F extends (db: never, ...args: infer A) => infer R ? (...args: A) => R : never;
const bind =
  <F extends (db: ReturnType<typeof getDb>, ...args: never[]) => unknown>(fn: F) =>
  ((...args: never[]) => fn(getDb(), ...args)) as unknown as Tail<F>;

export const listProjects = bind(projects.listProjects);
export const getProjectDetail = bind(projects.getProjectDetail);
export const listLeaderCandidates = bind(projects.listLeaderCandidates);
export const createProject = bind(projects.createProject);
export const updateProject = bind(projects.updateProject);
export const archiveProject = bind(projects.archiveProject);
export const unarchiveProject = bind(projects.unarchiveProject);

export const getEvent = bind(events.getEvent);
export const createEvent = bind(events.createEvent);
export const updateEvent = bind(events.updateEvent);
export const cancelEvent = bind(events.cancelEvent);

export const addMember = bind(members.addMember);
export const changeMemberAccess = bind(members.changeMemberAccess);
export const removeMember = bind(members.removeMember);
export const listMemberCandidates = bind(members.listMemberCandidates);

export const listProjectHistory = bind(history.listProjectHistory);

/** Vývojové identity – vždy podle aktuálního prostředí (v produkci prázdné / null). */
export const listDevIdentities = () => devIdentity.listDevIdentities(getDb(), process.env);
export const resolveDevActor = (userId: string) => devIdentity.resolveDevActor(getDb(), process.env, userId);

export type { EventInput } from "./services/events.ts";
