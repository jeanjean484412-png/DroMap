"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L, { type GeoJSON as LeafletGeoJsonLayer, type Path } from "leaflet";
import { MapContainer, Rectangle, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  getDromapRoadImportCategoryLabel,
  type DromapRoadImportCategory,
} from "@/lib/dromap/road-import";

export type RouteSelectionFeature = GeoJSON.Feature<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  GeoJSON.GeoJsonProperties
>;

export type RouteSelectionBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type RouteSelectionModalProps = {
  features: RouteSelectionFeature[];
  bounds: RouteSelectionBounds;
  initialSelectedIds?: string[];
  allowEmptyConfirm?: boolean;
  onCancel: () => void;
  onConfirm: (features: RouteSelectionFeature[]) => void;
};

type FeaturePath = Path & { feature?: RouteSelectionFeature };

export function getRouteSelectionFeatureId(
  feature: RouteSelectionFeature,
  fallbackIndex: number,
) {
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }

  const properties = feature.properties;
  if (properties && typeof properties === "object") {
    for (const key of [
      "__dromapRoadSelectionId",
      "osm_id",
      "id",
      "ref",
      "name",
      "label",
    ]) {
      const candidate = properties[key];
      if (typeof candidate === "string" || typeof candidate === "number") {
        return String(candidate);
      }
    }
  }

  return `route-${fallbackIndex + 1}`;
}

function getRouteCategory(feature: RouteSelectionFeature) {
  const value = feature.properties?.__dromapRoadCategory;
  return value === "motorways" ||
    value === "main" ||
    value === "secondary" ||
    value === "local"
    ? value
    : null;
}


function isConnectorFeature(feature: RouteSelectionFeature) {
  return feature.properties?.__dromapRoadIsConnector === true;
}

function getRoadGroupKey(feature: RouteSelectionFeature) {
  const value = feature.properties?.__dromapRoadGroupKey;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getConnectorGroups(feature: RouteSelectionFeature) {
  const value = feature.properties?.__dromapRoadConnectorGroups;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
function getRouteLabel(feature: RouteSelectionFeature) {
  const properties = feature.properties ?? {};
  for (const key of ["label", "ref", "name"]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "Route sans nom";
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SelectionLayer({
  features,
  selectedIds,
  onToggle,
}: {
  features: RouteSelectionFeature[];
  selectedIds: Set<string>;
  onToggle: (featureId: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<LeafletGeoJsonLayer | null>(null);
  const selectedIdsRef = useRef(selectedIds);
  const onToggleRef = useRef(onToggle);
  const idByFeatureRef = useRef(new WeakMap<object, string>());

  selectedIdsRef.current = selectedIds;
  onToggleRef.current = onToggle;

  useEffect(() => {
    const paneName = "dromap-route-selection-pane";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "650";

    const canvasRenderer = L.canvas({ pane: paneName, padding: 0.5 });
    const idByFeature = new WeakMap<object, string>();
    idByFeatureRef.current = idByFeature;
    features.forEach((feature, index) => {
      idByFeature.set(feature, getRouteSelectionFeatureId(feature, index));
    });

    const collection: GeoJSON.FeatureCollection<
      GeoJSON.LineString | GeoJSON.MultiLineString,
      GeoJSON.GeoJsonProperties
    > = { type: "FeatureCollection", features };

    const geoJsonLayer = L.geoJSON(collection, {
      pane: paneName,
      style: (feature) => {
        const typedFeature = feature as RouteSelectionFeature | undefined;
        const featureId = typedFeature ? idByFeature.get(typedFeature) : null;
        const isSelected = featureId ? selectedIdsRef.current.has(featureId) : false;
        return {
          renderer: canvasRenderer,
          pane: paneName,
          color: isSelected ? "#b45309" : "#334155",
          weight: isSelected ? 5 : 3,
          opacity: isSelected ? 1 : 0.78,
          lineCap: "round",
          lineJoin: "round",
        };
      },
      onEachFeature: (feature, leafletLayer) => {
        const typedFeature = feature as RouteSelectionFeature;
        const featureId = idByFeature.get(typedFeature);
        if (!featureId) return;

        const category = getRouteCategory(typedFeature);
        const connector = isConnectorFeature(typedFeature);
        leafletLayer.bindTooltip(
          `${getRouteLabel(typedFeature)}${connector ? " · liaison automatique" : category ? ` · ${getDromapRoadImportCategoryLabel(category)}` : ""}`,
          {
            sticky: true,
            direction: "top",
            opacity: 0.96,
            className: "dromap-route-selection-tooltip",
          },
        );
        leafletLayer.on("click", (event) => {
          L.DomEvent.stop(event.originalEvent);
          if (!connector) onToggleRef.current(featureId);
        });
      },
    }).addTo(map);

    layerRef.current = geoJsonLayer;
    return () => {
      layerRef.current = null;
      geoJsonLayer.removeFrom(map);
      canvasRenderer.removeFrom(map);
    };
  }, [features, map]);

  useEffect(() => {
    layerRef.current?.eachLayer((leafletLayer) => {
      const path = leafletLayer as FeaturePath;
      if (!path.setStyle || !path.feature) return;
      const featureId = idByFeatureRef.current.get(path.feature);
      const isSelected = featureId ? selectedIds.has(featureId) : false;
      path.setStyle({
        color: isSelected ? "#b45309" : "#334155",
        weight: isSelected ? 5 : 3,
        opacity: isSelected ? 1 : 0.78,
      });
    });
  }, [selectedIds]);

  return null;
}

function MapBoundsController({ bounds }: { bounds: RouteSelectionBounds }) {
  const map = useMap();

  useEffect(() => {
    const leafletBounds = L.latLngBounds(
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    );
    map.fitBounds(leafletBounds, { padding: [36, 36], animate: false });
    map.setMaxBounds(leafletBounds.pad(0.35));
    map.invalidateSize();
  }, [bounds, map]);

  return null;
}

export function RouteSelectionModal({
  features,
  bounds,
  initialSelectedIds = [],
  allowEmptyConfirm = false,
  onCancel,
  onConfirm,
}: RouteSelectionModalProps) {
  const [portalReady, setPortalReady] = useState(false);
  const initialSelectedIdsKey = initialSelectedIds.join("|");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );

  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    setSelectedIds(new Set(initialSelectedIds));
  }, [features, initialSelectedIdsKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isEditorShortcut =
        event.key === "Delete" ||
        ((event.ctrlKey || event.metaKey) &&
          (key === "d" || key === "z" || key === "y"));

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      } else if (isEditorShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  const indexedFeatures = useMemo(
    () =>
      features.map((feature, index) => ({
        feature,
        id: getRouteSelectionFeatureId(feature, index),
      })),
    [features],
  );
  const selectableEntries = useMemo(
    () => indexedFeatures.filter((entry) => !isConnectorFeature(entry.feature)),
    [indexedFeatures],
  );
  const effectiveSelectedIds = useMemo(() => {
    const effective = new Set(selectedIds);
    const selectedGroups = new Set<string>();
    for (const entry of selectableEntries) {
      if (!selectedIds.has(entry.id)) continue;
      const groupKey = getRoadGroupKey(entry.feature);
      if (groupKey) selectedGroups.add(groupKey);
    }
    for (const entry of indexedFeatures) {
      if (!isConnectorFeature(entry.feature)) continue;
      const groups = getConnectorGroups(entry.feature);
      if (groups.length >= 2 && groups.every((group) => selectedGroups.has(group))) {
        effective.add(entry.id);
      }
    }
    return effective;
  }, [indexedFeatures, selectableEntries, selectedIds]);
  const selectedFeatures = indexedFeatures
    .filter((entry) => effectiveSelectedIds.has(entry.id))
    .map((entry) => entry.feature);
  const selectedRoadCount = selectableEntries.filter((entry) => selectedIds.has(entry.id)).length;
  const canConfirm = selectedFeatures.length > 0 || allowEmptyConfirm;

  const toggleFeature = (featureId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  };



  if (!portalReady) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[120000] flex flex-col bg-slate-100"
      data-dromap-route-selection-modal="true"
    >

      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950">
            Sélectionner les routes à importer
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Clique sur une route pour la sélectionner. Les routes orange seront regroupées dans un seul calque GeoJSON.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          title="Fermer sans importer"
          aria-label="Fermer sans importer"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <MapContainer
          preferCanvas
          zoomControl={false}
          attributionControl={false}
          minZoom={1}
          maxZoom={22}
          center={[(bounds.south + bounds.north) / 2, (bounds.west + bounds.east) / 2]}
          zoom={10}
          className="dromap-route-selection-map h-full w-full"
          style={{
            backgroundColor: "#f8fafc",
            backgroundImage:
              "linear-gradient(rgba(148,163,184,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.16) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        >
          <TileLayer
            url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
            maxNativeZoom={19}
            maxZoom={22}
            crossOrigin="anonymous"
          />
          <MapBoundsController bounds={bounds} />
          <Rectangle
            bounds={[
              [bounds.south, bounds.west],
              [bounds.north, bounds.east],
            ]}
            pathOptions={{
              color: "#0f172a",
              weight: 3,
              opacity: 0.95,
              fill: false,
              interactive: false,
            }}
          />
          <SelectionLayer
            features={features}
            selectedIds={effectiveSelectedIds}
            onToggle={toggleFeature}
          />
        </MapContainer>



        <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-lg backdrop-blur">
          <div className="font-black text-slate-950">Zone de travail</div>
          <div className="mt-0.5">
            {selectableEntries.length.toLocaleString("fr-FR")} route{selectableEntries.length > 1 ? "s" : ""} disponible{selectableEntries.length > 1 ? "s" : ""}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow">
          Données © OpenStreetMap contributors · fond © IGN
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">
            {selectedRoadCount.toLocaleString("fr-FR")} sélectionnée{selectedRoadCount > 1 ? "s" : ""}
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set(selectableEntries.map((entry) => entry.id)))}
            disabled={selectableEntries.length === 0 || selectedRoadCount === selectableEntries.length}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Tout sélectionner
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedIds.size === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Tout désélectionner
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100">
            Retour
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedFeatures)}
            disabled={!canConfirm}
            className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-black text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {selectedRoadCount === 0
              ? "Valider : aucune route"
              : `Valider ${selectedRoadCount.toLocaleString("fr-FR")} route${selectedRoadCount > 1 ? "s" : ""}`}
          </button>
        </div>
      </footer>
    </div>
  );

  return createPortal(modal, document.body);
}
