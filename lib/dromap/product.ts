import type { DromapBasemapId } from "@/lib/dromap/basemap";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import type { DroMapSavedLayer } from "@/stores/editor-layers";
import type { DromapGeoJsonLayer } from "@/stores/editor-geojson-layers";
import type { DromapEditorProjectSnapshot } from "@/lib/dromap/editor-project-persistence";
import type { DromapMapView } from "@/lib/dromap/map-view";
import type { DromapAccountPlan } from "@/lib/dromap/plans";
import type { DromapCreatorCreditPosition } from "@/lib/dromap/publications";

export type DromapUserMode = "guest" | "authenticated";

export type DromapProjectStatus =
  | "setup-incomplete"
  | "editing"
  | "unsaved"
  | "saving"
  | "saved"
  | "sync-pending"
  | "trashed";

export type DromapSetupStep = 1 | 2 | 3 | 4;

export type DromapInitialLayerChoice =
  | { kind: "empty" }
  | { kind: "none" }
  | { kind: "saved"; savedLayer: DroMapSavedLayer }
  | { kind: "geojson"; geoJsonLayer: DromapGeoJsonLayer };

export type DromapProjectSetup = {
  currentStep: DromapSetupStep;
  completedSteps: DromapSetupStep[];
  basemapId: DromapBasemapId;
  workspaceBounds: WorkspaceBounds | null;
  workspaceView: DromapMapView | null;
  layerChoice: DromapInitialLayerChoice | null;
};

export type DromapProjectAiMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  text: string;
  createdAt: string;
};

export type DromapPublicSourceAttribution = {
  kind: "public-map";
  publicationSlug: string;
  creatorName: string;
  allowRemoval: boolean;
  /** Position historique par coin, conservée pour la compatibilité des projets déjà créés. */
  position: DromapCreatorCreditPosition;
  /** Position libre normalisée dans le rectangle de carte (centre du crédit). */
  mapPosition?: { x: number; y: number } | null;
  hidden: boolean;
};

export type DromapProject = {
  id: string;
  name: string;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string | null;
  deletedAt: string | null;
  status: DromapProjectStatus;
  setupComplete: boolean;
  setup: DromapProjectSetup;
  editorSnapshot: DromapEditorProjectSnapshot | null;
  pendingChanges: number;
  thumbnailDataUrl: string | null;
  importedFileName: string | null;
  sourceAttribution?: DromapPublicSourceAttribution | null;
  /** Discussion IA propre au projet, synchronisée avec le projet sans entrer dans l'historique cartographique. */
  aiConversation?: DromapProjectAiMessage[];

  /** État de cache/synchronisation, non inclus dans le Projet DroMap exporté. */
  contentLoaded?: boolean;
  remoteRevision?: string | null;
  remoteChunkCount?: number | null;
  remoteEncoding?: "gzip-base64" | "base64" | null;
  remotePayloadSizeBytes?: number | null;
  remoteUpdatedAt?: string | null;
};

export type DromapCapabilities = {
  canUseAi: boolean;
  canImportBuildings: boolean;
  canUseGeoJsonLibrary: boolean;
  canUseAdvancedLegend: boolean;
  canExportHighQuality: boolean;
  canExportOtherVisualFormats: boolean;
  canCustomizeBasemapRender: boolean;
  canExportProjectData: boolean;
  canSaveLayersToLibrary: boolean;
  canCreateCustomMarkers: boolean;
  canSaveCustomMarkersToLibrary: boolean;
  canSaveOnline: boolean;
  canPublishPublicMaps: boolean;
  canDownloadPublicMaps: boolean;
};

export const DROMAP_TRASH_RETENTION_DAYS = 10;

const DROMAP_DAY_MS = 24 * 60 * 60 * 1000;

export function getDromapTrashDeletionAt(project: Pick<DromapProject, "deletedAt">) {
  if (!project.deletedAt) return null;
  const deletedAt = new Date(project.deletedAt).getTime();
  if (!Number.isFinite(deletedAt)) return null;
  return new Date(deletedAt + DROMAP_TRASH_RETENTION_DAYS * DROMAP_DAY_MS).toISOString();
}

export function isDromapTrashExpired(
  project: Pick<DromapProject, "status" | "deletedAt">,
  now = Date.now(),
) {
  if (project.status !== "trashed" || !project.deletedAt) return false;
  const deletedAt = new Date(project.deletedAt).getTime();
  return Number.isFinite(deletedAt) && now - deletedAt >= DROMAP_TRASH_RETENTION_DAYS * DROMAP_DAY_MS;
}

export function getDromapTrashRemainingDays(
  project: Pick<DromapProject, "deletedAt">,
  now = Date.now(),
) {
  const deletionAt = getDromapTrashDeletionAt(project);
  if (!deletionAt) return DROMAP_TRASH_RETENTION_DAYS;
  const remainingMs = new Date(deletionAt).getTime() - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / DROMAP_DAY_MS));
}

export function getDromapCapabilities(
  mode: DromapUserMode,
  plan: DromapAccountPlan = "tester",
  options: { singleMapMaxExport?: boolean; publicMapExport?: boolean } = {},
): DromapCapabilities {
  if (mode === "guest") {
    return {
      canUseAi: false,
      canImportBuildings: false,
      canUseGeoJsonLibrary: false,
      canUseAdvancedLegend: false,
      canExportHighQuality: false,
      canExportOtherVisualFormats: false,
      canCustomizeBasemapRender: false,
      canExportProjectData: false,
      canSaveLayersToLibrary: false,
      canCreateCustomMarkers: false,
      canSaveCustomMarkersToLibrary: false,
      canSaveOnline: false,
      canPublishPublicMaps: false,
      canDownloadPublicMaps: false,
    };
  }

  const premium = plan === "plus" || plan === "pro" || plan === "tester";
  const singleMapMaxExport = options.singleMapMaxExport === true;
  const publicMapExport = options.publicMapExport === true;
  const visualExportPremium = premium || singleMapMaxExport || publicMapExport;
  const canExportHighQuality = visualExportPremium;
  const canExportOtherVisualFormats = visualExportPremium;
  const canCustomizeBasemapRender = visualExportPremium;

  return {
    canUseAi: premium,
    canImportBuildings: premium,
    // La bibliothèque de données DroMap nécessite au minimum un compte.
    // L'import d'un fichier GeoJSON local reste indépendant de cette règle.
    canUseGeoJsonLibrary: true,
    canUseAdvancedLegend: premium,
    canExportHighQuality,
    canExportOtherVisualFormats,
    canCustomizeBasemapRender,
    canExportProjectData: premium,
    canSaveLayersToLibrary: premium,
    canCreateCustomMarkers: premium,
    canSaveCustomMarkersToLibrary: premium,
    canSaveOnline: true,
    canPublishPublicMaps: premium,
    canDownloadPublicMaps: premium,
  };
}

export function createDromapProjectId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `dromap-project-${crypto.randomUUID()}`;
  }

  return `dromap-project-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createDefaultProjectSetup(
  basemapId: DromapBasemapId,
): DromapProjectSetup {
  return {
    currentStep: 1,
    completedSteps: [],
    basemapId,
    workspaceBounds: null,
    workspaceView: null,
    layerChoice: null,
  };
}

export function getProjectStatusLabel(
  project: DromapProject,
  mode: DromapUserMode,
) {
  if (project.status === "saving") return "Enregistrement…";
  if (project.status === "unsaved") {
    return mode === "guest"
      ? "Enregistré sur cet appareil"
      : "Synchronisation en attente";
  }
  if (project.status === "sync-pending") return "Synchronisation en attente";
  if (project.status === "setup-incomplete") return "Configuration incomplète";
  if (project.status === "trashed") return "Dans la corbeille";
  if (mode === "guest") return "Enregistré sur cet appareil";
  return "Enregistré";
}
