"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  convertGeoJsonLayerToDromapFeatures,
  countDromapFeaturesForGeoJsonLayer,
  GEOJSON_TO_DROMAP_HEAVY_FEATURE_THRESHOLD,
} from "./geojson-layer-conversion";
import { convertDromapLayerToGeoJsonLayer } from "./dromap-layer-to-geojson-conversion";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import {
  createDromapSavedLayer,
  getFeatureLayerId,
  setFeatureLayerId,
  type DroMapLayer,
  type DroMapSavedLayer,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";
import {
  createDromapSavedGeoJsonLayer,
  getGeoJsonLayerDisplayCoordinateCount,
  getGeoJsonPrecisionModeLabel,
  remapSavedGeoJsonLayerToMap,
  type DromapGeoJsonLayer,
  type DromapGeoJsonPrecisionMode,
  type DromapSavedGeoJsonLayer,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";
import { ColorPicker } from "./color-picker";
import { SavedLayersLibraryModal } from "./saved-layers-library-modal";

function cloneJsonValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function createFeatureId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `feature-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatOpacity(opacity: number) {
  return `${Math.round(Math.max(0, Math.min(1, opacity)) * 100)}%`;
}

const GEOJSON_PRECISION_OPTIONS: Array<{
  value: DromapGeoJsonPrecisionMode;
  label: string;
  description: string;
}> = [
  {
    value: "original",
    label: "Originale",
    description: "Toutes les coordonnées du fichier sont utilisées pour l’affichage.",
  },
  {
    value: "intermediate",
    label: "Intermédiaire",
    description: "Environ un tiers des coordonnées est retiré pour gagner en fluidité.",
  },
  {
    value: "light",
    label: "Légère",
    description: "Environ trois quarts des coordonnées sont retirés pour les gros calques.",
  },
];

function getLayerFeatureCount(features: DroMapFeature[], layerId: string) {
  return features.filter((feature) => getFeatureLayerId(feature) === layerId).length;
}

function getLayerPreviewLabel(layer: DroMapLayer, features: DroMapFeature[]) {
  const count = getLayerFeatureCount(features, layer.id);
  return `${count} objet${count > 1 ? "s" : ""}`;
}

type DroMapLayerWithGeoJsonOrigin = DroMapLayer & {
  sourceGeoJsonLayerId?: string;
  sourceGeoJsonLayerName?: string;
  sourceGeoJsonSourceName?: string | null;
};

function hasGeoJsonOriginMetadata(layer: DroMapLayer) {
  const metadata = layer as DroMapLayerWithGeoJsonOrigin;
  return (
    typeof metadata.sourceGeoJsonLayerId === "string" &&
    metadata.sourceGeoJsonLayerId.trim().length > 0
  );
}

function isFeatureFromGeoJson(feature: DroMapFeature) {
  return feature.properties.source?.type === "geojson";
}

function canConvertDromapLayerBackToGeoJson(
  layer: DroMapLayer,
  features: DroMapFeature[],
) {
  if (hasGeoJsonOriginMetadata(layer)) {
    return true;
  }

  return features.some(
    (feature) => getFeatureLayerId(feature) === layer.id && isFeatureFromGeoJson(feature),
  );
}

function createSavedLayerLegendConfig(layerFeatureIds: string[]) {
  const exportState = useEditorTestExportStore.getState();
  const layerFeatureIdSet = new Set(layerFeatureIds);

  return {
    title: exportState.legendTitle,
    hiddenFeatureIds: exportState.hiddenLegendFeatureIds.filter((featureId) =>
      layerFeatureIdSet.has(featureId),
    ),
    featureOrder: exportState.legendFeatureOrder.filter((featureId) =>
      layerFeatureIdSet.has(featureId),
    ),
    groupOrder: cloneJsonValue(exportState.legendGroupOrder),
    sectionOrder: cloneJsonValue(exportState.legendSectionOrder),
    groupLabels: cloneJsonValue(exportState.legendGroupLabels),
    groupSections: cloneJsonValue(exportState.legendGroupSections),
  };
}

function remapSavedLayerFeatures(savedLayer: DroMapSavedLayer, layerId: string) {
  const idMap = new Map<string, string>();

  const features = savedLayer.features.map((feature) => {
    const nextId = createFeatureId();
    idMap.set(feature.id, nextId);

    const clonedFeature = cloneJsonValue(feature);

    return setFeatureLayerId(
      {
        ...clonedFeature,
        id: nextId,
        properties: {
          ...clonedFeature.properties,
          style: {
            ...clonedFeature.properties.style,
          },
          meta: { version: 1 },
        },
      },
      layerId,
    );
  });

  return { features, idMap };
}

type LayerDialogState =
  | { kind: "create-layer"; initialName: string }
  | { kind: "rename-layer"; layer: DroMapLayer; initialName: string }
  | { kind: "save-layer"; layer: DroMapLayer; initialName: string }
  | { kind: "rename-saved-layer"; savedLayer: DroMapSavedLayer; initialName: string }
  | { kind: "delete-layer"; layer: DroMapLayer; featureCount: number }
  | { kind: "convert-layer-to-geojson"; layer: DroMapLayer; featureCount: number }
  | { kind: "rename-geojson-layer"; layer: DromapGeoJsonLayer; initialName: string }
  | { kind: "save-geojson-layer"; layer: DromapGeoJsonLayer; initialName: string }
  | { kind: "rename-saved-geojson-layer"; savedLayer: DromapSavedGeoJsonLayer; initialName: string }
  | { kind: "delete-geojson-layer"; layer: DromapGeoJsonLayer }
  | { kind: "convert-geojson-layer"; layer: DromapGeoJsonLayer; targetFeatureCount: number }
  | { kind: "delete-saved-layer"; savedLayer: DroMapSavedLayer }
  | { kind: "delete-saved-geojson-layer"; savedLayer: DromapSavedGeoJsonLayer }
  | { kind: "message"; title: string; message: string };

type PendingSliderPatch = {
  timeoutId: number | null;
  commit: () => void;
};

export function LayersPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const [dialog, setDialog] = useState<LayerDialogState | null>(null);
  const [isSavedLayersLibraryOpen, setIsSavedLayersLibraryOpen] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [sliderDrafts, setSliderDrafts] = useState<Record<string, number>>({});
  const pendingSliderPatchesRef = useRef<Record<string, PendingSliderPatch>>({});

  const features = useEditorTestFeaturesStore((state) => state.features);
  const replaceFeatures = useEditorTestFeaturesStore((state) => state.replaceFeatures);

  const layers = useEditorTestLayersStore((state) => state.layers);
  const activeLayerId = useEditorTestLayersStore((state) => state.activeLayerId);
  const savedLayers = useEditorTestLayersStore((state) => state.savedLayers);
  const createLayer = useEditorTestLayersStore((state) => state.createLayer);
  const renameLayer = useEditorTestLayersStore((state) => state.renameLayer);
  const deleteLayer = useEditorTestLayersStore((state) => state.deleteLayer);
  const setActiveLayerId = useEditorTestLayersStore((state) => state.setActiveLayerId);
  const toggleLayerVisibility = useEditorTestLayersStore(
    (state) => state.toggleLayerVisibility,
  );
  const setLayerOpacity = useEditorTestLayersStore((state) => state.setLayerOpacity);
  const toggleLayerLocked = useEditorTestLayersStore((state) => state.toggleLayerLocked);
  const moveLayer = useEditorTestLayersStore((state) => state.moveLayer);
  const loadSavedLayersFromStorage = useEditorTestLayersStore(
    (state) => state.loadSavedLayersFromStorage,
  );
  const saveLayerToLibrary = useEditorTestLayersStore(
    (state) => state.saveLayerToLibrary,
  );
  const renameSavedLayer = useEditorTestLayersStore((state) => state.renameSavedLayer);
  const deleteSavedLayer = useEditorTestLayersStore((state) => state.deleteSavedLayer);

  const geoJsonLayers = useEditorTestGeoJsonLayersStore((state) => state.geoJsonLayers);
  const renameGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.renameGeoJsonLayer,
  );
  const removeGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.removeGeoJsonLayer,
  );
  const toggleGeoJsonLayerVisibility = useEditorTestGeoJsonLayersStore(
    (state) => state.toggleGeoJsonLayerVisibility,
  );
  const setGeoJsonLayerOpacity = useEditorTestGeoJsonLayersStore(
    (state) => state.setGeoJsonLayerOpacity,
  );
  const setGeoJsonLayerPrecisionMode = useEditorTestGeoJsonLayersStore(
    (state) => state.setGeoJsonLayerPrecisionMode,
  );
  const toggleGeoJsonLayerLocked = useEditorTestGeoJsonLayersStore(
    (state) => state.toggleGeoJsonLayerLocked,
  );
  const moveGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.moveGeoJsonLayer,
  );
  const updateGeoJsonLayerStyle = useEditorTestGeoJsonLayersStore(
    (state) => state.updateGeoJsonLayerStyle,
  );
  const addGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.addGeoJsonLayer,
  );
  const savedGeoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.savedGeoJsonLayers,
  );
  const loadSavedGeoJsonLayersFromStorage = useEditorTestGeoJsonLayersStore(
    (state) => state.loadSavedGeoJsonLayersFromStorage,
  );
  const saveGeoJsonLayerToLibrary = useEditorTestGeoJsonLayersStore(
    (state) => state.saveGeoJsonLayerToLibrary,
  );
  const renameSavedGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.renameSavedGeoJsonLayer,
  );
  const deleteSavedGeoJsonLayer = useEditorTestGeoJsonLayersStore(
    (state) => state.deleteSavedGeoJsonLayer,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  useEffect(() => {
    loadSavedLayersFromStorage();
    loadSavedGeoJsonLayersFromStorage();
  }, [loadSavedGeoJsonLayersFromStorage, loadSavedLayersFromStorage]);

  useEffect(() => {
    return () => {
      (Object.values(pendingSliderPatchesRef.current) as PendingSliderPatch[]).forEach((pending) => {
        if (pending.timeoutId) {
          window.clearTimeout(pending.timeoutId);
        }
        pending.commit();
      });
    };
  }, []);

  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => b.order - a.order),
    [layers],
  );

  const sortedGeoJsonLayers = useMemo(
    () => [...geoJsonLayers].sort((a, b) => b.order - a.order),
    [geoJsonLayers],
  );

  const appliedSavedLayerIds = useMemo(
    () =>
      new Set(
        layers
          .map((layer) => layer.sourceSavedLayerId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    [layers],
  );

  const appliedSavedGeoJsonLayerIds = useMemo(
    () =>
      new Set(
        geoJsonLayers
          .map((layer) => layer.sourceSavedLayerId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    [geoJsonLayers],
  );

  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0];

  function getSliderDraftValue(key: string, fallback: number) {
    return sliderDrafts[key] ?? fallback;
  }

  function scheduleSliderCommit(key: string, value: number, commit: (nextValue: number) => void) {
    setSliderDrafts((current) => ({ ...current, [key]: value }));

    const pending = pendingSliderPatchesRef.current[key];
    if (pending?.timeoutId) {
      window.clearTimeout(pending.timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      commit(value);
      setSliderDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      delete pendingSliderPatchesRef.current[key];
    }, 90);

    pendingSliderPatchesRef.current[key] = {
      timeoutId,
      commit: () => {
        window.clearTimeout(timeoutId);
        commit(value);
        setSliderDrafts((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        delete pendingSliderPatchesRef.current[key];
      },
    };
  }

  function flushSliderCommit(key: string) {
    pendingSliderPatchesRef.current[key]?.commit();
  }
  const visibleLayerCount = layers.filter((layer) => layer.visible).length;
  const visibleGeoJsonLayerCount = geoJsonLayers.filter((layer) => layer.visible).length;

  function openNameDialog(nextDialog: Extract<LayerDialogState, { initialName: string }>) {
    setDialog(nextDialog);
    setDialogName(nextDialog.initialName);
    setDialogError(null);
  }

  function openMessageDialog(title: string, message: string) {
    setDialog({ kind: "message", title, message });
    setDialogName("");
    setDialogError(null);
  }

  function closeDialog() {
    setDialog(null);
    setDialogName("");
    setDialogError(null);
  }

  function requireDialogName() {
    const name = dialogName.trim();

    if (!name) {
      setDialogError("Le nom ne peut pas être vide.");
      return null;
    }

    return name;
  }

  function handleCreateLayer() {
    openNameDialog({
      kind: "create-layer",
      initialName: `Calque ${layers.length + 1}`,
    });
  }

  function handleRenameLayer(layer: DroMapLayer) {
    openNameDialog({ kind: "rename-layer", layer, initialName: layer.name });
  }

  function handleDeleteLayer(layer: DroMapLayer) {
    setDialog({
      kind: "delete-layer",
      layer,
      featureCount: getLayerFeatureCount(features, layer.id),
    });
    setDialogName("");
    setDialogError(null);
  }

  function handleConvertLayerToGeoJson(layer: DroMapLayer) {
    const layerFeatureCount = getLayerFeatureCount(features, layer.id);

    if (!canConvertDromapLayerBackToGeoJson(layer, features)) {
      openMessageDialog(
        "Conversion impossible",
        "Seuls les calques issus d’un calque GeoJSON peuvent être retransformés en calque GeoJSON léger. Un calque dessiné directement dans DroMap reste un calque DroMap classique.",
      );
      return;
    }

    if (layerFeatureCount === 0) {
      openMessageDialog(
        "Conversion impossible",
        "Ce calque ne contient aucun objet à retransformer en calque GeoJSON léger.",
      );
      return;
    }

    setDialog({
      kind: "convert-layer-to-geojson",
      layer,
      featureCount: layerFeatureCount,
    });
    setDialogName("");
    setDialogError(null);
  }

  function convertEditableLayerToGeoJson(layer: DroMapLayer) {
    if (!canConvertDromapLayerBackToGeoJson(layer, features)) {
      openMessageDialog(
        "Conversion impossible",
        "Ce calque DroMap n’est pas issu d’un calque GeoJSON. Il ne peut pas être transformé en calque GeoJSON léger.",
      );
      return;
    }

    const layerFeatures = features.filter(
      (feature) => getFeatureLayerId(feature) === layer.id,
    );

    if (layerFeatures.length === 0) {
      openMessageDialog(
        "Conversion impossible",
        "Ce calque ne contient plus aucun objet à transformer en calque GeoJSON léger.",
      );
      return;
    }

    const geoJsonLayer = convertDromapLayerToGeoJsonLayer({
      layer,
      features: layerFeatures,
      existingGeoJsonLayerCount: geoJsonLayers.length,
    });

    addGeoJsonLayer(geoJsonLayer);
    clearSelectedFeatureId();
    replaceFeatures(features.filter((feature) => getFeatureLayerId(feature) !== layer.id));
    deleteLayer(layer.id);
  }

  function handleRenameGeoJsonLayer(layer: DromapGeoJsonLayer) {
    openNameDialog({
      kind: "rename-geojson-layer",
      layer,
      initialName: layer.name,
    });
  }

  function handleDeleteGeoJsonLayer(layer: DromapGeoJsonLayer) {
    setDialog({ kind: "delete-geojson-layer", layer });
    setDialogName("");
    setDialogError(null);
  }

  function convertGeoJsonLayerToEditableObjects(layer: DromapGeoJsonLayer) {
    const targetFeatureCount = countDromapFeaturesForGeoJsonLayer(layer);

    if (targetFeatureCount === 0) {
      openMessageDialog(
        "Conversion impossible",
        "Ce calque GeoJSON ne contient aucun élément compatible à ajouter comme objet DroMap éditable.",
      );
      return;
    }

    const nextLayerId = createLayer(layer.name);
    const convertedFeatures = convertGeoJsonLayerToDromapFeatures(
      layer,
      nextLayerId,
    ).map((feature) => {
      const { lockOverride: _lockOverride, ...nextProperties } =
        feature.properties;

      return {
        ...feature,
        properties: {
          ...nextProperties,
          locked: false,
        },
      };
    });

    useEditorTestLayersStore.setState((state) => ({
      layers: state.layers.map((dromapLayer) =>
        dromapLayer.id === nextLayerId
          ? {
              ...dromapLayer,
              name: layer.name,
              visible: layer.visible,
              opacity: layer.opacity,
              // La transformation sert précisément à rendre les éléments éditables.
              // Un verrouillage du calque GeoJSON source ne doit donc jamais être
              // recopié comme verrouillage par défaut du nouveau calque DroMap.
              locked: false,
              sourceGeoJsonLayerId: layer.id,
              sourceGeoJsonLayerName: layer.name,
              sourceGeoJsonSourceName: layer.sourceName ?? null,
              updatedAt: new Date().toISOString(),
            }
          : dromapLayer,
      ),
      activeLayerId: nextLayerId,
    }));

    replaceFeatures([...features, ...convertedFeatures]);
    removeGeoJsonLayer(layer.id);
    clearSelectedFeatureId();
  }

  function handleConvertGeoJsonLayer(layer: DromapGeoJsonLayer) {
    const targetFeatureCount = countDromapFeaturesForGeoJsonLayer(layer);

    if (targetFeatureCount >= GEOJSON_TO_DROMAP_HEAVY_FEATURE_THRESHOLD) {
      setDialog({ kind: "convert-geojson-layer", layer, targetFeatureCount });
      setDialogName("");
      setDialogError(null);
      return;
    }

    convertGeoJsonLayerToEditableObjects(layer);
  }

  function handleSaveLayer(layer: DroMapLayer) {
    const layerFeatures = features.filter(
      (feature) => getFeatureLayerId(feature) === layer.id,
    );

    if (layerFeatures.length === 0) {
      openMessageDialog(
        "Calque vide",
        "Ce calque ne contient aucun objet à enregistrer.",
      );
      return;
    }

    openNameDialog({ kind: "save-layer", layer, initialName: layer.name });
  }
  function handleSaveGeoJsonLayer(layer: DromapGeoJsonLayer) {
    if (layer.data.features.length === 0) {
      openMessageDialog(
        "Calque GeoJSON vide",
        "Ce calque GeoJSON ne contient aucune donnée à enregistrer.",
      );
      return;
    }

    openNameDialog({ kind: "save-geojson-layer", layer, initialName: layer.name });
  }

  function handleApplySavedGeoJsonLayer(savedLayer: DromapSavedGeoJsonLayer) {
    const alreadyAppliedLayer = geoJsonLayers.find(
      (layer) => layer.sourceSavedLayerId === savedLayer.id,
    );

    if (alreadyAppliedLayer) {
      openMessageDialog(
        "Calque GeoJSON déjà ajouté",
        `Le calque GeoJSON “${savedLayer.name}” est déjà présent dans la carte actuelle sous le nom “${alreadyAppliedLayer.name}”. Supprime-le d’abord de la carte si tu veux le réappliquer.`,
      );
      return;
    }

    addGeoJsonLayer(
      remapSavedGeoJsonLayerToMap(savedLayer, geoJsonLayers.length),
    );
  }

  function handleRenameSavedGeoJsonLayer(savedLayer: DromapSavedGeoJsonLayer) {
    openNameDialog({
      kind: "rename-saved-geojson-layer",
      savedLayer,
      initialName: savedLayer.name,
    });
  }

  function handleDeleteSavedGeoJsonLayer(savedLayer: DromapSavedGeoJsonLayer) {
    setDialog({ kind: "delete-saved-geojson-layer", savedLayer });
    setDialogName("");
    setDialogError(null);
  }

  function handleApplySavedLayer(savedLayer: DroMapSavedLayer) {
    const alreadyAppliedLayer = layers.find(
      (layer) => layer.sourceSavedLayerId === savedLayer.id,
    );

    if (alreadyAppliedLayer) {
      openMessageDialog(
        "Calque déjà ajouté",
        `Le calque “${savedLayer.name}” est déjà présent dans la carte actuelle sous le nom “${alreadyAppliedLayer.name}”. Supprime-le d’abord de la carte si tu veux le réappliquer.`,
      );
      return;
    }

    const nextLayerId = createLayer(savedLayer.name);

    useEditorTestLayersStore.setState((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === nextLayerId
          ? {
              ...layer,
              sourceSavedLayerId: savedLayer.id,
              updatedAt: new Date().toISOString(),
            }
          : layer,
      ),
    }));

    const remapped = remapSavedLayerFeatures(savedLayer, nextLayerId);

    replaceFeatures([...features, ...remapped.features]);

    if (savedLayer.legend) {
      const hiddenFeatureIds = (savedLayer.legend.hiddenFeatureIds ?? [])
        .map((featureId) => remapped.idMap.get(featureId))
        .filter((featureId): featureId is string => typeof featureId === "string");
      const featureOrder = (savedLayer.legend.featureOrder ?? [])
        .map((featureId) => remapped.idMap.get(featureId))
        .filter((featureId): featureId is string => typeof featureId === "string");

      useEditorTestExportStore.setState((state) => ({
        hiddenLegendFeatureIds: [
          ...state.hiddenLegendFeatureIds,
          ...hiddenFeatureIds,
        ],
        legendFeatureOrder: [...state.legendFeatureOrder, ...featureOrder],
        legendGroupOrder: Array.from(
          new Set([
            ...state.legendGroupOrder,
            ...(savedLayer.legend?.groupOrder ?? []),
          ]),
        ),
        legendSectionOrder: Array.from(
          new Set([
            ...state.legendSectionOrder,
            ...(savedLayer.legend?.sectionOrder ?? []),
          ]),
        ),
        legendGroupLabels: {
          ...state.legendGroupLabels,
          ...(savedLayer.legend?.groupLabels ?? {}),
        },
        legendGroupSections: {
          ...state.legendGroupSections,
          ...(savedLayer.legend?.groupSections ?? {}),
        },
      }));
    }
  }

  function handleRenameSavedLayer(savedLayer: DroMapSavedLayer) {
    openNameDialog({
      kind: "rename-saved-layer",
      savedLayer,
      initialName: savedLayer.name,
    });
  }

  function handleDeleteSavedLayer(savedLayer: DroMapSavedLayer) {
    setDialog({ kind: "delete-saved-layer", savedLayer });
    setDialogName("");
    setDialogError(null);
  }

  function confirmDialog() {
    if (!dialog) {
      return;
    }

    if (dialog.kind === "message") {
      closeDialog();
      return;
    }

    if (dialog.kind === "create-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      createLayer(name);
      closeDialog();
      return;
    }

    if (dialog.kind === "rename-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      renameLayer(dialog.layer.id, name);
      closeDialog();
      return;
    }

    if (dialog.kind === "rename-geojson-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      renameGeoJsonLayer(dialog.layer.id, name);
      closeDialog();
      return;
    }

    if (dialog.kind === "save-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      const layerFeatures = features.filter(
        (feature) => getFeatureLayerId(feature) === dialog.layer.id,
      );

      if (layerFeatures.length === 0) {
        setDialogError("Ce calque ne contient plus aucun objet à enregistrer.");
        return;
      }

      const savedLayer = createDromapSavedLayer({
        name,
        features: layerFeatures,
        legend: createSavedLayerLegendConfig(layerFeatures.map((feature) => feature.id)),
      });

      saveLayerToLibrary(savedLayer);
      closeDialog();
      return;
    }

    if (dialog.kind === "save-geojson-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      const savedLayer = createDromapSavedGeoJsonLayer({
        name,
        layer: dialog.layer,
      });

      saveGeoJsonLayerToLibrary(savedLayer);
      closeDialog();
      return;
    }

    if (dialog.kind === "rename-saved-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      renameSavedLayer(dialog.savedLayer.id, name);
      closeDialog();
      return;
    }

    if (dialog.kind === "rename-saved-geojson-layer") {
      const name = requireDialogName();
      if (!name) {
        return;
      }

      renameSavedGeoJsonLayer(dialog.savedLayer.id, name);
      closeDialog();
      return;
    }

    if (dialog.kind === "delete-layer") {
      clearSelectedFeatureId();
      replaceFeatures(
        features.filter((feature) => getFeatureLayerId(feature) !== dialog.layer.id),
      );
      deleteLayer(dialog.layer.id);
      closeDialog();
      return;
    }

    if (dialog.kind === "convert-layer-to-geojson") {
      convertEditableLayerToGeoJson(dialog.layer);
      closeDialog();
      return;
    }

    if (dialog.kind === "delete-geojson-layer") {
      removeGeoJsonLayer(dialog.layer.id);
      closeDialog();
      return;
    }

    if (dialog.kind === "convert-geojson-layer") {
      convertGeoJsonLayerToEditableObjects(dialog.layer);
      closeDialog();
      return;
    }

    if (dialog.kind === "delete-saved-layer") {
      deleteSavedLayer(dialog.savedLayer.id);
      closeDialog();
      return;
    }

    if (dialog.kind === "delete-saved-geojson-layer") {
      deleteSavedGeoJsonLayer(dialog.savedLayer.id);
      closeDialog();
    }
  }

  function getDialogTitle() {
    if (!dialog) {
      return "";
    }

    switch (dialog.kind) {
      case "create-layer":
        return "Créer un calque";
      case "rename-layer":
        return "Renommer le calque";
      case "save-layer":
        return "Enregistrer le calque";
      case "rename-geojson-layer":
        return "Renommer le calque GeoJSON";
      case "save-geojson-layer":
        return "Enregistrer le calque GeoJSON";
      case "rename-saved-layer":
        return "Renommer le calque enregistré";
      case "rename-saved-geojson-layer":
        return "Renommer le calque GeoJSON enregistré";
      case "delete-layer":
        return "Supprimer le calque de la carte";
      case "convert-layer-to-geojson":
        return "Re-transformer en calque GeoJSON léger";
      case "delete-geojson-layer":
        return "Supprimer le calque GeoJSON";
      case "convert-geojson-layer":
        return "Ajouter comme objets éditables";
      case "delete-saved-layer":
        return "Supprimer le calque enregistré";
      case "delete-saved-geojson-layer":
        return "Supprimer le calque GeoJSON enregistré";
      case "message":
        return dialog.title;
    }
  }

  function getDialogDescription() {
    if (!dialog) {
      return "";
    }

    switch (dialog.kind) {
      case "create-layer":
        return "Les prochains objets seront dessinés sur ce nouveau calque.";
      case "rename-layer":
        return "Ce nom concerne seulement le calque présent dans la carte actuelle.";
      case "save-layer":
        return "Le calque sera ajouté à ta base locale avec ses objets, styles, labels et réglages de légende.";
      case "rename-geojson-layer":
        return "Ce nom concerne le calque GeoJSON léger importé dans la carte actuelle.";
      case "save-geojson-layer":
        return "Le calque GeoJSON sera ajouté à ta base locale avec ses données et son style global.";
      case "rename-saved-layer":
        return "Le calque sera renommé dans ta base. Les calques déjà appliqués dans une carte ne seront pas modifiés.";
      case "rename-saved-geojson-layer":
        return "Le calque GeoJSON sera renommé dans ta base. Les calques déjà appliqués dans une carte ne seront pas modifiés.";
      case "delete-layer": {
        const count = dialog.featureCount;
        return `${count} objet${count > 1 ? "s" : ""} seront supprimé${count > 1 ? "s" : ""} de cette carte. La base de calques enregistrés ne sera pas modifiée.`;
      }
      case "convert-layer-to-geojson": {
        const count = dialog.featureCount;
        return `Ce calque contient ${count.toLocaleString()} objet${count > 1 ? "s" : ""} DroMap issu${count > 1 ? "s" : ""} d’un calque GeoJSON. Il sera remplacé par un calque GeoJSON léger, en conservant les modifications faites sur les objets convertis.`;
      }
      case "delete-geojson-layer":
        return `Le calque “${dialog.layer.name}” sera retiré de cette carte. Le fichier GeoJSON source ne sera pas modifié.`;
      case "convert-geojson-layer":
        return `Ce calque contient ${dialog.targetFeatureCount.toLocaleString()} éléments qui seront ajoutés comme objets DroMap éditables individuellement. C’est très lourd : la carte, la légende, les exports et l’onglet Objets risquent de laguer fortement. Garde plutôt le calque GeoJSON léger si tu n’as pas besoin d’éditer chaque élément séparément.`;
      case "delete-saved-layer":
        return "Les cartes déjà créées ne seront pas modifiées.";
      case "delete-saved-geojson-layer":
        return "Les cartes déjà créées ne seront pas modifiées.";
      case "message":
        return dialog.message;
    }
  }

  function renderDialog() {
    if (!dialog) {
      return null;
    }

    const isNameDialog =
      dialog.kind === "create-layer" ||
      dialog.kind === "rename-layer" ||
      dialog.kind === "rename-geojson-layer" ||
      dialog.kind === "save-layer" ||
      dialog.kind === "save-geojson-layer" ||
      dialog.kind === "rename-saved-layer" ||
      dialog.kind === "rename-saved-geojson-layer";
    const isDestructive =
      dialog.kind === "delete-layer" ||
      dialog.kind === "delete-geojson-layer" ||
      dialog.kind === "delete-saved-layer" ||
      dialog.kind === "delete-saved-geojson-layer";
    const isLayerToGeoJsonConversion = dialog.kind === "convert-layer-to-geojson";
    const isHeavyConversion = dialog.kind === "convert-geojson-layer";
    const isMessage = dialog.kind === "message";

    return (
      <div
        className="absolute inset-0 flex items-start justify-center bg-slate-950/25 px-4 py-24 backdrop-blur-[1px]"
        style={{ zIndex: panelZIndex + 10 }}
      >
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-2xl">
          <div className="text-base font-semibold text-slate-950">{getDialogTitle()}</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {getDialogDescription()}
          </p>

          {isNameDialog ? (
            <label className="mt-4 block text-xs font-medium text-slate-700">
              Nom
              <input
                autoFocus
                value={dialogName}
                onChange={(event) => {
                  setDialogName(event.target.value);
                  setDialogError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmDialog();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeDialog();
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          ) : null}

          {dialogError ? (
            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {dialogError}
            </div>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            {!isMessage ? (
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Annuler
              </button>
            ) : null}
            <button
              type="button"
              onClick={confirmDialog}
              className={[
                "rounded-lg px-3 py-2 text-xs font-semibold text-white transition",
                isDestructive
                  ? "bg-red-600 hover:bg-red-500"
                  : isHeavyConversion
                    ? "bg-amber-600 hover:bg-amber-500"
                    : isLayerToGeoJsonConversion
                      ? "bg-sky-600 hover:bg-sky-500"
                      : "bg-slate-950 hover:bg-slate-700",
              ].join(" ")}
            >
              {isMessage
                ? "OK"
                : isDestructive
                  ? "Supprimer"
                  : isHeavyConversion
                    ? "Ajouter quand même"
                    : isLayerToGeoJsonConversion
                      ? "Re-transformer"
                      : "Valider"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setPanelZIndex(bringFloatingPanelToFront());
          setIsOpen(true);
        }}
        className="group absolute right-4 top-[5.25rem] z-[1000] flex min-w-56 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-indigo-200 bg-white/95 px-3 py-2.5 text-left text-sm text-slate-900 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:border-indigo-400 hover:bg-white hover:shadow-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition group-hover:bg-indigo-500">
            <svg
              aria-hidden="true"
              width="19"
              height="19"
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
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-black uppercase tracking-wide text-indigo-700">
              Calques
            </span>
            <span className="block max-w-32 truncate font-bold text-slate-950">
              {activeLayer ? activeLayer.name : "Dessin direct"}
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-black text-indigo-700 transition group-hover:bg-indigo-100">
          Gérer →
        </span>
      </button>
    );
  }

  return (
    <>
      <aside
        data-dromap-ignore-shortcuts="true"
        className="absolute right-4 top-[5.25rem] flex max-h-[72vh] w-[25rem] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white/95 text-sm shadow-2xl backdrop-blur"
        style={{ zIndex: panelZIndex }}
        onMouseDown={() => setPanelZIndex(bringFloatingPanelToFront())}
        onFocusCapture={() => setPanelZIndex(bringFloatingPanelToFront())}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <div className="font-semibold text-slate-950">Calques</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {layers.length} calque{layers.length > 1 ? "s" : ""} dessin · {visibleLayerCount} visible{visibleLayerCount > 1 ? "s" : ""}
              {geoJsonLayers.length > 0
                ? ` · ${geoJsonLayers.length} GeoJSON (${visibleGeoJsonLayerCount} visible${visibleGeoJsonLayerCount > 1 ? "s" : ""})`
                : ""}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Carte actuelle
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  Les nouveaux objets sont dessinés sur le calque actif.
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateLayer}
                className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
              >
                + Calque
              </button>
            </div>

            {sortedLayers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs leading-relaxed text-slate-500">
                Aucun calque dessin dans la carte. Les prochains objets seront dessinés directement sur la carte. Tu peux recréer un calque avec “+ Calque”.
              </div>
            ) : null}

            <div className="space-y-2">
              {sortedLayers.map((layer, index) => {
                const isActive = layer.id === activeLayerId;
                const featureCountLabel = getLayerPreviewLabel(layer, features);

                return (
                  <article
                    key={layer.id}
                    className={[
                      "rounded-xl border p-3 transition",
                      isActive
                        ? "border-indigo-300 bg-indigo-50/70"
                        : "border-slate-200 bg-slate-50/70",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveLayerId(layer.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-slate-950">
                            {layer.name}
                          </span>
                          {isActive ? (
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                              actif
                            </span>
                          ) : null}
                          {layer.sourceSavedLayerId ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              base
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {featureCountLabel} · opacité {formatOpacity(layer.opacity)}
                          {layer.locked ? " · verrouillé" : ""}
                          {!layer.visible ? " · masqué" : ""}
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveLayer(layer.id, "up")}
                          disabled={index === 0}
                          title="Monter le calque"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLayer(layer.id, "down")}
                          disabled={index === sortedLayers.length - 1}
                          title="Descendre le calque"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ↓
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleLayerVisibility(layer.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {layer.visible ? "Masquer" : "Afficher"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleLayerLocked(layer.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {layer.locked ? "Déverr." : "Verrou."}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRenameLayer(layer)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveLayer(layer)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        Enregistrer
                      </button>
                    </div>

                    {canConvertDromapLayerBackToGeoJson(layer, features) ? (
                      <button
                        type="button"
                        onClick={() => handleConvertLayerToGeoJson(layer)}
                        className="mt-2 w-full rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                      >
                        Re-transformer en calque GeoJSON léger
                      </button>
                    ) : null}

                    <label className="mt-3 block text-xs text-slate-600">
                      Opacité globale : {formatOpacity(getSliderDraftValue(`layer-opacity:${layer.id}`, layer.opacity))}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(getSliderDraftValue(`layer-opacity:${layer.id}`, layer.opacity) * 100)}
                        onChange={(event) => {
                          const value = Number(event.target.value) / 100;
                          scheduleSliderCommit(`layer-opacity:${layer.id}`, value, (nextValue) =>
                            setLayerOpacity(layer.id, nextValue),
                          );
                        }}
                        onPointerUp={() => flushSliderCommit(`layer-opacity:${layer.id}`)}
                        onKeyUp={() => flushSliderCommit(`layer-opacity:${layer.id}`)}
                        className="mt-1 w-full"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleDeleteLayer(layer)}
                      className="mt-2 w-full rounded-lg border border-red-100 bg-white px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Supprimer de la carte
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Calques GeoJSON légers
              </div>
              <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Les imports GeoJSON lourds restent groupés en calques légers : ils sont affichables, masquables, stylables et beaucoup moins coûteux que des centaines d’objets DroMap.
              </div>
            </div>

            {sortedGeoJsonLayers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                Aucun calque GeoJSON importé pour l’instant.
              </div>
            ) : (
              <div className="space-y-2">
                {sortedGeoJsonLayers.map((layer, index) => (
                  <article
                    key={layer.id}
                    className="rounded-xl border border-sky-100 bg-sky-50/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-slate-950">
                            {layer.name}
                          </span>
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                            GeoJSON
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {layer.featureCount} entité{layer.featureCount > 1 ? "s" : ""} · {getGeoJsonLayerDisplayCoordinateCount(layer).toLocaleString()} / {layer.coordinateCount.toLocaleString()} coordonnée{layer.coordinateCount > 1 ? "s" : ""} affichée{getGeoJsonLayerDisplayCoordinateCount(layer) > 1 ? "s" : ""} · précision {getGeoJsonPrecisionModeLabel(layer.precisionMode)} · opacité {formatOpacity(layer.opacity)}
                          {layer.locked ? " · verrouillé" : ""}
                          {!layer.visible ? " · masqué" : ""}
                        </div>
                        {layer.sourceLabel || layer.sourceLicense ? (
                          <div className="mt-1 text-[11px] leading-relaxed text-sky-800">
                            {layer.sourceLabel ? (
                              <>
                                Source : {layer.sourceUrl ? (
                                  <a
                                    href={layer.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold underline decoration-sky-300 underline-offset-2 hover:text-sky-950"
                                  >
                                    {layer.sourceLabel}
                                  </a>
                                ) : (
                                  <span className="font-semibold">
                                    {layer.sourceLabel}
                                  </span>
                                )}
                              </>
                            ) : null}
                            {layer.sourceLabel && layer.sourceLicense ? " · " : ""}
                            {layer.sourceLicense ? layer.sourceLicense : null}
                            {layer.sourceVersion ? ` · ${layer.sourceVersion}` : ""}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveGeoJsonLayer(layer.id, "up")}
                          disabled={index === 0}
                          title="Monter le calque GeoJSON"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveGeoJsonLayer(layer.id, "down")}
                          disabled={index === sortedGeoJsonLayers.length - 1}
                          title="Descendre le calque GeoJSON"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          ↓
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggleGeoJsonLayerVisibility(layer.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {layer.visible ? "Masquer" : "Afficher"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGeoJsonLayerLocked(layer.id)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {layer.locked ? "Déverr." : "Verrou."}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRenameGeoJsonLayer(layer)}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveGeoJsonLayer(layer)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                      >
                        Enreg.
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConvertGeoJsonLayer(layer)}
                      className="mt-2 flex w-full flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-center text-xs font-semibold leading-tight text-amber-900 hover:bg-amber-100"
                    >
                      <span>Transformer en objets DroMap</span>
                      <span className="mt-0.5 text-[10px] font-medium text-amber-700">
                        éditables individuellement
                      </span>
                    </button>

                    <label className="mt-3 block text-xs font-medium text-slate-700">
                      Précision du rendu
                      <select
                        value={layer.precisionMode}
                        onChange={(event) =>
                          setGeoJsonLayerPrecisionMode(
                            layer.id,
                            event.target.value as DromapGeoJsonPrecisionMode,
                          )
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                      >
                        {GEOJSON_PRECISION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                        {
                          GEOJSON_PRECISION_OPTIONS.find(
                            (option) => option.value === layer.precisionMode,
                          )?.description
                        }
                      </span>
                    </label>

                    <label className="mt-3 block text-xs text-slate-600">
                      Opacité globale : {formatOpacity(getSliderDraftValue(`geojson-opacity:${layer.id}`, layer.opacity))}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(getSliderDraftValue(`geojson-opacity:${layer.id}`, layer.opacity) * 100)}
                        onChange={(event) => {
                          const value = Number(event.target.value) / 100;
                          scheduleSliderCommit(`geojson-opacity:${layer.id}`, value, (nextValue) =>
                            setGeoJsonLayerOpacity(layer.id, nextValue),
                          );
                        }}
                        onPointerUp={() => flushSliderCommit(`geojson-opacity:${layer.id}`)}
                        onKeyUp={() => flushSliderCommit(`geojson-opacity:${layer.id}`)}
                        className="mt-1 w-full"
                      />
                    </label>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1 text-slate-700">
                        <span className="block">Trait / points</span>
                        <ColorPicker
                          value={layer.style.strokeColor}
                          onChange={(strokeColor) =>
                            updateGeoJsonLayerStyle(layer.id, { strokeColor })
                          }
                          ariaLabel="Couleur du trait et des points GeoJSON"
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-1 text-slate-700">
                        <span className="block">Fond zones</span>
                        <ColorPicker
                          value={layer.style.fillColor}
                          onChange={(fillColor) =>
                            updateGeoJsonLayerStyle(layer.id, { fillColor })
                          }
                          ariaLabel="Couleur du fond des zones GeoJSON"
                          className="w-full"
                        />
                      </div>
                      <label className="space-y-1 text-slate-700">
                        <span>Épaisseur</span>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={layer.style.strokeWeight}
                          onChange={(event) =>
                            updateGeoJsonLayerStyle(layer.id, {
                              strokeWeight: Math.max(1, Math.min(24, Number(event.target.value) || 1)),
                            })
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
                        />
                      </label>
                      <label className="space-y-1 text-slate-700">
                        <span>Taille points</span>
                        <input
                          type="number"
                          min={2}
                          max={48}
                          value={layer.style.markerSize}
                          onChange={(event) =>
                            updateGeoJsonLayerStyle(layer.id, {
                              markerSize: Math.max(2, Math.min(48, Number(event.target.value) || 2)),
                            })
                          }
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5"
                        />
                      </label>
                      <label className="space-y-1 text-slate-700">
                        <span>Opacité trait : {Math.round(getSliderDraftValue(`geojson-stroke-opacity:${layer.id}`, layer.style.strokeOpacity) * 100)}%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(getSliderDraftValue(`geojson-stroke-opacity:${layer.id}`, layer.style.strokeOpacity) * 100)}
                          onChange={(event) => {
                            const value = Number(event.target.value) / 100;
                            scheduleSliderCommit(`geojson-stroke-opacity:${layer.id}`, value, (nextValue) =>
                              updateGeoJsonLayerStyle(layer.id, { strokeOpacity: nextValue }),
                            );
                          }}
                          onPointerUp={() => flushSliderCommit(`geojson-stroke-opacity:${layer.id}`)}
                          onKeyUp={() => flushSliderCommit(`geojson-stroke-opacity:${layer.id}`)}
                          className="w-full"
                        />
                      </label>
                      <label className="space-y-1 text-slate-700">
                        <span>Opacité fond : {Math.round(getSliderDraftValue(`geojson-fill-opacity:${layer.id}`, layer.style.fillOpacity) * 100)}%</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(getSliderDraftValue(`geojson-fill-opacity:${layer.id}`, layer.style.fillOpacity) * 100)}
                          onChange={(event) => {
                            const value = Number(event.target.value) / 100;
                            scheduleSliderCommit(`geojson-fill-opacity:${layer.id}`, value, (nextValue) =>
                              updateGeoJsonLayerStyle(layer.id, { fillOpacity: nextValue }),
                            );
                          }}
                          onPointerUp={() => flushSliderCommit(`geojson-fill-opacity:${layer.id}`)}
                          onKeyUp={() => flushSliderCommit(`geojson-fill-opacity:${layer.id}`)}
                          className="w-full"
                        />
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteGeoJsonLayer(layer)}
                      className="mt-2 w-full rounded-lg border border-red-100 bg-white px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Supprimer de la carte
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-3 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setPanelZIndex(bringFloatingPanelToFront());
                setIsSavedLayersLibraryOpen(true);
              }}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition group-hover:bg-indigo-500">
                  <svg
                    aria-hidden="true"
                    width="21"
                    height="21"
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
                </span>
                <span className="min-w-0">
                  <span className="block font-black text-slate-950">
                    Mes calques enregistrés
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                    {savedLayers.length + savedGeoJsonLayers.length === 0
                      ? "Aucun calque enregistré pour l’instant."
                      : `${savedLayers.length + savedGeoJsonLayers.length} calque${savedLayers.length + savedGeoJsonLayers.length > 1 ? "s" : ""} avec prévisualisation`}
                  </span>
                </span>
              </span>
              <span className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-black text-indigo-700 transition group-hover:bg-indigo-100">
                Ouvrir →
              </span>
            </button>
          </section>

        </div>
      </aside>

      <SavedLayersLibraryModal
        isOpen={isSavedLayersLibraryOpen}
        zIndex={panelZIndex + 5}
        savedLayers={savedLayers}
        savedGeoJsonLayers={savedGeoJsonLayers}
        appliedSavedLayerIds={appliedSavedLayerIds}
        appliedSavedGeoJsonLayerIds={appliedSavedGeoJsonLayerIds}
        onClose={() => setIsSavedLayersLibraryOpen(false)}
        onApplySavedLayer={handleApplySavedLayer}
        onRenameSavedLayer={handleRenameSavedLayer}
        onDeleteSavedLayer={handleDeleteSavedLayer}
        onApplySavedGeoJsonLayer={handleApplySavedGeoJsonLayer}
        onRenameSavedGeoJsonLayer={handleRenameSavedGeoJsonLayer}
        onDeleteSavedGeoJsonLayer={handleDeleteSavedGeoJsonLayer}
      />

      {renderDialog()}
    </>
  );
}
