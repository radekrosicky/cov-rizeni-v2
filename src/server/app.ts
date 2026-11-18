// Vstup pro obrazovky a serverové akce: služby s již připojenou databází aplikace.
// Obrazovky tak nikdy nesahají na databázi přímo (hlídá lint) a oprávnění vždy rozhoduje služba.
import { getDb } from "./db/client.ts";
import * as devIdentity from "./identity/devIdentity.ts";
import * as docs from "./services/documents.ts";
import * as budget from "./services/budget.ts";
import * as material from "./services/material.ts";
import { LocalFileStorage, resolveFilesDir } from "./storage/localFileStorage.ts";
import type { FileStorage } from "./storage/fileStorage.ts";
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

// ---------- Dokumenty (V2-2) ----------
// Úložiště souborů: zatím místní vývojové (data/dev/files); později se zde vymění za firemní úložiště.
const globalForStorage = globalThis as unknown as { __covStorage?: FileStorage };
export function getStorage(): FileStorage {
  if (!globalForStorage.__covStorage) globalForStorage.__covStorage = new LocalFileStorage(resolveFilesDir());
  return globalForStorage.__covStorage;
}

export const listDocuments = bind(docs.listDocuments);
export const getDocumentDetail = bind(docs.getDocumentDetail);
export const setCurrentRevision = bind(docs.setCurrentRevision);
export const updateDocumentInfo = bind(docs.updateDocumentInfo);
export const archiveDocument = bind(docs.archiveDocument);
export const unarchiveDocument = bind(docs.unarchiveDocument);
export const uploadDocumentRevision = (actor: SessionActor, projectId: string, meta: docs.UploadMeta, body: AsyncIterable<Uint8Array>) =>
  docs.uploadDocumentRevision(getDb(), getStorage(), actor, projectId, meta, body);
export const openRevisionFile = (actor: SessionActor, projectId: string, revisionId: string) =>
  docs.openRevisionFile(getDb(), getStorage(), actor, projectId, revisionId);

/** Vývojové identity – vždy podle aktuálního prostředí (v produkci prázdné / null). */
export const listDevIdentities = () => devIdentity.listDevIdentities(getDb(), process.env);
export const resolveDevActor = (userId: string) => devIdentity.resolveDevActor(getDb(), process.env, userId);

export type { EventInput } from "./services/events.ts";
export type { UploadMeta } from "./services/documents.ts";
import type { SessionActor } from "./services/common.ts";

// ---------- Rozpočet a sledovaný materiál (V2-3) ----------
export const listBudgetSources = bind(budget.listBudgetSources);
export const previewBudget = (actor: SessionActor, projectId: string, revisionId: string) => budget.previewBudget(getDb(), getStorage(), actor, projectId, revisionId);
export const analyzeBudget = (actor: SessionActor, projectId: string, revisionId: string, mappings: Parameters<typeof budget.analyzeBudget>[5]) =>
  budget.analyzeBudget(getDb(), getStorage(), actor, projectId, revisionId, mappings);
export const confirmImport = (actor: SessionActor, projectId: string, revisionId: string, input: budget.ConfirmInput) =>
  budget.confirmImport(getDb(), getStorage(), actor, projectId, revisionId, input);
export const voidImport = bind(budget.voidImport);
export const listBudgetItems = bind(budget.listBudgetItems);
export const getBudgetItem = bind(budget.getBudgetItem);
export const setItemKind = bind(budget.setItemKind);
export const markItemReviewed = bind(budget.markItemReviewed);

export const createNeedsFromItems = bind(material.createNeedsFromItems);
export const createManualNeed = bind(material.createManualNeed);
export const updateNeed = bind(material.updateNeed);
export const addSourcesToNeed = bind(material.addSourcesToNeed);
export const updateSourceQuantity = bind(material.updateSourceQuantity);
export const removeSource = bind(material.removeSource);
export const archiveNeed = bind(material.archiveNeed);
export const unarchiveNeed = bind(material.unarchiveNeed);
export const listNeeds = bind(material.listNeeds);
export const getNeed = bind(material.getNeed);
export const listResponsibleCandidates = bind(material.listResponsibleCandidates);
export const getItemsForTracking = bind(material.getItemsForTracking);
export type { NeedFields, SourceInput } from "./services/material.ts";
