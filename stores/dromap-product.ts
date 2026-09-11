"use client";

import { create } from "zustand";
import { createScopedProjectCache } from "@/lib/dromap/scoped-project-cache";
import { createLatestIndexedWriter } from "@/lib/dromap/latest-indexed-writer";

import {
  createDefaultProjectSetup,
  createDromapProjectId,
  isDromapTrashExpired,
  type DromapInitialLayerChoice,
  type DromapProject,
  type DromapProjectSetup,
  type DromapPublicSourceAttribution,
  type DromapProjectAiMessage,
  type DromapProjectStatus,
  type DromapSetupStep,
  type DromapUserMode,
} from "@/lib/dromap/product";
import { DEFAULT_DROMAP_BASEMAP_ID, type DromapBasemapId } from "@/lib/dromap/basemap";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type { DromapEditorProjectSnapshot } from "@/lib/dromap/editor-project-persistence";
import { resolveDromapPreferences } from "@/lib/dromap/preferences";
import { normalizeDromapMapView, type DromapMapView } from "@/lib/dromap/map-view";
import { normalizeDromapAccountPlan, type DromapAccountPlan } from "@/lib/dromap/plans";
import {
  getDromapSession,
  signOutDromapAccount,
  updateDromapProfile,
  type DromapAccountSession,
} from "@/lib/dromap/account";
import {
  createRemoteProjectMetadata,
  deleteRemoteProject,
  fetchRemoteProject,
  fetchRemoteProjectSummaries,
  patchRemoteProjectMetadata,
  putRemoteProject,
  RemoteProjectConflictError,
  type RemoteProjectManifest,
} from "@/lib/dromap/remote-projects";

const PRODUCT_STORAGE_KEY = "dromap-product-p0-v1";
const PRODUCT_DATABASE_NAME = "dromap-product-p0";
const PRODUCT_DATABASE_STORE = "product-state";
const PRODUCT_DATABASE_PROJECT_CACHE_STORE = "project-cache";
const PRODUCT_DATABASE_KEY = "root";
const MAX_LOCAL_STORAGE_PAYLOAD_CHARACTERS = 3_000_000;

let bootstrapPromise: Promise<void> | null = null;
const remoteSyncTimers = new Map<string, number>();
const remoteSyncInFlight = new Map<string, Promise<boolean>>();
const remoteSyncAgain = new Set<string>();
const remoteMetadataOnly = new Set<string>();
const remoteDeletePending = new Set<string>();

type ProductStoragePayload = {
  schemaVersion: 1 | 2;
  persistedAt: string;
  userMode: DromapUserMode;
  accountName: string;
  accountEmail?: string | null;
  accountUserId?: string | null;
  accountFirstName?: string | null;
  accountLastName?: string | null;
  accountPreferences?: Record<string, unknown>;
  accountPlan?: DromapAccountPlan;
  singleMapMaxExportProjectIds?: string[];
  publicMapExportProjectIds?: string[];
  activeProjectId: string | null;
  projects: DromapProject[];
};

type CreateProjectOptions = {
  id?: string;
  name?: string;
  replaceGuestProject?: boolean;
  setupComplete?: boolean;
  initialBasemapId?: DromapBasemapId;
  snapshot?: DromapEditorProjectSnapshot | null;
  importedFileName?: string | null;
  quickStartLayerChoice?: "empty" | "none";
  sourceAttribution?: DromapPublicSourceAttribution | null;
};

type SignOutResult = { ok: true } | { ok: false; error: string };

type DromapProductState = {
  hydrated: boolean;
  userMode: DromapUserMode;
  accountName: string;
  accountEmail: string | null;
  accountUserId: string | null;
  accountFirstName: string | null;
  accountLastName: string | null;
  accountPreferences: Record<string, unknown>;
  accountPlan: DromapAccountPlan;
  singleMapMaxExportProjectIds: string[];
  publicMapExportProjectIds: string[];
  accountBackendConfigured: boolean | null;
  lastSyncError: string | null;
  activeProjectId: string | null;
  projects: DromapProject[];
  projectConflicts: Record<string, { remote: RemoteProjectManifest; localUpdatedAt: string }>;

  bootstrap: () => Promise<void>;
  activateAuthenticatedAccount: (account: DromapAccountSession) => Promise<void>;
  refreshAccountSession: () => Promise<boolean>;
  signOutAccount: () => Promise<SignOutResult>;
  forgetAccountLocally: () => void;
  syncProjectNow: (projectId: string) => Promise<boolean>;
  syncAllProjects: () => Promise<boolean>;
  refreshRemoteProjects: () => Promise<boolean>;
  loadProject: (projectId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  resolveProjectConflict: (projectId: string, choice: "local" | "remote") => Promise<boolean>;
  setAccountName: (name: string) => Promise<boolean>;
  setAccountProfile: (firstName: string, lastName: string, preferences?: Record<string, unknown>) => Promise<boolean>;
  setActiveProjectId: (projectId: string | null) => void;
  createProject: (options?: CreateProjectOptions) => string | null;
  duplicateProject: (projectId: string) => Promise<string | null>;
  setProjectSourceAttribution: (
    projectId: string,
    patch: Partial<Pick<DromapPublicSourceAttribution, "position" | "mapPosition" | "hidden">>,
  ) => void;
  setProjectAiConversation: (projectId: string, messages: DromapProjectAiMessage[]) => void;
  renameProject: (projectId: string, name: string) => void;
  updateProjectSetup: (projectId: string, patch: Partial<DromapProjectSetup>) => void;
  setSetupStep: (projectId: string, step: DromapSetupStep) => void;
  completeSetupStep: (projectId: string, step: DromapSetupStep) => void;
  setProjectBasemap: (projectId: string, basemapId: DromapBasemapId) => void;
  setProjectWorkspace: (projectId: string, workspaceBounds: WorkspaceBounds) => void;
  setProjectWorkspaceView: (projectId: string, workspaceView: DromapMapView | null) => void;
  setProjectLayerChoice: (projectId: string, choice: DromapInitialLayerChoice) => void;
  completeProjectSetup: (projectId: string) => void;
  markProjectDirty: (projectId: string) => number;
  markProjectSaving: (projectId: string) => void;
  checkpointProjectSnapshot: (
    projectId: string,
    snapshot: DromapEditorProjectSnapshot,
  ) => Promise<void>;
  saveProjectSnapshot: (
    projectId: string,
    snapshot: DromapEditorProjectSnapshot,
  ) => Promise<void>;
  setProjectThumbnail: (projectId: string, thumbnailDataUrl: string | null) => void;
  markProjectSyncPending: (projectId: string) => void;
  trashProject: (projectId: string) => void;
  restoreProject: (projectId: string) => void;
  permanentlyDeleteProject: (projectId: string) => void;
  emptyTrash: () => void;
  purgeExpiredTrash: () => void;
  flushPersistence: () => Promise<void>;
};

function nowIso() {
  return new Date().toISOString();
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeUserMode(value: unknown): DromapUserMode {
  return value === "authenticated" ? "authenticated" : "guest";
}

function getQuickStartBasemapId(preferences: Record<string, unknown>): DromapBasemapId {
  const value = preferences.quickStartBasemapId;
  if (value === "openfreemap-positron" || value === "blank-white") return value;
  return DEFAULT_DROMAP_BASEMAP_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeProjectStatus(value: unknown): DromapProjectStatus {
  return value === "editing" ||
    value === "unsaved" ||
    value === "saving" ||
    value === "saved" ||
    value === "sync-pending" ||
    value === "trashed"
    ? value
    : "setup-incomplete";
}

function normalizeSetup(value: unknown): DromapProjectSetup {
  const fallback = createDefaultProjectSetup(DEFAULT_DROMAP_BASEMAP_ID);
  if (!isRecord(value)) return fallback;

  const currentStep =
    value.currentStep === 2 || value.currentStep === 3 || value.currentStep === 4
      ? value.currentStep
      : 1;
  const completedSteps = Array.isArray(value.completedSteps)
    ? value.completedSteps.filter(
        (step): step is DromapSetupStep =>
          step === 1 || step === 2 || step === 3 || step === 4,
      )
    : [];

  return {
    currentStep,
    completedSteps: Array.from(new Set(completedSteps)),
    basemapId:
      typeof value.basemapId === "string" ? value.basemapId : DEFAULT_DROMAP_BASEMAP_ID,
    workspaceBounds: isRecord(value.workspaceBounds)
      ? (value.workspaceBounds as unknown as WorkspaceBounds)
      : null,
    workspaceView: normalizeDromapMapView(value.workspaceView),
    layerChoice: isRecord(value.layerChoice)
      ? (value.layerChoice as unknown as DromapInitialLayerChoice)
      : null,
  };
}

function normalizeProjectAiConversation(value: unknown): DromapProjectAiMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index): DromapProjectAiMessage | null => {
      const role =
        item.role === "user" ||
        item.role === "assistant" ||
        item.role === "system" ||
        item.role === "error"
          ? item.role
          : null;
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!role || !text) return null;
      return {
        id:
          typeof item.id === "string" && item.id.trim()
            ? item.id
            : `ai-message-${index}-${Date.now()}`,
        role,
        text: text.slice(0, 20_000),
        createdAt:
          typeof item.createdAt === "string" && item.createdAt
            ? item.createdAt
            : nowIso(),
      };
    })
    .filter((item): item is DromapProjectAiMessage => Boolean(item))
    .slice(-100);
}

function normalizeProject(value: unknown, index: number): DromapProject | null {
  if (!isRecord(value)) return null;

  const createdAt = typeof value.createdAt === "string" ? value.createdAt : nowIso();
  const setupComplete = value.setupComplete === true;
  const normalizedStatus = normalizeProjectStatus(value.status);

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id
        : createDromapProjectId(),
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : `Projet ${index + 1}`,
    creatorName:
      typeof value.creatorName === "string" && value.creatorName.trim()
        ? value.creatorName.trim()
        : "Utilisateur DroMap",
    createdAt,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : createdAt,
    lastSavedAt: typeof value.lastSavedAt === "string" ? value.lastSavedAt : null,
    deletedAt: typeof value.deletedAt === "string" ? value.deletedAt : null,
    status:
      normalizedStatus === "trashed"
        ? "trashed"
        : setupComplete
          ? normalizedStatus === "setup-incomplete"
            ? "saved"
            : normalizedStatus
          : "setup-incomplete",
    setupComplete,
    setup: normalizeSetup(value.setup),
    editorSnapshot: isRecord(value.editorSnapshot)
      ? (value.editorSnapshot as unknown as DromapEditorProjectSnapshot)
      : null,
    pendingChanges:
      typeof value.pendingChanges === "number" && Number.isFinite(value.pendingChanges)
        ? Math.max(0, Math.floor(value.pendingChanges))
        : 0,
    thumbnailDataUrl:
      typeof value.thumbnailDataUrl === "string" ? value.thumbnailDataUrl : null,
    importedFileName:
      typeof value.importedFileName === "string" ? value.importedFileName : null,
    sourceAttribution:
      isRecord(value.sourceAttribution) &&
      value.sourceAttribution.kind === "public-map" &&
      typeof value.sourceAttribution.publicationSlug === "string" &&
      typeof value.sourceAttribution.creatorName === "string"
        ? {
            kind: "public-map",
            publicationSlug: value.sourceAttribution.publicationSlug,
            creatorName: value.sourceAttribution.creatorName,
            allowRemoval: value.sourceAttribution.allowRemoval === true,
            position:
              value.sourceAttribution.position === "top-left" ||
              value.sourceAttribution.position === "top-right" ||
              value.sourceAttribution.position === "bottom-right"
                ? value.sourceAttribution.position
                : "bottom-left",
            mapPosition:
              isRecord(value.sourceAttribution.mapPosition) &&
              typeof value.sourceAttribution.mapPosition.x === "number" &&
              Number.isFinite(value.sourceAttribution.mapPosition.x) &&
              typeof value.sourceAttribution.mapPosition.y === "number" &&
              Number.isFinite(value.sourceAttribution.mapPosition.y)
                ? {
                    x: Math.max(0, Math.min(1, value.sourceAttribution.mapPosition.x)),
                    y: Math.max(0, Math.min(1, value.sourceAttribution.mapPosition.y)),
                  }
                : null,
            hidden: value.sourceAttribution.allowRemoval === true && value.sourceAttribution.hidden === true,
          }
        : null,
    aiConversation: normalizeProjectAiConversation(value.aiConversation),
    contentLoaded:
      typeof value.contentLoaded === "boolean"
        ? value.contentLoaded
        : isRecord(value.editorSnapshot) || isRecord(value.setup),
    remoteRevision:
      typeof value.remoteRevision === "string" ? value.remoteRevision : null,
    remoteChunkCount:
      typeof value.remoteChunkCount === "number" && Number.isInteger(value.remoteChunkCount)
        ? value.remoteChunkCount
        : null,
    remoteEncoding:
      value.remoteEncoding === "gzip-base64" || value.remoteEncoding === "base64"
        ? value.remoteEncoding
        : null,
    remotePayloadSizeBytes:
      typeof value.remotePayloadSizeBytes === "number" && Number.isFinite(value.remotePayloadSizeBytes)
        ? value.remotePayloadSizeBytes
        : null,
    remoteUpdatedAt:
      typeof value.remoteUpdatedAt === "string" ? value.remoteUpdatedAt : null,
  };
}

function normalizeProjects(values: unknown[]) {
  return values
    .map(normalizeProject)
    .filter((project): project is DromapProject => project !== null);
}

function normalizeStoragePayload(value: unknown): ProductStoragePayload | null {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) return null;

  const projects = Array.isArray(value.projects) ? normalizeProjects(value.projects) : [];
  const latestProjectUpdate = projects.reduce(
    (latest, project) =>
      project.updatedAt.localeCompare(latest) > 0 ? project.updatedAt : latest,
    "1970-01-01T00:00:00.000Z",
  );
  const requestedMode = normalizeUserMode(value.userMode);
  const activeProjectId =
    typeof value.activeProjectId === "string" &&
    projects.some((project) => project.id === value.activeProjectId)
      ? value.activeProjectId
      : null;

  return {
    schemaVersion: value.schemaVersion === 2 ? 2 : 1,
    persistedAt:
      typeof value.persistedAt === "string" ? value.persistedAt : latestProjectUpdate,
    userMode: requestedMode,
    accountName:
      typeof value.accountName === "string" && value.accountName.trim()
        ? value.accountName.trim()
        : "Utilisateur DroMap",
    accountEmail: typeof value.accountEmail === "string" ? value.accountEmail : null,
    accountUserId: typeof value.accountUserId === "string" ? value.accountUserId : null,
    accountFirstName: typeof value.accountFirstName === "string" ? value.accountFirstName : null,
    accountLastName: typeof value.accountLastName === "string" ? value.accountLastName : null,
    accountPreferences: isRecord(value.accountPreferences) ? value.accountPreferences : {},
    accountPlan: normalizeDromapAccountPlan(value.accountPlan),
    singleMapMaxExportProjectIds: Array.isArray(value.singleMapMaxExportProjectIds)
      ? Array.from(new Set(value.singleMapMaxExportProjectIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())))
      : [],
    publicMapExportProjectIds: Array.isArray(value.publicMapExportProjectIds)
      ? Array.from(new Set(value.publicMapExportProjectIds.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())))
      : [],
    activeProjectId,
    projects,
  };
}

function readLocalStorage(): ProductStoragePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRODUCT_STORAGE_KEY);
    return raw ? normalizeStoragePayload(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function openProductDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible."));
      return;
    }
    const request = indexedDB.open(PRODUCT_DATABASE_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PRODUCT_DATABASE_STORE)) {
        database.createObjectStore(PRODUCT_DATABASE_STORE);
      }
      if (!database.objectStoreNames.contains(PRODUCT_DATABASE_PROJECT_CACHE_STORE)) {
        database.createObjectStore(PRODUCT_DATABASE_PROJECT_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Ouverture IndexedDB impossible."));
  });
}

async function readIndexedDatabase(): Promise<ProductStoragePayload | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  let database: IDBDatabase | null = null;
  try {
    database = await openProductDatabase();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const transaction = database!.transaction(PRODUCT_DATABASE_STORE, "readonly");
      const request = transaction.objectStore(PRODUCT_DATABASE_STORE).get(PRODUCT_DATABASE_KEY);
      request.onsuccess = () => resolve(request.result as unknown);
      request.onerror = () => reject(request.error ?? new Error("Lecture IndexedDB impossible."));
    });
    return normalizeStoragePayload(stored);
  } catch (error) {
    console.warn("DroMap: lecture IndexedDB impossible", error);
    return null;
  } finally {
    database?.close();
  }
}

async function readStorage(): Promise<ProductStoragePayload | null> {
  const [indexedPayload, localPayload] = await Promise.all([
    readIndexedDatabase(),
    Promise.resolve(readLocalStorage()),
  ]);
  if (!indexedPayload) return localPayload;
  if (!localPayload) return indexedPayload;
  return indexedPayload.persistedAt.localeCompare(localPayload.persistedAt) >= 0
    ? indexedPayload
    : localPayload;
}

type ProjectCacheRecord = {
  project: DromapProject;
  remoteRevision: string | null;
  cachedAt: string;
};

const legacyProjectCacheOwners = new Map<string, string>();
function projectCacheScope() {
  const owner = useDromapProductStore.getState().accountUserId;
  return owner ? `user:${owner}` : "guest";
}
const projectContentCache = createScopedProjectCache(openProductDatabase, PRODUCT_DATABASE_PROJECT_CACHE_STORE, projectCacheScope, legacyProjectCacheOwners);

function createProjectMetadataRecord(project: DromapProject): DromapProject {
  return {
    ...project,
    setup: {
      ...project.setup,
      // Le choix complet peut embarquer un calque très lourd. Il reste dans le cache du projet.
      layerChoice: null,
    },
    editorSnapshot: null,
    contentLoaded: false,
  };
}

async function readProjectCache(projectId: string): Promise<ProjectCacheRecord | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return null;
  try {
    const value = await projectContentCache.read(projectId);
    if (!isRecord(value) || !isRecord(value.project)) return null;
    const project = normalizeProject(value.project, 0);
    if (!project) return null;
    return {
      project: { ...project, contentLoaded: true },
      remoteRevision: typeof value.remoteRevision === "string" ? value.remoteRevision : null,
      cachedAt: typeof value.cachedAt === "string" ? value.cachedAt : "",
    };
  } catch {
    return null;
  }
}

async function writeProjectCache(project: DromapProject) {
  if (typeof window === "undefined" || typeof indexedDB === "undefined" || project.contentLoaded === false) return;
  try {
    const record: ProjectCacheRecord = {
      project: cloneValue({ ...project, contentLoaded: true }),
      remoteRevision: project.remoteRevision ?? null,
      cachedAt: nowIso(),
    };
    await projectContentCache.write(project.id, record);
  } catch (error) {
    console.warn("DroMap: cache projet IndexedDB impossible", error);
  }
}

async function deleteProjectCache(projectId: string) {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  try {
    await projectContentCache.remove(projectId);
  } catch {
    // Le cache ne doit jamais bloquer la suppression métier.
  }
}

function createStoragePayload(state: DromapProductState): ProductStoragePayload {
  return {
    schemaVersion: 2,
    persistedAt: nowIso(),
    userMode: state.userMode,
    accountName: state.accountName,
    accountEmail: state.accountEmail,
    accountUserId: state.accountUserId,
    accountFirstName: state.accountFirstName,
    accountLastName: state.accountLastName,
    accountPreferences: state.accountPreferences,
    accountPlan: state.accountPlan,
    singleMapMaxExportProjectIds: state.singleMapMaxExportProjectIds,
    publicMapExportProjectIds: state.publicMapExportProjectIds,
    activeProjectId: state.activeProjectId,
    projects: state.projects.map(createProjectMetadataRecord),
  };
}

function persistLocalStorage(payload: ProductStoragePayload) {
  if (typeof window === "undefined") return false;
  try {
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_LOCAL_STORAGE_PAYLOAD_CHARACTERS) return false;
    window.localStorage.setItem(PRODUCT_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.warn("DroMap: sauvegarde localStorage impossible", error);
    return false;
  }
}

const writeLatestProductState = createLatestIndexedWriter(openProductDatabase, PRODUCT_DATABASE_STORE, PRODUCT_DATABASE_KEY);

async function persistIndexedDatabase(payload: ProductStoragePayload) {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return false;
  try {
    return await writeLatestProductState(cloneValue(payload));
  } catch (error) {
    console.warn("DroMap: sauvegarde IndexedDB impossible", error);
    return false;
  }
}

function persistState(state: DromapProductState) {
  const payload = createStoragePayload(state);
  persistLocalStorage(payload);
  void persistIndexedDatabase(payload);
  for (const project of state.projects) {
    if (project.contentLoaded !== false) void writeProjectCache(project);
  }
}

async function persistStateDurably(
  state: DromapProductState,
  projectIds?: readonly string[],
) {
  const payload = createStoragePayload(state);
  persistLocalStorage(payload);

  const requestedIds = projectIds ? new Set(projectIds) : null;
  const projectsToCache = state.projects.filter(
    (project) =>
      project.contentLoaded !== false &&
      (!requestedIds || requestedIds.has(project.id)),
  );

  await Promise.all([
    persistIndexedDatabase(payload),
    ...projectsToCache.map((project) => writeProjectCache(project)),
  ]);
}

function schedulePersist(get: () => DromapProductState) {
  if (typeof window === "undefined") return;
  window.queueMicrotask(() => persistState(get()));
}

function updateProject(
  projects: DromapProject[],
  projectId: string,
  updater: (project: DromapProject) => DromapProject,
) {
  return projects.map((project) => (project.id === projectId ? updater(project) : project));
}

function createProjectRecord(
  state: Pick<DromapProductState, "accountName">,
  options: CreateProjectOptions = {},
): DromapProject {
  const timestamp = nowIso();
  const setupComplete = options.setupComplete === true;
  const setup = createDefaultProjectSetup(options.initialBasemapId ?? DEFAULT_DROMAP_BASEMAP_ID);

  // Un projet déjà complet doit toujours avoir une configuration cohérente
  // avec son snapshot. Cela vaut pour les imports et les copies de cartes
  // publiques, sans modifier le contenu cartographique du snapshot.
  if (setupComplete && options.snapshot) {
    setup.currentStep = 4;
    setup.completedSteps = [1, 2, 3, 4];
    setup.basemapId = options.snapshot.basemapId ?? setup.basemapId;
    setup.workspaceBounds = options.snapshot.workspaceBounds ?? null;
    setup.workspaceView = normalizeDromapMapView(options.snapshot.mapView);
    setup.layerChoice = null;
  } else if (setupComplete) {
    // Un projet créé en démarrage rapide reproduit « Passer les étapes ».
    setup.currentStep = 4;
    setup.completedSteps = [1, 2, 3, 4];
    setup.workspaceBounds = null;
    setup.workspaceView = null;
    setup.layerChoice = {
      kind: options.quickStartLayerChoice === "none" ? "none" : "empty",
    };
  }

  return {
    id: options.id ?? createDromapProjectId(),
    name: options.name?.trim() || "Projet sans titre",
    creatorName: state.accountName,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastSavedAt: options.snapshot ? timestamp : null,
    deletedAt: null,
    status: setupComplete ? (options.snapshot ? "saved" : "editing") : "setup-incomplete",
    setupComplete,
    setup,
    editorSnapshot: options.snapshot ? cloneValue(options.snapshot) : null,
    pendingChanges: 0,
    thumbnailDataUrl: null,
    importedFileName: options.importedFileName ?? null,
    sourceAttribution: options.sourceAttribution ? cloneValue(options.sourceAttribution) : null,
    aiConversation: [],
    contentLoaded: true,
    remoteRevision: null,
    remoteChunkCount: null,
    remoteEncoding: null,
    remotePayloadSizeBytes: null,
    remoteUpdatedAt: null,
  };
}

function isProjectLocallyPending(project: DromapProject) {
  return (
    project.pendingChanges > 0 ||
    project.status === "unsaved" ||
    project.status === "saving" ||
    project.status === "sync-pending"
  );
}

function mergeProjectLists(remoteProjects: DromapProject[], localProjects: DromapProject[]) {
  const merged = new Map<string, DromapProject>();
  const localById = new Map(localProjects.map((project) => [project.id, project] as const));

  for (const remote of remoteProjects) {
    const local = localById.get(remote.id);
    if (!local) {
      merged.set(remote.id, remote);
      continue;
    }

    const remoteFields = {
      remoteRevision: remote.remoteRevision ?? null,
      remoteChunkCount: remote.remoteChunkCount ?? null,
      remoteEncoding: remote.remoteEncoding ?? null,
      remotePayloadSizeBytes: remote.remotePayloadSizeBytes ?? null,
      remoteUpdatedAt: remote.remoteUpdatedAt ?? remote.updatedAt,
    };

    if (isProjectLocallyPending(local)) {
      // Garder le jeton serveur sur lequel la copie locale a réellement été basée.
      // Si le serveur a changé entre-temps, l'upload optimiste produira un conflit
      // au lieu d'autoriser un écrasement silencieux.
      merged.set(remote.id, local);
      continue;
    }

    const localBusinessIsNewer = local.updatedAt.localeCompare(remote.updatedAt) > 0;
    if (localBusinessIsNewer) {
      // Cas typique : changement local sauvegardé dans IndexedDB juste avant une
      // fermeture, mais dont la requête réseau n'a pas eu le temps de partir.
      // Conserver aussi l'ancien jeton distant pour que la reprise reste optimiste.
      merged.set(remote.id, local);
      continue;
    }

    const serverChanged = Boolean(
      (local.remoteRevision && remote.remoteRevision && local.remoteRevision !== remote.remoteRevision) ||
      (local.remoteUpdatedAt && remote.remoteUpdatedAt && local.remoteUpdatedAt !== remote.remoteUpdatedAt),
    );
    if (remote.updatedAt.localeCompare(local.updatedAt) > 0 || serverChanged) {
      merged.set(remote.id, remote);
    } else {
      merged.set(remote.id, { ...local, ...remoteFields });
    }
  }

  for (const local of localProjects) {
    if (!merged.has(local.id)) merged.set(local.id, local);
  }

  return Array.from(merged.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function manifestFields(manifest: RemoteProjectManifest) {
  return {
    remoteRevision: manifest.revision,
    remoteChunkCount: manifest.chunkCount,
    remoteEncoding: manifest.encoding,
    remotePayloadSizeBytes: manifest.payloadSizeBytes,
    remoteUpdatedAt: manifest.updatedAt,
  } satisfies Partial<DromapProject>;
}

function registerProjectConflict(
  projectId: string,
  remote: RemoteProjectManifest,
  get: () => DromapProductState,
  set: (partial: Partial<DromapProductState> | ((state: DromapProductState) => Partial<DromapProductState>)) => void,
) {
  const local = get().projects.find((project) => project.id === projectId);
  set((state) => ({
    lastSyncError: "Ce projet a été modifié sur un autre appareil. Choisis la version à conserver.",
    projectConflicts: {
      ...state.projectConflicts,
      [projectId]: { remote, localUpdatedAt: local?.updatedAt ?? nowIso() },
    },
  }));
}

async function loadProjectForSync(
  projectId: string,
  get: () => DromapProductState,
  set: (partial: Partial<DromapProductState> | ((state: DromapProductState) => Partial<DromapProductState>)) => void,
) {
  const ownerScope = projectCacheScope();
  const current = get().projects.find((project) => project.id === projectId);
  if (!current) return null;
  if (current.contentLoaded !== false) return current;

  const cached = await readProjectCache(projectId);
  if (projectCacheScope() !== ownerScope) return null;
  if (cached) {
    if (current.remoteRevision && cached.remoteRevision !== current.remoteRevision) {
      throw new RemoteProjectConflictError(
        "Ce projet a été modifié sur un autre appareil. Choisis la version à conserver.",
        {
          projectId,
          revision: current.remoteRevision,
          chunkCount: current.remoteChunkCount ?? 1,
          encoding: current.remoteEncoding ?? "gzip-base64",
          updatedAt: current.remoteUpdatedAt ?? current.updatedAt,
          deletedAt: current.deletedAt,
          payloadSizeBytes: current.remotePayloadSizeBytes ?? 0,
        },
      );
    }
    const loaded = {
      ...cached.project,
      // Les métadonnées du dashboard sont plus récentes que le cache pour les renommages/corbeille.
      name: current.name,
      creatorName: current.creatorName,
      updatedAt: current.updatedAt,
      deletedAt: current.deletedAt,
      status: current.status,
      thumbnailDataUrl: current.thumbnailDataUrl,
      ...manifestFields({
        projectId,
        revision: current.remoteRevision ?? cached.remoteRevision ?? "",
        chunkCount: current.remoteChunkCount ?? 0,
        encoding: current.remoteEncoding ?? "gzip-base64",
        updatedAt: current.remoteUpdatedAt ?? current.updatedAt,
        deletedAt: current.deletedAt,
        payloadSizeBytes: current.remotePayloadSizeBytes ?? 0,
      }),
      contentLoaded: true,
    } as DromapProject;
    // Ne pas injecter un faux manifeste lorsque le projet n'a jamais été synchronisé.
    if (!current.remoteRevision) {
      loaded.remoteRevision = cached.remoteRevision;
      if (!cached.remoteRevision) {
        loaded.remoteChunkCount = null;
        loaded.remoteEncoding = null;
        loaded.remotePayloadSizeBytes = null;
        loaded.remoteUpdatedAt = null;
      }
    }
    set((state) => ({ projects: updateProject(state.projects, projectId, () => loaded) }));
    return loaded;
  }

  if (current.remoteRevision) {
    try {
      const remote = await fetchRemoteProject(current);
      if (projectCacheScope() !== ownerScope) return null;
      const merged = {
        ...remote,
        name: current.name,
        creatorName: current.creatorName,
        deletedAt: current.deletedAt,
        thumbnailDataUrl: current.thumbnailDataUrl,
        contentLoaded: true,
      };
      set((state) => ({ projects: updateProject(state.projects, projectId, () => merged) }));
      await writeProjectCache(merged);
      return merged;
    } catch {
      return null;
    }
  }
  return null;
}

async function synchronizeSingleProjectOnce(
  projectId: string,
  get: () => DromapProductState,
  set: (partial: Partial<DromapProductState> | ((state: DromapProductState) => Partial<DromapProductState>)) => void,
) {
  const state = get();
  if (state.userMode !== "authenticated" || remoteDeletePending.has(projectId)) return true;
  let project = state.projects.find((item) => item.id === projectId);
  if (!project) return true;
  if (isDromapTrashExpired(project)) {
    cancelQueuedRemoteProjectSync(projectId);
    return true;
  }
  if (project.pendingChanges > 0 && project.status === "unsaved") return true;

  const metadataOnly = remoteMetadataOnly.has(projectId) && Boolean(project.remoteRevision);
  try {
    let manifest: RemoteProjectManifest;
    if (metadataOnly && project.remoteRevision) {
      manifest = await patchRemoteProjectMetadata(project, project.remoteRevision, project.remoteUpdatedAt ?? null, state.accountUserId ?? undefined);
    } else {
      project = (await loadProjectForSync(projectId, get, set)) ?? undefined;
      if (get().accountUserId !== state.accountUserId) return false;
      if (!project) throw new Error("La copie locale complète du projet n’est pas disponible.");
      const projectForRemote: DromapProject = {
        ...project,
        status:
          (project.status === "saving" || project.status === "sync-pending") && project.pendingChanges === 0
            ? project.setupComplete
              ? "saved"
              : "setup-incomplete"
            : project.status,
      };
      manifest = await putRemoteProject(projectForRemote, project.remoteRevision ?? null, project.remoteUpdatedAt ?? null, state.accountUserId ?? undefined);
    }
    if (get().accountUserId !== state.accountUserId) return false;

    const synchronizedUpdatedAt = project.updatedAt;
    remoteMetadataOnly.delete(projectId);
    set((current) => {
      const conflicts = { ...current.projectConflicts };
      delete conflicts[projectId];
      return {
        lastSyncError: null,
        projectConflicts: conflicts,
        projects: updateProject(current.projects, projectId, (item) => {
          const fullContentWasSynchronized =
            !metadataOnly && item.updatedAt === synchronizedUpdatedAt;
          const pendingChanges = fullContentWasSynchronized ? 0 : item.pendingChanges;
          let status = item.status;

          if (item.status !== "trashed" && item.setupComplete) {
            if (fullContentWasSynchronized) status = "saved";
            else if (pendingChanges > 0) status = "unsaved";
            else if (item.status === "sync-pending" || item.status === "saving") status = "saved";
          }

          return {
            ...item,
            ...manifestFields(manifest),
            pendingChanges,
            status,
          };
        }),
      };
    });
    persistState(get());
    return true;
  } catch (error) {
    if (get().accountUserId !== state.accountUserId) return false;
    if (error instanceof RemoteProjectConflictError && error.current) {
      const currentRemote = error.current;
      const local = get().projects.find((item) => item.id === projectId) ?? null;
      const remoteBusinessUpdatedAt =
        typeof currentRemote.metadata?.updatedAt === "string" && currentRemote.metadata.updatedAt
          ? currentRemote.metadata.updatedAt
          : currentRemote.updatedAt;

      // DroMap conserve automatiquement la version métier la plus récente.
      // Les changements de révision purement techniques (miniature, réencodage,
      // reprise réseau...) ne doivent plus provoquer de fausse fenêtre de conflit.
      if (local && local.updatedAt.localeCompare(remoteBusinessUpdatedAt) > 0) {
        set((current) => ({
          lastSyncError: null,
          projects: updateProject(current.projects, projectId, (item) => ({
            ...item,
            ...manifestFields(currentRemote),
          })),
        }));
        persistState(get());
        return synchronizeSingleProjectOnce(projectId, get, set);
      }

      try {
        const remote = await fetchRemoteProject(currentRemote);
        if (get().accountUserId !== state.accountUserId) return false;
        const loaded = { ...remote, contentLoaded: true } satisfies DromapProject;
        set((current) => ({
          lastSyncError: null,
          projects: updateProject(current.projects, projectId, () => loaded),
        }));
        await writeProjectCache(loaded);
        persistState(get());
        return true;
      } catch {
        set({ lastSyncError: "La version en ligne la plus récente n’a pas pu être récupérée." });
        return false;
      }
    }
    const message = error instanceof Error ? error.message : "Synchronisation impossible.";
    set((current) => ({
      lastSyncError: message,
      projects: updateProject(current.projects, projectId, (item) =>
        item.status === "trashed" || !item.setupComplete || item.pendingChanges > 0
          ? item
          : { ...item, status: "sync-pending" },
      ),
    }));
    persistState(get());
    return false;
  }
}

async function synchronizeSingleProject(
  projectId: string,
  get: () => DromapProductState,
  set: (partial: Partial<DromapProductState> | ((state: DromapProductState) => Partial<DromapProductState>)) => void,
) {
  const running = remoteSyncInFlight.get(projectId);
  if (running) {
    remoteSyncAgain.add(projectId);
    return running;
  }

  const task = (async () => {
    let allOk = true;
    do {
      remoteSyncAgain.delete(projectId);
      const ok = await synchronizeSingleProjectOnce(projectId, get, set);
      allOk = allOk && ok;
      if (!ok) {
        remoteSyncAgain.delete(projectId);
        break;
      }
    } while (remoteSyncAgain.has(projectId) && get().userMode === "authenticated");
    return allOk;
  })();

  remoteSyncInFlight.set(projectId, task);
  try {
    return await task;
  } finally {
    remoteSyncInFlight.delete(projectId);
  }
}

function queueRemoteProjectSync(
  projectId: string,
  get: () => DromapProductState,
  set: (partial: Partial<DromapProductState> | ((state: DromapProductState) => Partial<DromapProductState>)) => void,
  delay = 650,
  metadataOnly = false,
) {
  if (
    typeof window === "undefined" ||
    get().userMode !== "authenticated" ||
    remoteDeletePending.has(projectId)
  ) return;
  const project = get().projects.find((item) => item.id === projectId);
  if (!project || isDromapTrashExpired(project)) {
    cancelQueuedRemoteProjectSync(projectId);
    return;
  }
  if (!metadataOnly) remoteMetadataOnly.delete(projectId);
  else if (!remoteMetadataOnly.has(projectId)) remoteMetadataOnly.add(projectId);

  // Hors ligne, ne pas lancer une requête vouée à échouer. Le statut local
  // reste en attente et DromapProductBootstrap relancera la synchronisation
  // dès l'événement `online`.
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  if (remoteSyncInFlight.has(projectId)) {
    remoteSyncAgain.add(projectId);
    return;
  }
  const previous = remoteSyncTimers.get(projectId);
  if (previous !== undefined) window.clearTimeout(previous);
  const timer = window.setTimeout(() => {
    remoteSyncTimers.delete(projectId);
    void synchronizeSingleProject(projectId, get, set);
  }, delay);
  remoteSyncTimers.set(projectId, timer);
}

function cancelQueuedRemoteProjectSync(projectId: string) {
  if (typeof window !== "undefined") {
    const timer = remoteSyncTimers.get(projectId);
    if (timer !== undefined) window.clearTimeout(timer);
  }
  remoteSyncTimers.delete(projectId);
  remoteSyncAgain.delete(projectId);
  remoteMetadataOnly.delete(projectId);
}

function queueRemoteProjectDeletion(
  projectId: string,
  removed: DromapProject,
  get: () => DromapProductState,
  set: (partial: Partial<DromapProductState> | ((state: DromapProductState) => Partial<DromapProductState>)) => void,
) {
  remoteDeletePending.add(projectId);
  cancelQueuedRemoteProjectSync(projectId);

  void (async () => {
    try {
      // Une sauvegarde déjà partie avant le clic peut recréer la ligne distante.
      // On attend donc sa fin, puis on effectue la suppression définitive en dernier.
      const running = remoteSyncInFlight.get(projectId);
      if (running) await running.catch(() => false);

      if (get().userMode !== "authenticated") return;
      await deleteRemoteProject(projectId);
      set({ lastSyncError: null });
    } catch (error) {
      set((state) => ({
        lastSyncError:
          error instanceof Error ? error.message : "Suppression en ligne impossible.",
        projects: state.projects.some((project) => project.id === removed.id)
          ? state.projects
          : [...state.projects, removed],
      }));
      persistState(get());
    } finally {
      remoteDeletePending.delete(projectId);
    }
  })();
}

export const useDromapProductStore = create<DromapProductState>((set, get) => ({
  hydrated: false,
  userMode: "guest",
  accountName: "Utilisateur DroMap",
  accountEmail: null,
  accountUserId: null,
  accountFirstName: null,
  accountLastName: null,
  accountPreferences: {},
  accountPlan: "tester",
  singleMapMaxExportProjectIds: [],
  publicMapExportProjectIds: [],
  accountBackendConfigured: null,
  lastSyncError: null,
  activeProjectId: null,
  projects: [],
  projectConflicts: {},

  bootstrap: async () => {
    if (get().hydrated) return;
    if (bootstrapPromise) {
      await bootstrapPromise;
      return;
    }

    bootstrapPromise = (async () => {
      const stored = await readStorage();
      if (stored) {
        const scope = stored.accountUserId ? `user:${stored.accountUserId}` : "guest";
        for (const project of stored.projects) legacyProjectCacheOwners.set(project.id, scope);
        set({
          userMode: stored.userMode,
          accountName: stored.accountName,
          accountEmail: stored.accountEmail ?? null,
          accountUserId: stored.accountUserId ?? null,
          accountFirstName: stored.accountFirstName ?? null,
          accountLastName: stored.accountLastName ?? null,
          accountPreferences: stored.accountPreferences ?? {},
          accountPlan: stored.accountPlan ?? "tester",
          singleMapMaxExportProjectIds: stored.singleMapMaxExportProjectIds ?? [],
          publicMapExportProjectIds: stored.publicMapExportProjectIds ?? [],
          activeProjectId: stored.activeProjectId,
          projects: stored.projects,
        });
      }

      const session = await getDromapSession();
      set({ accountBackendConfigured: session.configured });

      if (session.authenticated && session.account) {
        await get().activateAuthenticatedAccount(session.account);
      } else if (!session.error && session.configured && get().userMode === "authenticated") {
        const current = get();
        if (current.accountUserId) {
          await projectContentCache.clearOwner(`user:${current.accountUserId}`).catch(() => null);
          // Une vraie session de compte a expiré ou a été supprimée : ne pas exposer les projets privés après déconnexion.
          set({
            userMode: "guest",
            accountName: "Utilisateur DroMap",
            accountEmail: null,
            accountUserId: null,
            accountFirstName: null,
            accountLastName: null,
            accountPreferences: {},
            accountPlan: "tester",
            singleMapMaxExportProjectIds: [],
            publicMapExportProjectIds: [],
            activeProjectId: null,
            projects: [],
          });
        } else {
          // Migration depuis l'ancien faux mode connecté : conserver les projets locaux pour qu'ils puissent être rattachés au premier vrai compte.
          set({
            userMode: "guest",
            accountName: "Utilisateur DroMap",
            accountEmail: null,
            accountUserId: null,
            accountFirstName: null,
            accountLastName: null,
            accountPreferences: {},
            accountPlan: "tester",
            singleMapMaxExportProjectIds: [],
            publicMapExportProjectIds: [],
          });
        }
      } else if (!session.configured && get().userMode === "authenticated") {
        // Le backend n'est pas activé : revenir à l'invité sans supprimer les projets locaux existants.
        set({
          userMode: "guest",
          accountName: "Utilisateur DroMap",
          accountEmail: null,
          accountUserId: null,
          accountFirstName: null,
          accountLastName: null,
          accountPreferences: {},
          accountPlan: "tester",
          singleMapMaxExportProjectIds: [],
          publicMapExportProjectIds: [],
        });
      }

      set({ hydrated: true });
      get().purgeExpiredTrash();
      persistState(get());
    })();

    try {
      await bootstrapPromise;
    } finally {
      bootstrapPromise = null;
    }
  },

  activateAuthenticatedAccount: async (account) => {
    const previous = get();
    // Rattacher seulement le travail invité présent avant cette connexion.
    // Charger son cache sous l'identité invitée avant de changer de compte.
    const previousScope = projectCacheScope();
    if (previous.userMode === "guest") {
      for (const project of previous.projects) {
        if (project.contentLoaded === false) await get().loadProject(project.id);
        if (projectCacheScope() !== previousScope) return;
      }
    }
    const canReuseLocalProjects =
      previous.userMode === "guest" || previous.accountUserId === account.userId;
    const localProjects = (canReuseLocalProjects ? get().projects : []).map((project) => ({
      ...project,
      creatorName:
        previous.userMode === "guest" &&
        (project.creatorName === "Utilisateur DroMap" || project.creatorName === previous.accountName)
          ? account.displayName
          : project.creatorName,
    }));

    set({
      userMode: "authenticated",
      accountName: account.displayName || "Utilisateur DroMap",
      accountEmail: account.email || null,
      accountUserId: account.userId,
      accountFirstName: account.firstName ?? null,
      accountLastName: account.lastName ?? null,
      accountPreferences: account.preferences ?? {},
      accountPlan: normalizeDromapAccountPlan(account.plan),
      singleMapMaxExportProjectIds: Array.from(
        new Set(account.singleMapMaxExportProjectIds ?? []),
      ),
      publicMapExportProjectIds: Array.from(
        new Set(account.publicMapExportProjectIds ?? []),
      ),
      accountBackendConfigured: true,
      projects: localProjects,
      lastSyncError: null,
    });
    persistState(get());

    // Ne pas bloquer l’affichage du dashboard sur Supabase : le cache local
    // est rendu immédiatement, puis les métadonnées légères arrivent en arrière-plan.
    void (async () => {
      try {
        const remoteProjects = await fetchRemoteProjectSummaries();
        if (get().accountUserId !== account.userId) return;
        const remoteById = new Map(remoteProjects.map((project) => [project.id, project]));
        const merged = mergeProjectLists(remoteProjects, get().projects);
        const activeProjectId =
          get().activeProjectId && merged.some((project) => project.id === get().activeProjectId)
            ? get().activeProjectId
            : null;
        set({ projects: merged, activeProjectId, lastSyncError: null });
        persistState(get());
  
        // Les projets locaux plus récents (dont le projet invité rattaché au compte)
        // partent en arrière-plan : la connexion n'attend plus leur transfert complet.
        for (const localProject of localProjects) {
          if (get().accountUserId !== account.userId) return;
          const remoteProject = remoteById.get(localProject.id);
          if (!remoteProject) {
            queueRemoteProjectSync(localProject.id, get, set, 80);
          } else if (
            localProject.status === "sync-pending" ||
            localProject.status === "saving" ||
            localProject.updatedAt.localeCompare(remoteProject.updatedAt) > 0
          ) {
            queueRemoteProjectSync(localProject.id, get, set, 80);
          } else if (remoteProject.name === "Projet DroMap" && localProject.name !== "Projet DroMap") {
            // Migration des projets créés avant l'ajout des métadonnées légères.
            queueRemoteProjectSync(localProject.id, get, set, 120, true);
          }
        }
      } catch (error) {
        if (get().accountUserId !== account.userId) return;
        set({
          lastSyncError:
            error instanceof Error ? error.message : "Chargement des projets en ligne impossible.",
        });
        persistState(get());
  
        // Même si la lecture distante échoue, conserver le travail local et tenter
        // sa synchronisation sans bloquer l'ouverture de l'application.
        for (const localProject of localProjects) {
          queueRemoteProjectSync(localProject.id, get, set, 250);
        }
      }
    })();
  },

  refreshAccountSession: async () => {
    const session = await getDromapSession();
    set({ accountBackendConfigured: session.configured });
    if (session.authenticated && session.account) {
      await get().activateAuthenticatedAccount(session.account);
      return true;
    }
    return false;
  },

  signOutAccount: async () => {
    const ownerScope = projectCacheScope();
    if (get().userMode === "authenticated") {
      const synced = await get().syncAllProjects();
      if (!synced) {
        return {
          ok: false,
          error:
            "Certains projets ne sont pas encore synchronisés. Reconnecte-toi au réseau avant de te déconnecter.",
        };
      }
    }

    if (typeof window !== "undefined") {
      const deviceId = window.localStorage.getItem("dromap-device-id-v1");
      if (deviceId) {
        await fetch("/api/dromap/account/device-session", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
          keepalive: true,
        }).catch(() => null);
      }
    }

    const result = await signOutDromapAccount();
    if (!result.ok) {
      return { ok: false, error: result.error ?? "Déconnexion impossible." };
    }

    for (const timer of remoteSyncTimers.values()) window.clearTimeout(timer);
    remoteSyncTimers.clear();
    remoteSyncAgain.clear();
    remoteMetadataOnly.clear();
    set({
      userMode: "guest",
      accountName: "Utilisateur DroMap",
      accountEmail: null,
      accountUserId: null,
      accountFirstName: null,
      accountLastName: null,
      accountPreferences: {},
      accountPlan: "tester",
      singleMapMaxExportProjectIds: [],
      publicMapExportProjectIds: [],
      activeProjectId: null,
      projects: [],
      projectConflicts: {},
      lastSyncError: null,
    });
    await persistStateDurably(get());
    await projectContentCache.clearOwner(ownerScope).catch(() => null);
    return { ok: true };
  },


  forgetAccountLocally: () => {
    const ownerScope = projectCacheScope();
    const projectIdsToForget = get().projects.map((project) => project.id);
    if (typeof window !== "undefined") {
      for (const timer of remoteSyncTimers.values()) window.clearTimeout(timer);
      for (const projectId of projectIdsToForget) void deleteProjectCache(projectId);
    }
    remoteSyncTimers.clear();
    remoteSyncAgain.clear();
    remoteMetadataOnly.clear();
    set({
      userMode: "guest",
      accountName: "Utilisateur DroMap",
      accountEmail: null,
      accountUserId: null,
      accountFirstName: null,
      accountLastName: null,
      accountPreferences: {},
      accountPlan: "tester",
      singleMapMaxExportProjectIds: [],
      publicMapExportProjectIds: [],
      activeProjectId: null,
      projects: [],
      projectConflicts: {},
      lastSyncError: null,
    });
    persistState(get());
    void projectContentCache.clearOwner(ownerScope).catch(() => null);
  },

  syncProjectNow: async (projectId) => {
    if (get().userMode !== "authenticated") return true;
    get().purgeExpiredTrash();
    const project = get().projects.find((item) => item.id === projectId);
    if (!project || isDromapTrashExpired(project)) return false;
    cancelQueuedRemoteProjectSync(projectId);
    return synchronizeSingleProject(projectId, get, set);
  },

  syncAllProjects: async () => {
    if (get().userMode !== "authenticated") return true;
    get().purgeExpiredTrash();
    const projectIds = get().projects
      .filter((project) =>
        !isDromapTrashExpired(project) && (
          !project.remoteRevision ||
          isProjectLocallyPending(project) ||
          remoteMetadataOnly.has(project.id)
        ),
      )
      .map((project) => project.id);
    let allOk = true;
    for (let index = 0; index < projectIds.length; index += 2) {
      const results = await Promise.all(
        projectIds.slice(index, index + 2).map((projectId) =>
          synchronizeSingleProject(projectId, get, set),
        ),
      );
      allOk = results.every(Boolean) && allOk;
    }
    return allOk;
  },

  refreshRemoteProjects: async () => {
    if (get().userMode !== "authenticated") return true;
    try {
      const remoteProjects = await fetchRemoteProjectSummaries();
      const remoteById = new Map(remoteProjects.map((project) => [project.id, project] as const));
      const currentProjects = get().projects;
      const currentById = new Map(currentProjects.map((project) => [project.id, project] as const));
      const next: DromapProject[] = [];

      for (const remote of remoteProjects) {
        const local = currentById.get(remote.id);
        if (!local) {
          next.push(remote);
          continue;
        }

        const revisionChanged = Boolean(
          remote.remoteRevision && local.remoteRevision !== remote.remoteRevision,
        );
        const serverTimestampChanged = Boolean(
          local.remoteUpdatedAt &&
          remote.remoteUpdatedAt &&
          local.remoteUpdatedAt !== remote.remoteUpdatedAt,
        );
        const serverChanged = revisionChanged || serverTimestampChanged;

        const remoteManifest = remote.remoteRevision
          ? {
              projectId: remote.id,
              revision: remote.remoteRevision,
              chunkCount: remote.remoteChunkCount ?? 1,
              encoding: remote.remoteEncoding ?? "gzip-base64" as const,
              updatedAt: remote.remoteUpdatedAt ?? remote.updatedAt,
              deletedAt: remote.deletedAt,
              payloadSizeBytes: remote.remotePayloadSizeBytes ?? 0,
              metadata: createRemoteProjectMetadata(remote),
            }
          : null;

        const localBusinessIsNewer = local.updatedAt.localeCompare(remote.updatedAt) > 0;
        const localHasPendingSync =
          isProjectLocallyPending(local) ||
          remoteMetadataOnly.has(local.id) ||
          localBusinessIsNewer;

        if (localHasPendingSync) {
          if (serverChanged && remoteManifest) {
            if (local.updatedAt.localeCompare(remote.updatedAt) > 0) {
              const rebasedLocal = { ...local, ...manifestFields(remoteManifest) };
              next.push(rebasedLocal);
              queueRemoteProjectSync(local.id, get, set, 120, remoteMetadataOnly.has(local.id));
            } else {
              // Le serveur contient la modification métier la plus récente.
              next.push(remote);
            }
          } else {
            next.push(local);
            queueRemoteProjectSync(local.id, get, set, 120, remoteMetadataOnly.has(local.id));
          }
          continue;
        }

        if (remote.name === "Projet DroMap" && local.name !== "Projet DroMap" && remote.remoteRevision) {
          next.push({
            ...local,
            remoteRevision: remote.remoteRevision,
            remoteChunkCount: remote.remoteChunkCount,
            remoteEncoding: remote.remoteEncoding,
            remotePayloadSizeBytes: remote.remotePayloadSizeBytes,
            remoteUpdatedAt: remote.remoteUpdatedAt,
          });
          queueRemoteProjectSync(local.id, get, set, 120, true);
          continue;
        }

        const remoteIsNewer =
          remote.updatedAt.localeCompare(local.updatedAt) > 0 || serverChanged;
        next.push(remoteIsNewer ? remote : {
          ...local,
          remoteRevision: remote.remoteRevision,
          remoteChunkCount: remote.remoteChunkCount,
          remoteEncoding: remote.remoteEncoding,
          remotePayloadSizeBytes: remote.remotePayloadSizeBytes,
          remoteUpdatedAt: remote.remoteUpdatedAt,
        });
      }

      for (const local of currentProjects) {
        if (remoteById.has(local.id)) continue;
        if (!local.remoteRevision || isProjectLocallyPending(local)) {
          next.push(local);
          queueRemoteProjectSync(local.id, get, set, 150);
        } else {
          // Le projet a été supprimé depuis un autre appareil. Sa copie locale
          // propre n'est pas réinjectée automatiquement dans le compte.
          void deleteProjectCache(local.id);
        }
      }

      const sorted = next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const activeProjectId = get().activeProjectId && sorted.some((project) => project.id === get().activeProjectId)
        ? get().activeProjectId
        : null;
      set({ projects: sorted, activeProjectId, lastSyncError: null });
      persistState(get());
      return true;
    } catch (error) {
      set({ lastSyncError: error instanceof Error ? error.message : "Actualisation des projets impossible." });
      return false;
    }
  },

  loadProject: async (projectId) => {
    const ownerScope = projectCacheScope();
    const current = get().projects.find((project) => project.id === projectId);
    if (!current) return { ok: false, error: "Projet introuvable." };
    if (current.contentLoaded !== false) return { ok: true };

    const cached = await readProjectCache(projectId);
    if (projectCacheScope() !== ownerScope) return { ok: false, error: "Connexion requise." };
    const knownRemoteRevision = current.remoteRevision ?? null;

    const applyCached = async (cache: ProjectCacheRecord) => {
      const loaded: DromapProject = {
        ...cache.project,
        name: current!.name,
        creatorName: current!.creatorName,
        updatedAt: current!.updatedAt,
        deletedAt: current!.deletedAt,
        status: current!.status,
        thumbnailDataUrl: current!.thumbnailDataUrl,
        remoteRevision: current!.remoteRevision ?? cache.remoteRevision,
        remoteChunkCount: current!.remoteChunkCount ?? cache.project.remoteChunkCount ?? null,
        remoteEncoding: current!.remoteEncoding ?? cache.project.remoteEncoding ?? null,
        remotePayloadSizeBytes: current!.remotePayloadSizeBytes ?? cache.project.remotePayloadSizeBytes ?? null,
        remoteUpdatedAt: current!.remoteUpdatedAt ?? cache.project.remoteUpdatedAt ?? null,
        contentLoaded: true,
      };
      set((state) => ({ projects: updateProject(state.projects, projectId, () => loaded) }));
      await writeProjectCache(loaded);
      persistState(get());
      return loaded;
    };

    if (cached && (!knownRemoteRevision || cached.remoteRevision === knownRemoteRevision)) {
      await applyCached(cached);
      return { ok: true };
    }

    if (cached && knownRemoteRevision && cached.remoteRevision !== knownRemoteRevision && isProjectLocallyPending(current)) {
      const remoteManifest: RemoteProjectManifest = {
        projectId,
        revision: knownRemoteRevision,
        chunkCount: current.remoteChunkCount ?? 1,
        encoding: current.remoteEncoding ?? "gzip-base64",
        updatedAt: current.remoteUpdatedAt ?? current.updatedAt,
        deletedAt: current.deletedAt,
        payloadSizeBytes: current.remotePayloadSizeBytes ?? 0,
      };
      if (cached.project.updatedAt.localeCompare(current.updatedAt) > 0) {
        const loaded = await applyCached(cached);
        const rebased = { ...loaded, ...manifestFields(remoteManifest) };
        set((state) => ({ projects: updateProject(state.projects, projectId, () => rebased) }));
        persistState(get());
        queueRemoteProjectSync(projectId, get, set, 80);
        return { ok: true };
      }
      // La copie distante connue est plus récente : elle est chargée ci-dessous.
    }

    if (knownRemoteRevision) {
      try {
        const remote = await fetchRemoteProject(current);
        if (projectCacheScope() !== ownerScope) return { ok: false, error: "Connexion requise." };
        const loaded = { ...remote, contentLoaded: true } satisfies DromapProject;
        set((state) => ({ projects: updateProject(state.projects, projectId, () => loaded) }));
        await writeProjectCache(loaded);
        persistState(get());
        return { ok: true };
      } catch (error) {
        if (projectCacheScope() !== ownerScope) return { ok: false, error: "Connexion requise." };
        if (cached) {
          await applyCached(cached);
          set({ lastSyncError: "Mode hors ligne : la copie enregistrée sur cet appareil a été ouverte." });
          return { ok: true };
        }
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Le projet n’a pas pu être chargé.",
        };
      }
    }

    if (cached) {
      await applyCached(cached);
      return { ok: true };
    }

    return { ok: false, error: "Ce projet n’est pas encore disponible hors ligne sur cet appareil." };
  },

  resolveProjectConflict: async (projectId, choice) => {
    const ownerId = get().accountUserId;
    const conflict = get().projectConflicts[projectId];
    if (!conflict) return true;
    try {
      if (choice === "remote") {
        const remote = await fetchRemoteProject(conflict.remote);
        if (get().accountUserId !== ownerId) return false;
        const loaded = { ...remote, contentLoaded: true } satisfies DromapProject;
        set((state) => {
          const conflicts = { ...state.projectConflicts };
          delete conflicts[projectId];
          return {
            projectConflicts: conflicts,
            lastSyncError: null,
            projects: updateProject(state.projects, projectId, () => loaded),
          };
        });
        await writeProjectCache(loaded);
        persistState(get());
        return true;
      }

      let local = get().projects.find((project) => project.id === projectId) ?? null;
      if (!local || local.contentLoaded === false) {
        const cached = await readProjectCache(projectId);
        if (get().accountUserId !== ownerId) return false;
        local = cached?.project ?? null;
      }
      if (!local) throw new Error("La copie locale du projet n’est plus disponible.");
      const manifest = await putRemoteProject(
        { ...local, contentLoaded: true, remoteUpdatedAt: conflict.remote.updatedAt },
        conflict.remote.revision,
        conflict.remote.updatedAt,
        ownerId ?? undefined,
      );
      if (get().accountUserId !== ownerId) return false;
      const resolved = {
        ...local,
        ...manifestFields(manifest),
        contentLoaded: true,
        status: local.setupComplete ? "saved" : "setup-incomplete",
        pendingChanges: 0,
      } satisfies DromapProject;
      set((state) => {
        const conflicts = { ...state.projectConflicts };
        delete conflicts[projectId];
        return {
          projectConflicts: conflicts,
          lastSyncError: null,
          projects: updateProject(state.projects, projectId, () => resolved),
        };
      });
      await writeProjectCache(resolved);
      persistState(get());
      return true;
    } catch (error) {
      if (error instanceof RemoteProjectConflictError && error.current) {
        registerProjectConflict(projectId, error.current, get, set);
      } else {
        set({ lastSyncError: error instanceof Error ? error.message : "Résolution du conflit impossible." });
      }
      return false;
    }
  },

  setAccountName: async (name) => {
    const safeName = name.trim() || "Utilisateur DroMap";
    const parts = safeName.split(/\s+/);
    const firstName = parts.shift() ?? "";
    const lastName = parts.join(" ");
    return get().setAccountProfile(firstName, lastName, get().accountPreferences);
  },

  setAccountProfile: async (firstName, lastName, preferences = get().accountPreferences) => {
    const safeFirstName = firstName.trim().slice(0, 80);
    const safeLastName = lastName.trim().slice(0, 80);
    const displayName = [safeFirstName, safeLastName].filter(Boolean).join(" ") || "Utilisateur DroMap";
    const before = get();

    if (before.userMode === "authenticated") {
      const result = await updateDromapProfile({
        firstName: safeFirstName,
        lastName: safeLastName,
        preferences,
      });
      if (!result.ok || !result.data) {
        set({ lastSyncError: result.error ?? "Le profil n’a pas pu être synchronisé." });
        return false;
      }
    }

    const changedIds: string[] = [];
    set((current) => ({
      accountName: displayName,
      accountFirstName: safeFirstName || null,
      accountLastName: safeLastName || null,
      accountPreferences: preferences,
      lastSyncError: before.userMode === "authenticated" ? null : current.lastSyncError,
      projects: current.projects.map((project) => {
        if (project.creatorName === current.accountName) {
          changedIds.push(project.id);
          return { ...project, creatorName: displayName, updatedAt: nowIso() };
        }
        return project;
      }),
    }));
    schedulePersist(get);

    if (before.userMode === "authenticated") {
      for (const id of changedIds) queueRemoteProjectSync(id, get, set, 120, true);
    }
    return true;
  },

  setActiveProjectId: (projectId) => {
    set({ activeProjectId: projectId });
    schedulePersist(get);
  },

  createProject: (options = {}) => {
    const state = get();
    if (options.id && state.projects.some(project => project.id === options.id)) return null;
    const activeProjects = state.projects.filter((project) => project.status !== "trashed");
    if (
      state.userMode === "guest" &&
      activeProjects.length > 0 &&
      options.replaceGuestProject !== true
    ) {
      return null;
    }

    const resolvedPreferences = resolveDromapPreferences(state.accountPreferences);
    const shouldSkipSetup =
      options.setupComplete === undefined &&
      options.snapshot == null &&
      resolvedPreferences.skipProjectSetup;
    const effectiveOptions: CreateProjectOptions = shouldSkipSetup
      ? {
          ...options,
          setupComplete: true,
          initialBasemapId: getQuickStartBasemapId(state.accountPreferences),
          quickStartLayerChoice: resolvedPreferences.quickStartCreateLayer1
            ? "empty"
            : "none",
        }
      : options;

    const project = createProjectRecord(state, effectiveOptions);
    const nextProjects =
      state.userMode === "guest" && options.replaceGuestProject === true
        ? [...state.projects.filter((existing) => existing.status === "trashed"), project]
        : [...state.projects, project];

    set({ projects: nextProjects, activeProjectId: project.id });
    schedulePersist(get);
    queueRemoteProjectSync(project.id, get, set, 0);
    return project.id;
  },

  duplicateProject: async (projectId) => {
    const state = get();
    if (state.userMode === "guest") return null;
    const initialSource = state.projects.find((project) => project.id === projectId);
    if (!initialSource || initialSource.status === "trashed") return null;

    if (initialSource.contentLoaded === false) {
      const loaded = await get().loadProject(projectId);
      if (!loaded.ok) {
        set({ lastSyncError: "error" in loaded ? loaded.error : "Le projet n’a pas pu être chargé." });
        return null;
      }
    }
    const source = get().projects.find((project) => project.id === projectId);
    if (!source || source.contentLoaded === false) return null;

    const timestamp = nowIso();
    const copy: DromapProject = {
      ...cloneValue(source),
      id: createDromapProjectId(),
      name: `${source.name} — copie`,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSavedAt: source.editorSnapshot ? timestamp : null,
      deletedAt: null,
      status: source.setupComplete ? "saved" : "setup-incomplete",
      pendingChanges: 0,
      aiConversation: [],
      contentLoaded: true,
      remoteRevision: null,
      remoteChunkCount: null,
      remoteEncoding: null,
      remotePayloadSizeBytes: null,
      remoteUpdatedAt: null,
    };

    set({ projects: [...get().projects, copy], activeProjectId: copy.id });
    persistState(get());
    queueRemoteProjectSync(copy.id, get, set, 0);
    return copy.id;
  },

  setProjectSourceAttribution: (projectId, patch) => {
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => {
        const current = project.sourceAttribution;
        if (!current || current.kind !== "public-map") return project;
        const hidden = current.allowRemoval
          ? patch.hidden ?? current.hidden
          : false;
        return {
          ...project,
          sourceAttribution: {
            ...current,
            position: patch.position ?? current.position,
            mapPosition:
              patch.mapPosition !== undefined
                ? patch.mapPosition
                  ? {
                      x: Math.max(0, Math.min(1, patch.mapPosition.x)),
                      y: Math.max(0, Math.min(1, patch.mapPosition.y)),
                    }
                  : null
                : current.mapPosition ?? null,
            hidden,
          },
          updatedAt: nowIso(),
        };
      }),
    }));
    schedulePersist(get);
    // Le crédit fait partie du projet exportable : sa position libre doit être
    // enregistrée dans les chunks du projet, pas seulement dans les métadonnées.
    queueRemoteProjectSync(projectId, get, set, 120);
  },

  setProjectAiConversation: (projectId, messages) => {
    const normalized = normalizeProjectAiConversation(messages);
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        aiConversation: cloneValue(normalized),
        updatedAt: nowIso(),
      })),
    }));
    schedulePersist(get);
    // La discussion appartient au projet : on la synchronise dans les chunks du projet
    // sans incrémenter l'historique ni le compteur de modifications cartographiques.
    queueRemoteProjectSync(projectId, get, set, 350);
  },

  renameProject: (projectId, name) => {
    const safeName = name.trim() || "Projet sans titre";
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        name: safeName,
        updatedAt: nowIso(),
      })),
    }));
    schedulePersist(get);
    queueRemoteProjectSync(projectId, get, set, 120, true);
  },

  updateProjectSetup: (projectId, patch) => {
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        status: "setup-incomplete",
        updatedAt: nowIso(),
        setup: { ...project.setup, ...cloneValue(patch) },
      })),
    }));
    schedulePersist(get);
    queueRemoteProjectSync(projectId, get, set);
  },

  setSetupStep: (projectId, step) => {
    get().updateProjectSetup(projectId, { currentStep: step });
  },

  completeSetupStep: (projectId, step) => {
    const project = get().projects.find((item) => item.id === projectId);
    if (!project) return;
    get().updateProjectSetup(projectId, {
      currentStep: step,
      completedSteps: Array.from(new Set([...project.setup.completedSteps, step])),
    });
  },

  setProjectBasemap: (projectId, basemapId) => {
    get().updateProjectSetup(projectId, { basemapId });
  },

  setProjectWorkspace: (projectId, workspaceBounds) => {
    get().updateProjectSetup(projectId, { workspaceBounds: cloneValue(workspaceBounds) });
  },

  setProjectWorkspaceView: (projectId, workspaceView) => {
    get().updateProjectSetup(projectId, { workspaceView: normalizeDromapMapView(workspaceView) });
  },

  setProjectLayerChoice: (projectId, choice) => {
    get().updateProjectSetup(projectId, { layerChoice: cloneValue(choice) });
  },

  completeProjectSetup: (projectId) => {
    set((state) => ({
      activeProjectId: projectId,
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        setupComplete: true,
        status: project.editorSnapshot ? "saved" : "editing",
        updatedAt: nowIso(),
        setup: { ...project.setup, currentStep: 4, completedSteps: [1, 2, 3, 4] },
      })),
    }));
    schedulePersist(get);
    queueRemoteProjectSync(projectId, get, set, 0);
  },

  markProjectDirty: (projectId) => {
    let nextCount = 0;
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => {
        nextCount = project.pendingChanges + 1;
        return {
          ...project,
          pendingChanges: nextCount,
          status: "unsaved",
          updatedAt: nowIso(),
        };
      }),
    }));
    schedulePersist(get);
    return nextCount;
  },

  markProjectSaving: (projectId) => {
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        status: "saving",
      })),
    }));
    schedulePersist(get);
  },

  checkpointProjectSnapshot: async (projectId, snapshot) => {
    const timestamp = nowIso();
    const authenticated = get().userMode === "authenticated";
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        editorSnapshot: cloneValue(snapshot),
        // Un checkpoint protège le travail sur l'appareil sans forcer un envoi
        // réseau à chaque geste. pendingChanges reste donc inchangé.
        status:
          project.status === "trashed"
            ? "trashed"
            : authenticated && project.pendingChanges > 0
              ? "sync-pending"
              : "saved",
        setupComplete: true,
        lastSavedAt: timestamp,
        updatedAt: timestamp,
      })),
    }));

    await persistStateDurably(get(), [projectId]);

    // Si une synchronisation avait déjà commencé pendant que l'utilisateur
    // modifiait encore le projet, une seconde passe devra envoyer ce checkpoint.
    if (authenticated && remoteSyncInFlight.has(projectId)) {
      remoteSyncAgain.add(projectId);
    }
  },

  saveProjectSnapshot: async (projectId, snapshot) => {
    const timestamp = nowIso();
    const authenticated = get().userMode === "authenticated";
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        editorSnapshot: cloneValue(snapshot),
        pendingChanges: 0,
        // Le travail est sécurisé localement avant que la copie en ligne parte
        // en arrière-plan. Une navigation n'attend donc jamais Supabase.
        status: authenticated ? "sync-pending" : "saved",
        setupComplete: true,
        lastSavedAt: timestamp,
        updatedAt: timestamp,
      })),
    }));

    // Navigation/fermeture : ne rendre la main qu'une fois la copie IndexedDB
    // du projet terminée. La synchronisation distante reste asynchrone.
    await persistStateDurably(get(), [projectId]);

    if (authenticated) {
      queueRemoteProjectSync(projectId, get, set, 120);
    }
  },

  setProjectThumbnail: (projectId, thumbnailDataUrl) => {
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        thumbnailDataUrl,
      })),
    }));
    schedulePersist(get);
    queueRemoteProjectSync(projectId, get, set, 120, true);
  },

  markProjectSyncPending: (projectId) => {
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        status: project.setupComplete ? "sync-pending" : "setup-incomplete",
      })),
    }));
    schedulePersist(get);
  },

  trashProject: (projectId) => {
    const timestamp = nowIso();
    set((state) => ({
      activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        status: "trashed",
        deletedAt: timestamp,
        updatedAt: timestamp,
      })),
    }));
    schedulePersist(get);
    queueRemoteProjectSync(projectId, get, set, 0, true);
  },

  restoreProject: (projectId) => {
    set((state) => ({
      projects: updateProject(state.projects, projectId, (project) => ({
        ...project,
        status: project.setupComplete ? "saved" : "setup-incomplete",
        deletedAt: null,
        updatedAt: nowIso(),
      })),
    }));
    schedulePersist(get);
    queueRemoteProjectSync(projectId, get, set, 0, true);
  },

  permanentlyDeleteProject: (projectId) => {
    const removed = get().projects.find((project) => project.id === projectId) ?? null;
    set((state) => ({
      activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
      projects: state.projects.filter((project) => project.id !== projectId),
    }));
    schedulePersist(get);
    void deleteProjectCache(projectId);
    if (get().userMode === "authenticated" && removed) {
      queueRemoteProjectDeletion(projectId, removed, get, set);
    }
  },

  emptyTrash: () => {
    const removedProjects = get().projects.filter((project) => project.status === "trashed");
    set((state) => ({
      projects: state.projects.filter((project) => project.status !== "trashed"),
    }));
    schedulePersist(get);
    for (const removed of removedProjects) {
      void deleteProjectCache(removed.id);
      if (get().userMode === "authenticated") {
        queueRemoteProjectDeletion(removed.id, removed, get, set);
      }
    }
  },

  purgeExpiredTrash: () => {
    const now = Date.now();
    const expiredProjects = get().projects.filter((project) => isDromapTrashExpired(project, now));
    if (expiredProjects.length === 0) return;

    for (const removed of expiredProjects) cancelQueuedRemoteProjectSync(removed.id);
    const expiredIds = new Set(expiredProjects.map((project) => project.id));
    set((state) => ({
      activeProjectId:
        state.activeProjectId && expiredIds.has(state.activeProjectId)
          ? null
          : state.activeProjectId,
      projects: state.projects.filter((project) => !expiredIds.has(project.id)),
    }));
    schedulePersist(get);

    // Le cache local est toujours nettoyé, y compris en mode invité.
    // Côté compte, le cron Supabase supprime également les lignes expirées ;
    // cette requête immédiate n'est qu'un rattrapage si l'application est ouverte.
    for (const removed of expiredProjects) {
      void deleteProjectCache(removed.id);
      if (get().userMode === "authenticated" && typeof navigator !== "undefined" && navigator.onLine) {
        queueRemoteProjectDeletion(removed.id, removed, get, set);
      }
    }
  },

  flushPersistence: async () => {
    await persistStateDurably(get());
  },
}));
