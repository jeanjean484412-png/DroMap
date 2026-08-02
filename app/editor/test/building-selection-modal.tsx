"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L, { type GeoJSON as LeafletGeoJsonLayer, type Path } from "leaflet";
import { MapContainer, Rectangle, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export type BuildingSelectionFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  GeoJSON.GeoJsonProperties
>;

export type BuildingSelectionBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

type BuildingSelectionModalProps = {
  features: BuildingSelectionFeature[];
  bounds: BuildingSelectionBounds;
  onCancel: () => void;
  onConfirm: (features: BuildingSelectionFeature[]) => void;
};

type FeaturePath = Path & {
  feature?: BuildingSelectionFeature;
};

function getFeatureSelectionId(
  feature: BuildingSelectionFeature,
  fallbackIndex: number,
) {
  if (typeof feature.id === "string" || typeof feature.id === "number") {
    return String(feature.id);
  }

  const properties = feature.properties;
  const candidate =
    properties && typeof properties === "object"
      ? properties.cleabs ?? properties.id ?? properties.label ?? properties.nom
      : null;

  if (typeof candidate === "string" || typeof candidate === "number") {
    return String(candidate);
  }

  return `building-${fallbackIndex + 1}`;
}

const LATIN_LETTER_PATTERN = /\p{Script=Latin}/u;
const CYRILLIC_LETTER_PATTERN = /\p{Script=Cyrillic}/u;
const LETTER_PATTERN = /\p{L}/u;

function isPreferredDisplayScript(value: string) {
  let hasLetter = false;
  for (const character of value) {
    if (!LETTER_PATTERN.test(character)) continue;
    hasLetter = true;
    if (
      !LATIN_LETTER_PATTERN.test(character) &&
      !CYRILLIC_LETTER_PATTERN.test(character)
    ) {
      return false;
    }
  }
  return hasLetter;
}

function normalizeBuildingDisplayName(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = value.trim();
  if (!isPreferredDisplayScript(candidate)) return null;
  const normalized = candidate
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (
    new Set([
      "batiment",
      "batiment sans nom renseigne",
      "indifferencie",
      "commercial",
      "industriel",
      "residentiel",
      "agricole",
      "sans nom",
      "unknown",
    ]).has(normalized)
  ) {
    return null;
  }
  return candidate;
}

function getFeatureExactName(feature: BuildingSelectionFeature) {
  const properties = feature.properties;

  if (!properties || typeof properties !== "object") {
    return null;
  }

  const candidates = [
    properties["name:fr"],
    properties.name_fr,
    properties.official_name_fr,
    properties.short_name_fr,
    properties.int_name,
    properties["name:en"],
    properties.name_en,
    properties.name,
    properties.official_name,
    properties.osm_name,
    properties.nom,
    properties.toponyme,
    properties.denomination,
    properties.designation,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBuildingDisplayName(candidate);
    if (normalized) return normalized;
  }

  return null;
}

function getFeatureName(feature: BuildingSelectionFeature) {
  if (getFeatureExactName(feature)) {
    return getFeatureExactName(feature) as string;
  }

  const properties = feature.properties;
  if (properties && typeof properties === "object") {
    for (const candidate of [
      properties.adresse,
      properties.address,
      properties.label,
    ]) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return "Bâtiment sans nom renseigné";
}

type ReverseNameProposal = {
  id: string;
  name: string;
  displayName: string | null;
  category: string | null;
  type: string | null;
  distanceMeters: number;
  confidence: "forte" | "moyenne" | "prudente";
  source: string;
};

type ReverseNameResponse = {
  proposals?: ReverseNameProposal[];
  searchedCount?: number;
  limit?: number;
  warning?: string;
  error?: string;
};

function collectGeometryCoordinates(geometry: BuildingSelectionFeature["geometry"]) {
  const result: Array<[number, number]> = [];
  const visit = (value: unknown) => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      result.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry.coordinates);
  return result;
}

function getFeatureCenter(feature: BuildingSelectionFeature) {
  const coordinates = collectGeometryCoordinates(feature.geometry);
  if (!coordinates.length) return null;
  const sum = coordinates.reduce(
    (current, coordinate) => ({
      lng: current.lng + coordinate[0],
      lat: current.lat + coordinate[1],
    }),
    { lng: 0, lat: 0 },
  );
  return {
    lng: sum.lng / coordinates.length,
    lat: sum.lat / coordinates.length,
  };
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
  features: BuildingSelectionFeature[];
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
    const paneName = "dromap-building-selection-pane";
    const existingPane = map.getPane(paneName);
    const pane = existingPane ?? map.createPane(paneName);
    pane.style.zIndex = "650";

    const canvasRenderer = L.canvas({ pane: paneName, padding: 0.5 });
    const idByFeature = new WeakMap<object, string>();
    idByFeatureRef.current = idByFeature;

    features.forEach((feature, index) => {
      idByFeature.set(feature, getFeatureSelectionId(feature, index));
    });

    const getStyle = (feature?: BuildingSelectionFeature) => {
      const featureId = feature ? idByFeature.get(feature) : null;
      const isSelected = featureId
        ? selectedIdsRef.current.has(featureId)
        : false;

      return {
        renderer: canvasRenderer,
        pane: paneName,
        color: isSelected ? "#b45309" : "#475569",
        weight: isSelected ? 2.2 : 1,
        opacity: 1,
        fillColor: isSelected ? "#f59e0b" : "#cbd5e1",
        fillOpacity: isSelected ? 0.72 : 0.34,
      };
    };

    const collection: GeoJSON.FeatureCollection<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      GeoJSON.GeoJsonProperties
    > = {
      type: "FeatureCollection",
      features,
    };

    const geoJsonLayer = L.geoJSON(collection, {
      pane: paneName,
      style: (feature) => getStyle(feature as BuildingSelectionFeature),
      onEachFeature: (feature, leafletLayer) => {
        const typedFeature = feature as BuildingSelectionFeature;
        const featureId = idByFeature.get(typedFeature);

        if (!featureId) {
          return;
        }

        leafletLayer.bindTooltip(getFeatureName(typedFeature), {
          sticky: true,
          direction: "top",
          opacity: 0.95,
          className: "dromap-building-selection-tooltip",
        });

        leafletLayer.on("click", (event) => {
          L.DomEvent.stop(event.originalEvent);
          onToggleRef.current(featureId);
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

      if (!path.setStyle || !path.feature) {
        return;
      }

      const featureId = idByFeatureRef.current.get(path.feature);
      const isSelected = featureId ? selectedIds.has(featureId) : false;

      path.setStyle({
        color: isSelected ? "#b45309" : "#475569",
        weight: isSelected ? 2.2 : 1,
        opacity: 1,
        fillColor: isSelected ? "#f59e0b" : "#cbd5e1",
        fillOpacity: isSelected ? 0.72 : 0.34,
      });
    });
  }, [selectedIds]);

  return null;
}

function MapBoundsController({ bounds }: { bounds: BuildingSelectionBounds }) {
  const map = useMap();

  useEffect(() => {
    const leafletBounds = L.latLngBounds(
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    );

    map.fitBounds(leafletBounds, {
      padding: [36, 36],
      animate: false,
    });
    map.setMaxBounds(leafletBounds.pad(0.35));
    map.invalidateSize();
  }, [bounds, map]);

  return null;
}

export function BuildingSelectionModal({
  features,
  bounds,
  onCancel,
  onConfirm,
}: BuildingSelectionModalProps) {
  const [workingFeatures, setWorkingFeatures] =
    useState<BuildingSelectionFeature[]>(() =>
      features.map((feature) => structuredClone(feature)),
    );
  const indexedFeatures = useMemo(
    () =>
      workingFeatures.map((feature, index) => ({
        feature,
        id: getFeatureSelectionId(feature, index),
      })),
    [workingFeatures],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isSearchingNames, setIsSearchingNames] = useState(false);
  const [nameSearchMessage, setNameSearchMessage] = useState<string | null>(null);
  const [nameProposals, setNameProposals] = useState<ReverseNameProposal[]>([]);
  const [acceptedProposalIds, setAcceptedProposalIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setWorkingFeatures(features.map((feature) => structuredClone(feature)));
    setSelectedIds(new Set());
    setNameSearchMessage(null);
    setNameProposals([]);
    setAcceptedProposalIds(new Set());
  }, [features]);

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
        return;
      }

      if (isEditorShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onCancel]);

  const toggleFeature = (featureId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(featureId)) {
        next.delete(featureId);
      } else {
        next.add(featureId);
      }

      return next;
    });
  };

  const selectedEntries = indexedFeatures.filter((entry) =>
    selectedIds.has(entry.id),
  );
  const selectedFeatures = selectedEntries.map((entry) => entry.feature);
  const unnamedSelectedEntries = selectedEntries.filter(
    (entry) => !getFeatureExactName(entry.feature),
  );
  const isWholeZoneSelection =
    indexedFeatures.length > 0 && selectedIds.size === indexedFeatures.length;

  const searchNamesByCoordinates = async () => {
    if (!unnamedSelectedEntries.length || isSearchingNames) return;
    if (isWholeZoneSelection) {
      setNameSearchMessage(
        "La recherche par coordonnées n'est pas lancée pour l'import de tous les bâtiments de la zone. Sélectionne seulement quelques bâtiments ciblés pour utiliser cette option.",
      );
      return;
    }
    const targets = unnamedSelectedEntries
      .map((entry) => ({
        ...entry,
        center: getFeatureCenter(entry.feature),
      }))
      .filter(
        (entry): entry is typeof entry & { center: { lat: number; lng: number } } =>
          entry.center !== null,
      )
      .slice(0, 20);

    if (!targets.length) {
      setNameSearchMessage(
        "Aucune coordonnée exploitable n'est disponible pour les bâtiments sélectionnés.",
      );
      return;
    }

    const estimatedSeconds = Math.max(2, targets.length);
    const confirmed = window.confirm(
      `Recherche facultative par coordonnées pour ${targets.length} bâtiment${targets.length > 1 ? "s" : ""}.\n\n` +
        `Elle interroge OpenStreetMap une coordonnée à la fois et peut durer environ ${estimatedSeconds} secondes. Les résultats seront proposés avant toute modification.\n\nLancer la recherche ?`,
    );
    if (!confirmed) return;

    setIsSearchingNames(true);
    setNameSearchMessage(
      `Recherche par coordonnées en cours pour ${targets.length} bâtiment${targets.length > 1 ? "s" : ""}…`,
    );
    setNameProposals([]);
    setAcceptedProposalIds(new Set());

    try {
      const response = await fetch("/api/dromap/buildings/reverse-names", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          purpose: "manual-selected-buildings",
          points: targets.map((entry) => ({
            id: entry.id,
            lat: entry.center.lat,
            lng: entry.center.lng,
          })),
        }),
      });
      const payload = (await response.json()) as ReverseNameResponse;
      if (!response.ok) {
        throw new Error(
          payload.error ?? "La recherche de noms par coordonnées a échoué.",
        );
      }
      const proposals = Array.isArray(payload.proposals)
        ? payload.proposals
        : [];
      setNameProposals(proposals);
      setAcceptedProposalIds(new Set(proposals.map((proposal) => proposal.id)));
      setNameSearchMessage(
        proposals.length
          ? `${proposals.length} proposition${proposals.length > 1 ? "s" : ""} trouvée${proposals.length > 1 ? "s" : ""}. Vérifie-les avant de les appliquer.`
          : "Aucun nom supplémentaire suffisamment fiable n'a été trouvé à partir des coordonnées.",
      );
    } catch (error) {
      setNameSearchMessage(
        error instanceof Error
          ? error.message
          : "La recherche de noms par coordonnées a échoué.",
      );
    } finally {
      setIsSearchingNames(false);
    }
  };

  const applyAcceptedNameProposals = () => {
    const accepted = new Map(
      nameProposals
        .filter((proposal) => acceptedProposalIds.has(proposal.id))
        .map((proposal) => [proposal.id, proposal]),
    );
    if (!accepted.size) return;

    setWorkingFeatures((current) =>
      current.map((feature, index) => {
        const id = getFeatureSelectionId(feature, index);
        const proposal = accepted.get(id);
        if (!proposal) return feature;
        return {
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            label: proposal.name,
            name: proposal.name,
            name_source: proposal.source,
            name_confidence: proposal.confidence,
            reverse_name_distance_m: proposal.distanceMeters,
            reverse_name_category: proposal.category,
            reverse_name_type: proposal.type,
          },
        };
      }),
    );
    setNameSearchMessage(
      `${accepted.size} nom${accepted.size > 1 ? "s" : ""} appliqué${accepted.size > 1 ? "s" : ""} aux bâtiments sélectionnés.`,
    );
    setNameProposals([]);
    setAcceptedProposalIds(new Set());
  };

  return (
    <div className="fixed inset-0 z-[30000] flex flex-col bg-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950">
            Sélectionner les bâtiments à importer
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Clique sur les bâtiments utiles. Les éléments orange seront ajoutés
            directement comme objets DroMap éditables individuellement.
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
          zoomControl
          attributionControl={false}
          minZoom={1}
          maxZoom={22}
          center={[
            (bounds.south + bounds.north) / 2,
            (bounds.west + bounds.east) / 2,
          ]}
          zoom={16}
          className="h-full w-full"
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
            features={workingFeatures}
            selectedIds={selectedIds}
            onToggle={toggleFeature}
          />
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 right-3 z-[1000] rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow">
          © IGN · Géoplateforme
        </div>

        <div className="pointer-events-none absolute left-4 top-4 z-[1000] rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-lg backdrop-blur">
          <div className="font-black text-slate-950">Zone de travail</div>
          <div className="mt-0.5">
            {workingFeatures.length.toLocaleString("fr-FR")} bâtiment
            {workingFeatures.length > 1 ? "s" : ""} disponible
            {workingFeatures.length > 1 ? "s" : ""}
          </div>
        </div>

        {nameProposals.length > 0 ? (
          <div className="absolute right-4 top-4 z-[1100] max-h-[calc(100%-2rem)] w-[26rem] max-w-[calc(100%-2rem)] overflow-auto rounded-2xl border border-indigo-200 bg-white/97 p-4 text-xs shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">
                  Propositions obtenues par coordonnées
                </p>
                <p className="mt-1 leading-5 text-slate-600">
                  Elles ne sont pas appliquées automatiquement. Décoche les noms douteux.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNameProposals([]);
                  setAcceptedProposalIds(new Set());
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-500 hover:bg-slate-100"
              >
                Fermer
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {nameProposals.map((proposal) => (
                <label
                  key={proposal.id}
                  className="flex cursor-pointer gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
                >
                  <input
                    type="checkbox"
                    checked={acceptedProposalIds.has(proposal.id)}
                    onChange={(event) => {
                      setAcceptedProposalIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(proposal.id);
                        else next.delete(proposal.id);
                        return next;
                      });
                    }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-black text-slate-900">
                      {proposal.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                      Confiance {proposal.confidence} · objet trouvé à {proposal.distanceMeters} m
                      {proposal.type ? ` · ${proposal.type}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={applyAcceptedNameProposals}
              disabled={acceptedProposalIds.size === 0}
              className="mt-3 w-full rounded-lg bg-indigo-600 px-3 py-2 font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Appliquer {acceptedProposalIds.size} proposition
              {acceptedProposalIds.size > 1 ? "s" : ""}
            </button>
          </div>
        ) : null}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">
            {selectedIds.size.toLocaleString("fr-FR")} sélectionné
            {selectedIds.size > 1 ? "s" : ""}
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={selectedIds.size === 0}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
          >
            Tout désélectionner
          </button>
          {unnamedSelectedEntries.length > 0 && !isWholeZoneSelection ? (
            <button
              type="button"
              onClick={() => void searchNamesByCoordinates()}
              disabled={isSearchingNames}
              className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
              title="Recherche facultative et lente : les résultats seront proposés avant application"
            >
              {isSearchingNames
                ? "Recherche des noms…"
                : `Chercher les noms par coordonnées (${Math.min(20, unnamedSelectedEntries.length)})`}
            </button>
          ) : null}
          {isWholeZoneSelection && unnamedSelectedEntries.length > 0 ? (
            <span className="max-w-[34rem] text-[11px] leading-4 text-slate-600">
              Import complet : aucune recherche par coordonnées ne sera lancée.
            </span>
          ) : null}
          {nameSearchMessage ? (
            <span className="max-w-[34rem] text-[11px] leading-4 text-slate-600">
              {nameSearchMessage}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedFeatures)}
            disabled={selectedFeatures.length === 0}
            className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-black text-slate-950 shadow-sm transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            Ajouter {selectedFeatures.length.toLocaleString("fr-FR")} bâtiment
            {selectedFeatures.length > 1 ? "s" : ""}
          </button>
        </div>
      </footer>
    </div>
  );
}
