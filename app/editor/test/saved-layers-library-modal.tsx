"use client";

import { useEffect, useMemo, useState } from "react";

import type { DroMapFeature } from "@/lib/dromap/feature";
import type { DroMapSavedLayer } from "@/stores/editor-test-layers";
import type {
  DromapGeoJsonFeature,
  DromapGeoJsonLayerStyle,
  DromapSavedGeoJsonLayer,
} from "@/stores/editor-test-geojson-layers";

type SavedLayerEntry =
  | {
      key: string;
      kind: "dromap";
      layer: DroMapSavedLayer;
    }
  | {
      key: string;
      kind: "geojson";
      layer: DromapSavedGeoJsonLayer;
    };

type SavedLayersLibraryModalProps = {
  isOpen: boolean;
  zIndex: number;
  savedLayers: DroMapSavedLayer[];
  savedGeoJsonLayers: DromapSavedGeoJsonLayer[];
  appliedSavedLayerIds: Set<string>;
  appliedSavedGeoJsonLayerIds: Set<string>;
  onClose: () => void;
  onApplySavedLayer: (layer: DroMapSavedLayer) => void;
  onRenameSavedLayer: (layer: DroMapSavedLayer) => void;
  onDeleteSavedLayer: (layer: DroMapSavedLayer) => void;
  onApplySavedGeoJsonLayer: (layer: DromapSavedGeoJsonLayer) => void;
  onRenameSavedGeoJsonLayer: (layer: DromapSavedGeoJsonLayer) => void;
  onDeleteSavedGeoJsonLayer: (layer: DromapSavedGeoJsonLayer) => void;
};

type Coordinate = [number, number];

type PreviewStyle = {
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  fillColor: string;
  fillOpacity: number;
  markerSize: number;
  dashStyle: "solid" | "dashed" | "dotted";
};

const PREVIEW_WIDTH = 620;
const PREVIEW_HEIGHT = 390;
const PREVIEW_PADDING = 28;
const MAX_COORDINATES_FOR_BOUNDS = 20_000;
const MAX_FEATURES_TO_RENDER = 320;

function LayersLibraryIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
      <path d="m4 12 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </svg>
  );
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function collectCoordinates(
  value: unknown,
  target: Coordinate[],
  limit = MAX_COORDINATES_FOR_BOUNDS,
) {
  if (target.length >= limit || !Array.isArray(value)) {
    return;
  }

  if (value.length >= 2) {
    const longitude = normalizeNumber(value[0]);
    const latitude = normalizeNumber(value[1]);

    if (longitude !== null && latitude !== null) {
      target.push([longitude, latitude]);
      return;
    }
  }

  for (const child of value) {
    collectCoordinates(child, target, limit);
    if (target.length >= limit) {
      break;
    }
  }
}

function getEntryFeatures(entry: SavedLayerEntry) {
  if (entry.kind === "dromap") {
    return entry.layer.features;
  }

  return entry.layer.layer.data.features;
}

function getPreviewBounds(entry: SavedLayerEntry) {
  if (entry.kind === "geojson" && entry.layer.layer.bounds) {
    const bounds = entry.layer.layer.bounds;
    const southWest = bounds.southWest ?? bounds.sw ?? bounds._southWest;
    const northEast = bounds.northEast ?? bounds.ne ?? bounds._northEast;

    if (
      southWest &&
      northEast &&
      [southWest.lng, southWest.lat, northEast.lng, northEast.lat].every(Number.isFinite)
    ) {
      return {
        west: southWest.lng,
        south: southWest.lat,
        east: northEast.lng,
        north: northEast.lat,
      };
    }
  }

  const coordinates: Coordinate[] = [];
  for (const feature of getEntryFeatures(entry)) {
    collectCoordinates(feature.geometry.coordinates, coordinates);
    if (coordinates.length >= MAX_COORDINATES_FOR_BOUNDS) {
      break;
    }
  }

  if (coordinates.length === 0) {
    return null;
  }

  let west = coordinates[0][0];
  let east = coordinates[0][0];
  let south = coordinates[0][1];
  let north = coordinates[0][1];

  for (const [longitude, latitude] of coordinates) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  return { west, south, east, north };
}

function createProjector(entry: SavedLayerEntry) {
  const bounds = getPreviewBounds(entry);

  if (!bounds) {
    return null;
  }

  const longitudeSpan = Math.max(0.000001, bounds.east - bounds.west);
  const latitudeSpan = Math.max(0.000001, bounds.north - bounds.south);
  const availableWidth = PREVIEW_WIDTH - PREVIEW_PADDING * 2;
  const availableHeight = PREVIEW_HEIGHT - PREVIEW_PADDING * 2;
  const scale = Math.min(
    availableWidth / longitudeSpan,
    availableHeight / latitudeSpan,
  );
  const renderedWidth = longitudeSpan * scale;
  const renderedHeight = latitudeSpan * scale;
  const offsetX = (PREVIEW_WIDTH - renderedWidth) / 2;
  const offsetY = (PREVIEW_HEIGHT - renderedHeight) / 2;

  return ([longitude, latitude]: Coordinate): Coordinate => [
    offsetX + (longitude - bounds.west) * scale,
    PREVIEW_HEIGHT - (offsetY + (latitude - bounds.south) * scale),
  ];
}

function getDroMapFeatureStyle(feature: DroMapFeature): PreviewStyle {
  const style = feature.properties.style ?? {};

  return {
    strokeColor: style.color ?? "#334155",
    strokeOpacity: style.opacity ?? 1,
    strokeWeight: Math.max(1, Math.min(6, style.weight ?? 2)),
    fillColor: style.fillColor ?? style.color ?? "#64748b",
    fillOpacity:
      feature.properties.type === "zone" ? (style.fillOpacity ?? 0.22) : 0,
    markerSize: Math.max(4, Math.min(12, (style.markerSize ?? 22) / 3.5)),
    dashStyle: style.dashStyle ?? "solid",
  };
}

function getGeoJsonStyle(style: DromapGeoJsonLayerStyle): PreviewStyle {
  return {
    strokeColor: style.strokeColor,
    strokeOpacity: style.strokeOpacity,
    strokeWeight: Math.max(1, Math.min(6, style.strokeWeight)),
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
    markerSize: Math.max(4, Math.min(12, style.markerSize / 3.5)),
    dashStyle: style.dashStyle,
  };
}

function getDashArray(style: PreviewStyle) {
  if (style.dashStyle === "dashed") {
    return "9 6";
  }

  if (style.dashStyle === "dotted") {
    return "2 5";
  }

  return undefined;
}

function lineToPath(
  coordinates: unknown,
  project: (coordinate: Coordinate) => Coordinate,
  close = false,
) {
  if (!Array.isArray(coordinates)) {
    return "";
  }

  const points = coordinates
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return null;
      }

      const longitude = normalizeNumber(coordinate[0]);
      const latitude = normalizeNumber(coordinate[1]);
      if (longitude === null || latitude === null) {
        return null;
      }

      return project([longitude, latitude]);
    })
    .filter((point): point is Coordinate => point !== null);

  if (points.length === 0) {
    return "";
  }

  const path = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  return close ? `${path} Z` : path;
}

function getGeometryPaths(
  feature: DroMapFeature | DromapGeoJsonFeature,
  project: (coordinate: Coordinate) => Coordinate,
) {
  const { geometry } = feature;

  switch (geometry.type) {
    case "LineString":
      return [lineToPath(geometry.coordinates, project)];
    case "MultiLineString":
      return geometry.coordinates.map((line) => lineToPath(line, project));
    case "Polygon":
      return geometry.coordinates.map((ring) => lineToPath(ring, project, true));
    case "MultiPolygon":
      return geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) => lineToPath(ring, project, true)),
      );
    default:
      return [];
  }
}

function getPointCoordinates(feature: DroMapFeature | DromapGeoJsonFeature) {
  if (feature.geometry.type === "Point") {
    const [longitude, latitude] = feature.geometry.coordinates;
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      return [[longitude, latitude] as Coordinate];
    }
  }

  if (feature.geometry.type === "MultiPoint") {
    return feature.geometry.coordinates.filter(
      (coordinate): coordinate is Coordinate =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    );
  }

  return [];
}

function getGeometryRank(feature: DroMapFeature | DromapGeoJsonFeature) {
  if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
    return 0;
  }

  if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
    return 1;
  }

  return 2;
}

function LayerPreview({ entry }: { entry: SavedLayerEntry }) {
  const projector = useMemo(() => createProjector(entry), [entry]);
  const renderFeatures = useMemo(
    () =>
      [...getEntryFeatures(entry)]
        .sort((left, right) => getGeometryRank(left) - getGeometryRank(right))
        .slice(0, MAX_FEATURES_TO_RENDER),
    [entry],
  );

  if (!projector) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500">
        Ce calque ne contient aucune géométrie prévisualisable.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
      <svg
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        className="block h-auto min-h-72 w-full"
        role="img"
        aria-label={`Prévisualisation du calque ${entry.layer.name}`}
      >
        <defs>
          <pattern id="dromap-layer-preview-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} fill="#f8fafc" />
        <rect width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} fill="url(#dromap-layer-preview-grid)" />

        {renderFeatures.map((feature, featureIndex) => {
          const style =
            entry.kind === "dromap"
              ? getDroMapFeatureStyle(feature as DroMapFeature)
              : getGeoJsonStyle(entry.layer.layer.style);
          const geometryPaths = getGeometryPaths(feature, projector);
          const points = getPointCoordinates(feature);
          const isPolygon =
            feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon";

          return (
            <g key={`${feature.id ?? featureIndex}-${featureIndex}`}>
              {geometryPaths.map((path, pathIndex) =>
                path ? (
                  <path
                    key={pathIndex}
                    d={path}
                    fill={isPolygon ? style.fillColor : "none"}
                    fillOpacity={isPolygon ? style.fillOpacity : 0}
                    stroke={style.strokeColor}
                    strokeOpacity={style.strokeOpacity}
                    strokeWidth={style.strokeWeight}
                    strokeDasharray={getDashArray(style)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null,
              )}

              {points.map((coordinate, pointIndex) => {
                const [x, y] = projector(coordinate);
                return (
                  <circle
                    key={pointIndex}
                    cx={x}
                    cy={y}
                    r={style.markerSize}
                    fill={style.fillColor}
                    fillOpacity={Math.max(0.35, style.fillOpacity || 0.8)}
                    stroke={style.strokeColor}
                    strokeOpacity={style.strokeOpacity}
                    strokeWidth={Math.max(1, style.strokeWeight / 1.5)}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {getEntryFeatures(entry).length > MAX_FEATURES_TO_RENDER ? (
        <div className="absolute bottom-3 right-3 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm backdrop-blur">
          Aperçu allégé pour rester fluide
        </div>
      ) : null}
    </div>
  );
}

function getEntrySubtitle(entry: SavedLayerEntry) {
  if (entry.kind === "dromap") {
    const count = entry.layer.features.length;
    return `${count.toLocaleString("fr-FR")} objet${count > 1 ? "s" : ""} DroMap`;
  }

  const count = entry.layer.layer.featureCount;
  return `${count.toLocaleString("fr-FR")} entité${count > 1 ? "s" : ""} GeoJSON`;
}

export function SavedLayersLibraryModal({
  isOpen,
  zIndex,
  savedLayers,
  savedGeoJsonLayers,
  appliedSavedLayerIds,
  appliedSavedGeoJsonLayerIds,
  onClose,
  onApplySavedLayer,
  onRenameSavedLayer,
  onDeleteSavedLayer,
  onApplySavedGeoJsonLayer,
  onRenameSavedGeoJsonLayer,
  onDeleteSavedGeoJsonLayer,
}: SavedLayersLibraryModalProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "dromap" | "geojson">("all");

  const entries = useMemo<SavedLayerEntry[]>(
    () => [
      ...savedLayers.map((layer) => ({
        key: `dromap:${layer.id}`,
        kind: "dromap" as const,
        layer,
      })),
      ...savedGeoJsonLayers.map((layer) => ({
        key: `geojson:${layer.id}`,
        kind: "geojson" as const,
        layer,
      })),
    ],
    [savedGeoJsonLayers, savedLayers],
  );

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("fr");

    return entries.filter((entry) => {
      if (filter !== "all" && entry.kind !== filter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return entry.layer.name.toLocaleLowerCase("fr").includes(normalizedSearch);
    });
  }, [entries, filter, search]);

  const selectedEntry =
    filteredEntries.find((entry) => entry.key === selectedKey) ??
    filteredEntries[0] ??
    null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedKey((current) => {
      if (current && entries.some((entry) => entry.key === current)) {
        return current;
      }
      return entries[0]?.key ?? null;
    });
  }, [entries, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const isSelectedEntryApplied = selectedEntry
    ? selectedEntry.kind === "dromap"
      ? appliedSavedLayerIds.has(selectedEntry.layer.id)
      : appliedSavedGeoJsonLayerIds.has(selectedEntry.layer.id)
    : false;

  const handleApplySelected = () => {
    if (!selectedEntry || isSelectedEntryApplied) {
      return;
    }

    if (selectedEntry.kind === "dromap") {
      onApplySavedLayer(selectedEntry.layer);
    } else {
      onApplySavedGeoJsonLayer(selectedEntry.layer);
    }
  };

  const handleRenameSelected = () => {
    if (!selectedEntry) {
      return;
    }

    if (selectedEntry.kind === "dromap") {
      onRenameSavedLayer(selectedEntry.layer);
    } else {
      onRenameSavedGeoJsonLayer(selectedEntry.layer);
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedEntry) {
      return;
    }

    if (selectedEntry.kind === "dromap") {
      onDeleteSavedLayer(selectedEntry.layer);
    } else {
      onDeleteSavedGeoJsonLayer(selectedEntry.layer);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      style={{ zIndex }}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dromap-saved-layers-title"
        data-dromap-ignore-shortcuts="true"
        data-dromap-ignore-map-wheel="true"
        className="flex h-[min(780px,calc(100vh-2rem))] w-[min(1180px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/90 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
              <LayersLibraryIcon size={23} />
            </div>
            <div className="min-w-0">
              <h2 id="dromap-saved-layers-title" className="text-lg font-black text-slate-950">
                Mes calques enregistrés
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Sélectionne un calque pour voir son contenu avant de l’ajouter à la carte.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100"
          >
            Fermer
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,0.38fr)_minmax(0,0.62fr)]">
          <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/70 p-4">
            <label className="block">
              <span className="sr-only">Rechercher un calque enregistré</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un calque…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 text-[11px] font-bold">
              {([
                ["all", "Tous"],
                ["dromap", "DroMap"],
                ["geojson", "GeoJSON"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={[
                    "rounded-lg px-2 py-2 transition",
                    filter === value
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-950",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  {entries.length === 0
                    ? "Aucun calque n’est encore enregistré."
                    : "Aucun calque ne correspond à cette recherche."}
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const isSelected = entry.key === selectedEntry?.key;
                  const isApplied =
                    entry.kind === "dromap"
                      ? appliedSavedLayerIds.has(entry.layer.id)
                      : appliedSavedGeoJsonLayerIds.has(entry.layer.id);

                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setSelectedKey(entry.key)}
                      className={[
                        "w-full rounded-2xl border p-3 text-left transition",
                        isSelected
                          ? "border-indigo-400 bg-indigo-50 shadow-sm ring-2 ring-indigo-100"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-bold text-slate-950">{entry.layer.name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{getEntrySubtitle(entry)}</div>
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide",
                            entry.kind === "dromap"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-sky-100 text-sky-700",
                          ].join(" ")}
                        >
                          {entry.kind === "dromap" ? "DroMap" : "GeoJSON"}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                        <span>{new Date(entry.layer.savedAt).toLocaleDateString("fr-FR")}</span>
                        {isApplied ? (
                          <span className="font-bold text-emerald-700">Déjà sur la carte</span>
                        ) : (
                          <span>Cliquer pour prévisualiser</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-5">
            {selectedEntry ? (
              <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-xl font-black text-slate-950">
                        {selectedEntry.layer.name}
                      </h3>
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
                          selectedEntry.kind === "dromap"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-sky-100 text-sky-700",
                        ].join(" ")}
                      >
                        {selectedEntry.kind === "dromap" ? "Objets DroMap" : "Calque GeoJSON"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {getEntrySubtitle(selectedEntry)} · enregistré le {new Date(selectedEntry.layer.savedAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>

                <LayerPreview entry={selectedEntry} />

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs leading-relaxed text-slate-500">
                    {isSelectedEntryApplied
                      ? "Ce calque est déjà présent dans la carte actuelle."
                      : "L’ajout crée une copie indépendante : modifier la copie ne change pas le calque enregistré."}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRenameSelected}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteSelected}
                      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition hover:bg-red-50"
                    >
                      Supprimer
                    </button>
                    <button
                      type="button"
                      onClick={handleApplySelected}
                      disabled={isSelectedEntryApplied}
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isSelectedEntryApplied ? "Déjà ajouté" : "Ajouter à la carte"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-full items-center justify-center">
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
                    <LayersLibraryIcon size={30} />
                  </div>
                  <h3 className="mt-4 text-lg font-black text-slate-900">Aucun calque à afficher</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    Enregistre d’abord un calque depuis la carte actuelle. Il apparaîtra ici avec sa prévisualisation.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
