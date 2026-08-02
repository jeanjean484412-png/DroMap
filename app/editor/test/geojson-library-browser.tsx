"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  parseGeoJsonTextToDromapGeoJsonLayer,
  type DromapGeoJsonPrecisionMode,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

import {
  DROMAP_GEOJSON_CATALOG,
  DROMAP_GEOJSON_CATALOG_CATEGORIES,
  type DromapGeoJsonCatalogCategory,
  type DromapGeoJsonCatalogEntry,
} from "./geojson-data-catalog";
import { GEOBOUNDARIES_COUNTRIES } from "./geojson-geoboundaries-countries";

type GeoJsonLibraryBrowserProps = {
  precisionMode: DromapGeoJsonPrecisionMode;
  onPrecisionModeChange: (mode: DromapGeoJsonPrecisionMode) => void;
};

type CatalogCategoryFilter = "all" | DromapGeoJsonCatalogCategory;
type GeoBoundariesAdmLevel =
  | "ADM0"
  | "ADM1"
  | "ADM2"
  | "ADM3"
  | "ADM4"
  | "ADM5";
type GeoBoundariesGeometryMode = "simplified" | "original";

type HeavyWithoutWorkspacePrompt = {
  datasetId: string;
  kind: "catalog" | "geoboundaries";
  title: string;
};

type GeoBoundariesMetadata = {
  boundaryId: string;
  boundaryName: string;
  boundaryIso: string;
  boundaryType: string;
  boundaryYearRepresented: string;
  boundarySource: string;
  boundaryLicense: string;
  licenseSource: string;
  buildDate: string;
  admUnitCount: number | null;
  meanVertices: number | null;
  gjDownloadUrl: string;
  simplifiedGeometryGeoJson: string;
};

type GeoBoundariesAvailabilityResponse =
  | {
      ok: true;
      availableLevels: GeoBoundariesAdmLevel[];
      metadata: GeoBoundariesMetadata;
      sourceUrl: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      availableLevels: GeoBoundariesAdmLevel[];
    };

type PendingGeoBoundariesDownload = {
  datasetId: string;
  countryLabel: string;
  geometryMode: GeoBoundariesGeometryMode;
  metadataUrl: string;
  downloadUrl: string;
  metadata: GeoBoundariesMetadata;
};

const CATALOG_PAGE_SIZE = 12;
const GEOBOUNDARIES_SOURCE_URL = "https://www.geoboundaries.org/";
const GEOBOUNDARIES_HEAVY_UNIT_THRESHOLD = 500;
const GEOBOUNDARIES_HEAVY_MEAN_VERTICES_THRESHOLD = 20_000;

const PRECISION_OPTIONS: Array<{
  value: DromapGeoJsonPrecisionMode;
  label: string;
}> = [
  { value: "original", label: "Originale" },
  { value: "intermediate", label: "Intermédiaire" },
  { value: "light", label: "Légère" },
];

const ADM_LEVEL_OPTIONS: Array<{
  value: GeoBoundariesAdmLevel;
  label: string;
}> = [
  { value: "ADM0", label: "ADM0 — contour du pays" },
  { value: "ADM1", label: "ADM1 — régions, États ou provinces" },
  { value: "ADM2", label: "ADM2 — départements, comtés ou districts" },
  { value: "ADM3", label: "ADM3 — niveau administratif 3" },
  { value: "ADM4", label: "ADM4 — niveau administratif 4" },
  { value: "ADM5", label: "ADM5 — niveau administratif 5" },
];

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .trim();
}

function catalogEntryMatchesSearch(
  entry: DromapGeoJsonCatalogEntry,
  normalizedQuery: string,
) {
  if (!normalizedQuery) {
    return true;
  }

  const searchableText = normalizeSearchText(
    [
      entry.title,
      entry.description,
      entry.geography,
      entry.sourceLabel,
      entry.sourceLicense,
      ...entry.keywords,
    ].join(" "),
  );

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => searchableText.includes(term));
}

function getPrecisionLabel(mode: DromapGeoJsonPrecisionMode) {
  return (
    PRECISION_OPTIONS.find((option) => option.value === mode)?.label ??
    "Originale"
  );
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getRecordNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseGeoBoundariesMetadata(value: unknown): GeoBoundariesMetadata {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || typeof candidate !== "object") {
    throw new Error("La réponse geoBoundaries ne contient pas de métadonnées exploitables.");
  }

  const record = candidate as Record<string, unknown>;
  const boundaryName = getRecordString(record, "boundaryName");
  const boundaryType = getRecordString(record, "boundaryType");
  const gjDownloadUrl = getRecordString(record, "gjDownloadURL");
  const simplifiedGeometryGeoJson = getRecordString(
    record,
    "simplifiedGeometryGeoJSON",
  );

  if (!boundaryName || !boundaryType || (!gjDownloadUrl && !simplifiedGeometryGeoJson)) {
    throw new Error("Ce niveau administratif n’est pas disponible dans geoBoundaries.");
  }

  return {
    boundaryId: getRecordString(record, "boundaryID"),
    boundaryName,
    boundaryIso: getRecordString(record, "boundaryISO"),
    boundaryType,
    boundaryYearRepresented: getRecordString(
      record,
      "boundaryYearRepresented",
    ),
    boundarySource: getRecordString(record, "boundarySource"),
    boundaryLicense: getRecordString(record, "boundaryLicense"),
    licenseSource: getRecordString(record, "licenseSource"),
    buildDate: getRecordString(record, "buildDate"),
    admUnitCount: getRecordNumber(record, "admUnitCount"),
    meanVertices: getRecordNumber(record, "meanVertices"),
    gjDownloadUrl,
    simplifiedGeometryGeoJson,
  };
}

function formatGeoBoundariesUnitCount(value: number | null) {
  if (value === null) {
    return "nombre d’unités non indiqué";
  }

  return `${Math.round(value).toLocaleString("fr-FR")} unité${value > 1 ? "s" : ""}`;
}

function isGeoBoundariesMetadataHeavy(
  metadata: GeoBoundariesMetadata,
  geometryMode: GeoBoundariesGeometryMode,
) {
  return (
    geometryMode === "original" ||
    (metadata.admUnitCount ?? 0) >= GEOBOUNDARIES_HEAVY_UNIT_THRESHOLD ||
    (metadata.meanVertices ?? 0) >= GEOBOUNDARIES_HEAVY_MEAN_VERTICES_THRESHOLD
  );
}


function getWorkspaceBboxParameter(workspaceBounds: {
  southWest: { lat: number; lng: number };
  northEast: { lat: number; lng: number };
} | null) {
  if (!workspaceBounds) {
    return null;
  }

  return [
    workspaceBounds.southWest.lng,
    workspaceBounds.southWest.lat,
    workspaceBounds.northEast.lng,
    workspaceBounds.northEast.lat,
  ].join(",");
}

function geometryIntersectsWorkspace(
  geometry: unknown,
  workspaceBounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  },
) {
  if (!geometry || typeof geometry !== "object") {
    return false;
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) {
    return false;
  }

  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  const stack: unknown[] = [coordinates];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!Array.isArray(current)) {
      continue;
    }

    if (
      current.length >= 2 &&
      typeof current[0] === "number" &&
      typeof current[1] === "number" &&
      Number.isFinite(current[0]) &&
      Number.isFinite(current[1])
    ) {
      const lng = current[0];
      const lat = current[1];
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      continue;
    }

    for (const child of current) {
      if (Array.isArray(child)) {
        stack.push(child);
      }
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) {
    return false;
  }

  return !(
    east < workspaceBounds.southWest.lng ||
    west > workspaceBounds.northEast.lng ||
    north < workspaceBounds.southWest.lat ||
    south > workspaceBounds.northEast.lat
  );
}

function filterGeoJsonTextToWorkspace(
  text: string,
  workspaceBounds: {
    southWest: { lat: number; lng: number };
    northEast: { lat: number; lng: number };
  } | null,
) {
  if (!workspaceBounds) {
    return { text, keptCount: null as number | null, originalCount: null as number | null };
  }

  const parsed = JSON.parse(text) as {
    type?: unknown;
    features?: unknown;
  };

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    return { text, keptCount: null as number | null, originalCount: null as number | null };
  }

  const originalCount = parsed.features.length;
  const features = parsed.features.filter((feature) => {
    if (!feature || typeof feature !== "object") {
      return false;
    }

    return geometryIntersectsWorkspace(
      (feature as { geometry?: unknown }).geometry,
      workspaceBounds,
    );
  });

  return {
    text: JSON.stringify({ ...parsed, features }),
    keptCount: features.length,
    originalCount,
  };
}

export function GeoJsonLibraryBrowser({
  precisionMode,
  onPrecisionModeChange,
}: GeoJsonLibraryBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] =
    useState<CatalogCategoryFilter>("all");
  const [visibleCatalogCount, setVisibleCatalogCount] =
    useState(CATALOG_PAGE_SIZE);
  const [loadingDatasetId, setLoadingDatasetId] = useState<string | null>(null);
  const [confirmedHeavyDatasetId, setConfirmedHeavyDatasetId] = useState<
    string | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [geoBoundariesCountryIso3, setGeoBoundariesCountryIso3] =
    useState("FRA");
  const [geoBoundariesAdmLevel, setGeoBoundariesAdmLevel] =
    useState<GeoBoundariesAdmLevel>("ADM1");
  const [geoBoundariesGeometryMode, setGeoBoundariesGeometryMode] =
    useState<GeoBoundariesGeometryMode>("simplified");
  const [verifiedGeoBoundariesLevels, setVerifiedGeoBoundariesLevels] =
    useState<GeoBoundariesAdmLevel[] | null>(null);
  const [pendingGeoBoundariesDownload, setPendingGeoBoundariesDownload] =
    useState<PendingGeoBoundariesDownload | null>(null);
  const [heavyWithoutWorkspacePrompt, setHeavyWithoutWorkspacePrompt] =
    useState<HeavyWithoutWorkspacePrompt | null>(null);
  const allowedHeavyWithoutWorkspaceIdsRef = useRef(new Set<string>());

  const geoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const addGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.addGeoJsonLayer,
  );
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const modifyWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );
  const closeImportPanel = useEditorTestExportStore(
    (state) => state.closeImportPanel,
  );
  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );
  const requestMapFitToBounds = useEditorTestSelectionStore(
    (state) => state.requestMapFitToBounds,
  );

  const appliedDatasetIds = useMemo(
    () =>
      new Set(
        geoJsonLayers
          .map((layer) => layer.catalogDatasetId)
          .filter((datasetId): datasetId is string => Boolean(datasetId)),
      ),
    [geoJsonLayers],
  );

  const filteredEntries = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);

    return DROMAP_GEOJSON_CATALOG.filter((entry) => {
      if (categoryFilter !== "all" && entry.category !== categoryFilter) {
        return false;
      }

      return catalogEntryMatchesSearch(entry, normalizedQuery);
    });
  }, [categoryFilter, searchQuery]);

  const visibleEntries = filteredEntries.slice(0, visibleCatalogCount);
  const selectedGeoBoundariesCountry =
    GEOBOUNDARIES_COUNTRIES.find(
      (country) => country.alpha3 === geoBoundariesCountryIso3,
    ) ?? GEOBOUNDARIES_COUNTRIES[0];
  const geoBoundariesDatasetId = `geoboundaries-gbopen-${geoBoundariesCountryIso3}-${geoBoundariesAdmLevel}`;
  const isGeoBoundariesAlreadyApplied = appliedDatasetIds.has(
    geoBoundariesDatasetId,
  );

  useEffect(() => {
    if (!heavyWithoutWorkspacePrompt || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setHeavyWithoutWorkspacePrompt(null);
      setStatus("Téléchargement annulé. Aucun GeoJSON n’a été téléchargé.");
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [heavyWithoutWorkspacePrompt]);

  async function fetchTextWithTimeout(
    url: string,
    timeoutMs: number,
    errorContext: string,
  ) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        let remoteMessage = "";

        try {
          const payload = (await response.json()) as {
            message?: unknown;
          };
          remoteMessage =
            typeof payload.message === "string" ? payload.message.trim() : "";
        } catch {
          remoteMessage = "";
        }

        throw new Error(
          remoteMessage ||
            `${errorContext} a répondu avec le code ${response.status}.`,
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Le téléchargement a dépassé ${Math.round(timeoutMs / 1000)} secondes. Vérifie la connexion puis réessaie.`,
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          `${errorContext} est momentanément inaccessible. La requête réseau a été bloquée ou interrompue.`,
        );
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function fetchJsonWithTimeout<T>(
    url: string,
    timeoutMs: number,
    errorContext: string,
  ) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
      });
      const text = await response.text();
      let payload: unknown;

      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`${errorContext} a renvoyé une réponse invalide.`);
      }

      if (!response.ok) {
        const remoteMessage =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { message?: unknown }).message === "string"
            ? (payload as { message: string }).message
            : "";

        throw new Error(
          remoteMessage ||
            `${errorContext} a répondu avec le code ${response.status}.`,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `${errorContext} n’a pas répondu dans les ${Math.round(timeoutMs / 1000)} secondes prévues.`,
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          `${errorContext} est momentanément inaccessible depuis DroMap.`,
        );
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function importRemoteGeoJson(options: {
    datasetId: string;
    title: string;
    downloadUrl: string;
    sourceLabel: string;
    sourceUrl: string;
    sourceLicense: string;
    sourceAttribution: string;
    sourceVersion: string;
  }) {
    setStatus(`Téléchargement de « ${options.title} »...`);

    const downloadedText = await fetchTextWithTimeout(
      options.downloadUrl,
      180_000,
      "La source GeoJSON",
    );
    const filtered = filterGeoJsonTextToWorkspace(downloadedText, workspaceBounds);

    if (workspaceBounds && filtered.keptCount === 0) {
      throw new Error(
        "Aucune entité de ce jeu ne croise la zone de travail actuelle.",
      );
    }

    const importedLayer = parseGeoJsonTextToDromapGeoJsonLayer(filtered.text, {
      sourceName: options.title,
      layerName: options.title,
      existingLayerCount: geoJsonLayers.length,
      precisionMode,
      catalogDatasetId: options.datasetId,
      sourceLabel: options.sourceLabel,
      sourceUrl: options.sourceUrl,
      sourceLicense: options.sourceLicense,
      sourceAttribution: options.sourceAttribution,
      sourceVersion: options.sourceVersion,
    });

    clearSelectedFeatureId();
    addGeoJsonLayer(importedLayer);

    if (!workspaceBounds && importedLayer.bounds) {
      requestMapFitToBounds(importedLayer.bounds);
    }

    const zoneMessage = workspaceBounds
      ? ` Seules les ${importedLayer.featureCount.toLocaleString("fr-FR")} entités qui croisent la zone de travail ont été conservées dans DroMap${
          filtered.originalCount !== null
            ? ` sur ${filtered.originalCount.toLocaleString("fr-FR")} entités distantes`
            : ""
        }. La zone et la vue ont été conservées.`
      : " La vue a été recentrée sur les données.";

    setStatus(
      `« ${options.title} » ajouté comme calque GeoJSON léger : ${importedLayer.featureCount.toLocaleString("fr-FR")} entité${
        importedLayer.featureCount > 1 ? "s" : ""
      }, précision ${getPrecisionLabel(importedLayer.precisionMode)}. Le fichier a été récupéré uniquement après ton clic.${zoneMessage}`,
    );
  }

  async function handleAddCatalogDataset(entry: DromapGeoJsonCatalogEntry) {
    if (loadingDatasetId || appliedDatasetIds.has(entry.id)) {
      return;
    }

    if (entry.heavy && confirmedHeavyDatasetId !== entry.id) {
      setConfirmedHeavyDatasetId(entry.id);
      setStatus(
        `« ${entry.title} » est indiqué comme lourd. Aucun fichier n’a encore été téléchargé. Reclique sur Confirmer le téléchargement pour l’ajouter, de préférence avec la précision Légère.`,
      );
      return;
    }

    if (
      entry.heavy &&
      !workspaceBounds &&
      !allowedHeavyWithoutWorkspaceIdsRef.current.has(entry.id)
    ) {
      setHeavyWithoutWorkspacePrompt({
        datasetId: entry.id,
        kind: "catalog",
        title: entry.title,
      });
      setStatus(
        `« ${entry.title} » est lourd et aucune zone de travail n’est validée. Tu peux sélectionner une zone pour ne conserver que les entités utiles, ou télécharger quand même l’ensemble.`,
      );
      return;
    }

    try {
      setLoadingDatasetId(entry.id);
      setPendingGeoBoundariesDownload(null);
      await importRemoteGeoJson({
        datasetId: entry.id,
        title: entry.title,
        downloadUrl: entry.downloadUrl,
        sourceLabel: entry.sourceLabel,
        sourceUrl: entry.sourceUrl,
        sourceLicense: entry.sourceLicense,
        sourceAttribution: entry.sourceAttribution,
        sourceVersion: entry.versionLabel,
      });
      setConfirmedHeavyDatasetId(null);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Le jeu de données n’a pas pu être téléchargé.";
      setStatus(`Import impossible pour « ${entry.title} » : ${message}`);
    } finally {
      setLoadingDatasetId(null);
    }
  }

  async function downloadPreparedGeoBoundaries(
    pending: PendingGeoBoundariesDownload,
  ) {
    const modeLabel =
      pending.geometryMode === "simplified" ? "géométrie simplifiée" : "géométrie originale";
    const metadata = pending.metadata;
    const sourceDetails = [
      metadata.boundaryYearRepresented
        ? `année ${metadata.boundaryYearRepresented}`
        : "",
      metadata.buildDate ? `construction ${metadata.buildDate}` : "",
      formatGeoBoundariesUnitCount(metadata.admUnitCount),
      modeLabel,
    ]
      .filter(Boolean)
      .join(" · ");
    const title = `${pending.countryLabel} — ${metadata.boundaryType}`;

    await importRemoteGeoJson({
      datasetId: pending.datasetId,
      title,
      downloadUrl: pending.downloadUrl,
      sourceLabel: "geoBoundaries gbOpen",
      sourceUrl: pending.metadataUrl,
      sourceLicense: "CC BY 4.0 (geoBoundaries gbOpen)",
      sourceAttribution: "geoBoundaries",
      sourceVersion: sourceDetails,
    });
  }

  async function handleAddGeoBoundariesDataset() {
    if (
      loadingDatasetId ||
      !selectedGeoBoundariesCountry ||
      isGeoBoundariesAlreadyApplied
    ) {
      return;
    }

    if (
      pendingGeoBoundariesDownload?.datasetId === geoBoundariesDatasetId &&
      pendingGeoBoundariesDownload.geometryMode === geoBoundariesGeometryMode
    ) {
      if (
        !workspaceBounds &&
        !allowedHeavyWithoutWorkspaceIdsRef.current.has(geoBoundariesDatasetId)
      ) {
        setHeavyWithoutWorkspacePrompt({
          datasetId: geoBoundariesDatasetId,
          kind: "geoboundaries",
          title: `${selectedGeoBoundariesCountry.label} — ${geoBoundariesAdmLevel}`,
        });
        setStatus(
          `${selectedGeoBoundariesCountry.label} ${geoBoundariesAdmLevel} est lourd et aucune zone de travail n’est validée. Sélectionner une zone permet de ne conserver que les entités utiles.`,
        );
        return;
      }

      try {
        setLoadingDatasetId(geoBoundariesDatasetId);
        await downloadPreparedGeoBoundaries(pendingGeoBoundariesDownload);
        setPendingGeoBoundariesDownload(null);
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error
            ? error.message
            : "Le jeu geoBoundaries n’a pas pu être téléchargé.";
        setStatus(`Import geoBoundaries impossible : ${message}`);
      } finally {
        setLoadingDatasetId(null);
      }
      return;
    }

    const metadataUrl = `https://www.geoboundaries.org/api/current/gbOpen/${geoBoundariesCountryIso3}/${geoBoundariesAdmLevel}/`;
    const availabilityUrl =
      `/api/dromap/geojson-library/geoboundaries?` +
      new URLSearchParams({
        action: "metadata",
        iso: geoBoundariesCountryIso3,
        adm: geoBoundariesAdmLevel,
      }).toString();

    try {
      setLoadingDatasetId(geoBoundariesDatasetId);
      setPendingGeoBoundariesDownload(null);
      setStatus(
        `Vérification de la disponibilité de ${selectedGeoBoundariesCountry.label} ${geoBoundariesAdmLevel}. Aucun GeoJSON n’est encore téléchargé.`,
      );

      const availability =
        await fetchJsonWithTimeout<GeoBoundariesAvailabilityResponse>(
          availabilityUrl,
          35_000,
          "Le relais geoBoundaries de DroMap",
        );

      setVerifiedGeoBoundariesLevels(availability.availableLevels);

      if (!availability.ok) {
        setStatus(
          `${selectedGeoBoundariesCountry.label} ${geoBoundariesAdmLevel} indisponible. ${availability.message} Aucun GeoJSON n’a été téléchargé.`,
        );
        return;
      }

      const metadata = availability.metadata;
      const downloadParams = new URLSearchParams({
        action: "download",
        iso: geoBoundariesCountryIso3,
        adm: geoBoundariesAdmLevel,
        geometry: geoBoundariesGeometryMode,
      });
      const workspaceBbox = getWorkspaceBboxParameter(workspaceBounds);
      if (workspaceBbox) {
        downloadParams.set("bbox", workspaceBbox);
      }
      const downloadUrl =
        `/api/dromap/geojson-library/geoboundaries?${downloadParams.toString()}`;

      const pending: PendingGeoBoundariesDownload = {
        datasetId: geoBoundariesDatasetId,
        countryLabel: selectedGeoBoundariesCountry.label,
        geometryMode: geoBoundariesGeometryMode,
        metadataUrl: availability.sourceUrl || metadataUrl,
        downloadUrl,
        metadata,
      };

      if (isGeoBoundariesMetadataHeavy(metadata, geoBoundariesGeometryMode)) {
        setPendingGeoBoundariesDownload(pending);
        setStatus(
          `${selectedGeoBoundariesCountry.label} ${geoBoundariesAdmLevel} est disponible : ${formatGeoBoundariesUnitCount(metadata.admUnitCount)}. Le GeoJSON n’a pas été téléchargé. Confirme le chargement pour continuer.`,
        );
      } else {
        await downloadPreparedGeoBoundaries(pending);
      }
    } catch (error) {
      console.error(error);
      const message =
        error instanceof SyntaxError
          ? "L’API geoBoundaries a renvoyé une réponse invalide."
          : error instanceof Error
            ? error.message
            : "Le niveau demandé n’a pas pu être vérifié.";
      setStatus(`Import geoBoundaries impossible : ${message}`);
    } finally {
      setLoadingDatasetId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950">
              Bibliothèque de données GeoJSON
            </h3>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
              Version étendue
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Recherche un jeu prêt à l’emploi ou choisis les limites administratives
            d’un pays. Les fichiers restent chez leurs fournisseurs jusqu’à ce que
            tu demandes explicitement leur ajout.
          </p>
        </div>

        <label className="shrink-0 text-xs font-semibold text-violet-900">
          Précision d’import
          <select
            value={precisionMode}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              onPrecisionModeChange(
                event.target.value as DromapGeoJsonPrecisionMode,
              )
            }
            className="mt-1 block w-full min-w-36 rounded-lg border border-violet-200 bg-white px-2 py-2 text-xs font-medium text-slate-900"
          >
            {PRECISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-950">
        <strong>Aucun téléchargement automatique.</strong> DroMap embarque seulement
        le petit catalogue de noms, descriptions et liens. Un fichier GeoJSON est
        récupéré depuis sa source uniquement après un clic sur Ajouter à la carte.
      </div>

      <section className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">
              Limites administratives par pays
            </h4>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
              Accès à la collection ouverte geoBoundaries. Choisis un pays ou
              territoire et un niveau ADM. DroMap vérifie d’abord les métadonnées,
              puis télécharge la géométrie seulement après ton action.
            </p>
          </div>
          <a
            href={GEOBOUNDARIES_SOURCE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
          >
            Source geoBoundaries
          </a>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
          <label className="text-xs font-semibold text-slate-700">
            Pays ou territoire
            <select
              value={geoBoundariesCountryIso3}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setGeoBoundariesCountryIso3(event.target.value);
                setVerifiedGeoBoundariesLevels(null);
                setPendingGeoBoundariesDownload(null);
              }}
              className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {GEOBOUNDARIES_COUNTRIES.map((country) => (
                <option key={country.alpha3} value={country.alpha3}>
                  {country.label} — {country.alpha3}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Niveau administratif
            <select
              value={geoBoundariesAdmLevel}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setGeoBoundariesAdmLevel(
                  event.target.value as GeoBoundariesAdmLevel,
                );
                setPendingGeoBoundariesDownload(null);
              }}
              className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {ADM_LEVEL_OPTIONS.map((option) => {
                const isVerifiedUnavailable =
                  verifiedGeoBoundariesLevels !== null &&
                  !verifiedGeoBoundariesLevels.includes(option.value);

                return (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={isVerifiedUnavailable}
                  >
                    {option.label}
                    {isVerifiedUnavailable ? " — indisponible" : ""}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Géométrie distante
            <select
              value={geoBoundariesGeometryMode}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setGeoBoundariesGeometryMode(
                  event.target.value as GeoBoundariesGeometryMode,
                );
                setPendingGeoBoundariesDownload(null);
              }}
              className="mt-1 block w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              <option value="simplified">Simplifiée — conseillée</option>
              <option value="original">Originale — potentiellement très lourde</option>
            </select>
          </label>
        </div>

        {verifiedGeoBoundariesLevels !== null ? (
          <p className="mt-2 text-[11px] font-medium text-sky-800">
            Niveaux confirmés pour {selectedGeoBoundariesCountry.label} :{" "}
            {verifiedGeoBoundariesLevels.length > 0
              ? verifiedGeoBoundariesLevels.join(", ")
              : "aucun niveau gbOpen disponible"}
          </p>
        ) : null}

        {pendingGeoBoundariesDownload ? (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
            <strong>Confirmation nécessaire :</strong>{" "}
            {pendingGeoBoundariesDownload.countryLabel}{" "}
            {pendingGeoBoundariesDownload.metadata.boundaryType} contient {" "}
            {formatGeoBoundariesUnitCount(
              pendingGeoBoundariesDownload.metadata.admUnitCount,
            )}. Le fichier GeoJSON n’a pas encore été téléchargé.
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleAddGeoBoundariesDataset()}
          disabled={
            loadingDatasetId !== null || isGeoBoundariesAlreadyApplied
          }
          className="mt-3 w-full rounded-xl bg-sky-700 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isGeoBoundariesAlreadyApplied
            ? "Ce niveau est déjà présent sur la carte"
            : loadingDatasetId === geoBoundariesDatasetId
              ? "Traitement en cours..."
              : pendingGeoBoundariesDownload?.datasetId ===
                    geoBoundariesDatasetId &&
                  pendingGeoBoundariesDownload.geometryMode ===
                    geoBoundariesGeometryMode
                ? "Confirmer le téléchargement et ajouter"
                : "Vérifier la disponibilité puis ajouter"}
        </button>
      </section>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">
              Catalogue thématique prêt à l’emploi
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              {DROMAP_GEOJSON_CATALOG.length} références distantes Natural Earth et France.
            </p>
          </div>
          <span className="text-[11px] text-slate-500">
            Les sources et licences sont conservées dans chaque calque.
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="relative block">
            <span className="sr-only">Rechercher dans la bibliothèque</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setSearchQuery(event.target.value);
                setVisibleCatalogCount(CATALOG_PAGE_SIZE);
              }}
              placeholder="Rechercher : pays, provinces, glaciers, bathymétrie..."
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <label>
            <span className="sr-only">Filtrer par catégorie</span>
            <select
              value={categoryFilter}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                setCategoryFilter(event.target.value as CatalogCategoryFilter);
                setVisibleCatalogCount(CATALOG_PAGE_SIZE);
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            >
              {DROMAP_GEOJSON_CATALOG_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-500">
          <span>
            {filteredEntries.length} jeu{filteredEntries.length > 1 ? "x" : ""} de données correspondant
          </span>
          <span>
            {Math.min(visibleEntries.length, filteredEntries.length)} affiché{visibleEntries.length > 1 ? "s" : ""}
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Aucun jeu ne correspond à cette recherche.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {visibleEntries.map((entry) => {
              const isApplied = appliedDatasetIds.has(entry.id);
              const isLoading = loadingDatasetId === entry.id;
              const isAnotherLoading =
                loadingDatasetId !== null && loadingDatasetId !== entry.id;
              const needsHeavyConfirmation =
                Boolean(entry.heavy) && confirmedHeavyDatasetId !== entry.id;

              return (
                <article
                  key={entry.id}
                  className="flex min-h-52 flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h5 className="font-semibold leading-snug text-slate-950">
                        {entry.title}
                      </h5>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                        <span className="rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
                          {entry.geography}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 ring-1 ${
                            entry.heavy
                              ? "bg-amber-50 text-amber-800 ring-amber-200"
                              : "bg-white text-slate-600 ring-slate-200"
                          }`}
                        >
                          {entry.sizeLabel}
                        </span>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-100">
                          conseillé : {getPrecisionLabel(entry.recommendedPrecision)}
                        </span>
                      </div>
                    </div>

                    {isApplied ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        Déjà ajouté
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-xs leading-relaxed text-slate-600">
                    {entry.description}
                  </p>

                  <div className="mt-3 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-800">Source :</span>{" "}
                      <a
                        href={entry.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                      >
                        {entry.sourceLabel}
                      </a>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Licence :</span>{" "}
                      {entry.sourceLicense}
                    </div>
                    <div>{entry.versionLabel}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleAddCatalogDataset(entry)}
                    disabled={isApplied || isLoading || isAnotherLoading}
                    className={`mt-auto w-full rounded-lg px-3 py-2 text-xs font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 ${
                      entry.heavy && confirmedHeavyDatasetId === entry.id
                        ? "bg-amber-600 hover:bg-amber-500"
                        : "bg-violet-600 hover:bg-violet-500"
                    }`}
                  >
                    {isApplied
                      ? "Présent sur la carte"
                      : isLoading
                        ? "Téléchargement..."
                        : entry.heavy && confirmedHeavyDatasetId === entry.id
                          ? "Confirmer le téléchargement"
                          : needsHeavyConfirmation
                            ? "Ajouter à la carte"
                            : "Ajouter à la carte"}
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {visibleEntries.length < filteredEntries.length ? (
          <button
            type="button"
            onClick={() =>
              setVisibleCatalogCount((count) => count + CATALOG_PAGE_SIZE)
            }
            className="mt-3 w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-800 transition hover:bg-violet-100"
          >
            Afficher {Math.min(CATALOG_PAGE_SIZE, filteredEntries.length - visibleEntries.length)} jeu{filteredEntries.length - visibleEntries.length > 1 ? "x" : ""} supplémentaire{filteredEntries.length - visibleEntries.length > 1 ? "s" : ""}
          </button>
        ) : null}
      </div>

      {heavyWithoutWorkspacePrompt && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[1px]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dromap-heavy-geojson-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <section
                className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <header className="border-b border-amber-200 bg-amber-50 px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                        Import GeoJSON lourd
                      </p>
                      <h3
                        id="dromap-heavy-geojson-title"
                        className="mt-1 text-lg font-semibold text-slate-950"
                      >
                        Sélectionner une zone de travail ?
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHeavyWithoutWorkspacePrompt(null);
                        setStatus(
                          "Téléchargement annulé. Aucun GeoJSON n’a été téléchargé.",
                        );
                      }}
                      className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 hover:bg-amber-100"
                      aria-label="Fermer"
                    >
                      ×
                    </button>
                  </div>
                </header>

                <div className="px-5 py-4 text-sm leading-relaxed text-slate-700">
                  <p>
                    <strong className="text-slate-950">
                      {heavyWithoutWorkspacePrompt.title}
                    </strong>{" "}
                    est un jeu volumineux. Aucune zone de travail n’est actuellement
                    validée.
                  </p>
                  <p className="mt-3">
                    En sélectionnant d’abord une zone, DroMap ne conservera que les
                    entités qui la croisent. Cela réduit fortement la mémoire utilisée
                    et améliore la fluidité.
                  </p>
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Aucun GeoJSON lourd n’a encore été téléchargé.
                  </p>
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setHeavyWithoutWorkspacePrompt(null);
                      setStatus(
                        "Téléchargement annulé. Aucun GeoJSON n’a été téléchargé.",
                      );
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const prompt = heavyWithoutWorkspacePrompt;
                      allowedHeavyWithoutWorkspaceIdsRef.current.add(
                        prompt.datasetId,
                      );
                      setHeavyWithoutWorkspacePrompt(null);
                      window.setTimeout(() => {
                        if (prompt.kind === "geoboundaries") {
                          void handleAddGeoBoundariesDataset();
                        } else {
                          const entry = DROMAP_GEOJSON_CATALOG.find(
                            (candidate) => candidate.id === prompt.datasetId,
                          );
                          if (entry) {
                            void handleAddCatalogDataset(entry);
                          }
                        }
                      }, 0);
                    }}
                    className="rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-sm font-bold text-amber-900 hover:bg-amber-100"
                  >
                    Télécharger quand même
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      setHeavyWithoutWorkspacePrompt(null);
                      modifyWorkspaceZone();
                      closeImportPanel();
                    }}
                    className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-600"
                  >
                    Sélectionner une zone
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}

      {status ? (
        <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-xs leading-relaxed text-violet-950">
          {status}
        </div>
      ) : null}
    </section>
  );
}
