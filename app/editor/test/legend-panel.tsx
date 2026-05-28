"use client";

import { useEffect, useRef, useState } from "react";

import {
  isFreehandLineFeature,
  type DroMapFeature,
  type DroMapMarkerBuiltinSymbol,
  type DroMapMarkerSymbol,
} from "@/lib/dromap/feature";
import {
  DROMAP_DASH_STYLES,
  getCssBorderStyle,
  getFeatureDashStyle,
  getFeatureMarkerSize,
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
  type DroMapDashStyle,
} from "./feature-style";
import {
  DROMAP_BUILTIN_MARKER_SYMBOLS,
  getFeatureMarkerSymbol,
  getMarkerSymbolHtml,
} from "./marker-symbol";
import { featureHasArrowEnd, featureHasArrowStart } from "./line-arrow";
import { getLegendDedupeKey } from "./legend-entry";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";

type LegendFeature = DroMapFeature;

const MIN_TEXT_FONT_SIZE = 10;
const MAX_TEXT_FONT_SIZE = 72;
const DEFAULT_TEXT_FONT_SIZE = 22;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getFeatureTypeLabel(feature: LegendFeature) {
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  if (type === "text") return "Texte";
  if (type === "marker" || geometryType === "Point") return "Marqueur";
  if (type === "line" || geometryType === "LineString") return "Ligne";
  if (type === "zone" || geometryType === "Polygon") return "Zone";

  return "Élément";
}

function getDefaultFeatureLabel(feature: LegendFeature, index: number) {
  if (feature.properties?.type === "text") {
    return "Texte";
  }

  return `${getFeatureTypeLabel(feature)} ${index + 1}`;
}

function getFeatureObjectLabel(feature: LegendFeature, index: number) {
  const label = feature.properties?.label;

  if (typeof label === "string" && label.trim().length > 0) {
    return label;
  }

  return getDefaultFeatureLabel(feature, index);
}

function getFeatureLegendLabelFallback(feature: LegendFeature) {
  const type = feature.properties?.type;

  if (type === "text") return "Texte";
  if (type === "marker") return "Marqueur";
  if (type === "line") return isFreehandLineFeature(feature) ? "Ligne libre" : "Ligne";
  if (type === "zone") return "Zone";

  return "Objet";
}

function getFeatureLegendLabelValue(feature: LegendFeature) {
  return feature.properties?.legendLabel ?? "";
}

function getFeatureColor(feature: LegendFeature) {
  return (
    feature.properties?.style?.color ||
    feature.properties?.style?.fillColor ||
    "#e63946"
  );
}

function getFeatureFillColor(feature: LegendFeature) {
  return (
    feature.properties?.style?.fillColor ||
    feature.properties?.style?.color ||
    "#e63946"
  );
}

function getFeatureOpacity(feature: LegendFeature) {
  return feature.properties?.style?.opacity ?? 1;
}

function getFeatureFillOpacity(feature: LegendFeature) {
  return feature.properties?.style?.fillOpacity ?? 0.3;
}

function getFeatureWeight(feature: LegendFeature) {
  return feature.properties?.style?.weight ?? 3;
}

function getFeatureFontSize(feature: LegendFeature) {
  const rawValue = Number(feature.properties?.style?.fontSize);

  if (!Number.isFinite(rawValue)) {
    return DEFAULT_TEXT_FONT_SIZE;
  }

  return clamp(rawValue, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE);
}

function getSelectedBuiltinMarkerSymbolId(
  feature: LegendFeature,
): DroMapMarkerBuiltinSymbol {
  const symbol = getFeatureMarkerSymbol(feature);

  if (symbol.type === "builtin") {
    return symbol.id;
  }

  return "circle";
}

function isText(feature: LegendFeature) {
  return feature.properties?.type === "text";
}

function isMarker(feature: LegendFeature) {
  return (
    feature.properties?.type === "marker" ||
    (feature.geometry?.type === "Point" && !isText(feature))
  );
}

function isLine(feature: LegendFeature) {
  return (
    feature.properties?.type === "line" ||
    feature.geometry?.type === "LineString"
  );
}

function isZone(feature: LegendFeature) {
  return (
    feature.properties?.type === "zone" || feature.geometry?.type === "Polygon"
  );
}

function LegendSymbol({ feature }: { feature: LegendFeature }) {
  const color = getFeatureColor(feature);
  const fillColor = getFeatureFillColor(feature);
  const borderStyle = getCssBorderStyle(feature);

  if (isText(feature)) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold"
        style={{
          color,
          opacity: getFeatureOpacity(feature),
        }}
        aria-hidden="true"
      >
        T
      </span>
    );
  }

  if (isMarker(feature)) {
    const displaySize = Math.max(
      10,
      Math.min(getFeatureMarkerSize(feature), 22),
    );

    return (
      <span
        className="inline-block leading-none"
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html: getMarkerSymbolHtml(feature, { size: displaySize }),
        }}
      />
    );
  }

  if (isLine(feature)) {
    const symbolWeight = Math.max(2, Math.min(getFeatureWeight(feature), 6));
    const hasArrowStart = featureHasArrowStart(feature);
    const hasArrowEnd = featureHasArrowEnd(feature);
    const symbolWidth = 42;
    const symbolHeight = 18;
    const centerY = symbolHeight / 2;
    const startX = 1;
    const endX = symbolWidth - 1;
    const arrowWidth = Math.max(9, symbolWeight * 2.4);
    const arrowHalfHeight = Math.max(5, symbolWeight * 1.6);
    const startArrowBaseX = startX + arrowWidth;
    const endArrowBaseX = endX - arrowWidth;
    const lineStartX = hasArrowStart
      ? startArrowBaseX - Math.max(1, symbolWeight * 0.4)
      : startX;
    const lineEndX = hasArrowEnd
      ? endArrowBaseX + Math.max(1, symbolWeight * 0.4)
      : endX;
    const dashArray =
      getFeatureDashStyle(feature) === "solid"
        ? undefined
        : getFeatureDashStyle(feature) === "dashed"
          ? `${Math.max(8, symbolWeight * 3)} ${Math.max(5, symbolWeight * 1.7)}`
          : `0.001 ${Math.max(6, symbolWeight * 2.2)}`;
    const freehandControlOffset = Math.max(4, symbolHeight * 0.24);
    const freehandPath = `M ${lineStartX} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.24} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.44} ${centerY + freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.62} ${centerY} C ${lineStartX + (lineEndX - lineStartX) * 0.76} ${centerY - freehandControlOffset}, ${lineStartX + (lineEndX - lineStartX) * 0.9} ${centerY + freehandControlOffset}, ${lineEndX} ${centerY}`;

    return (
      <svg
        width={symbolWidth}
        height={symbolHeight}
        viewBox={`0 0 ${symbolWidth} ${symbolHeight}`}
        aria-hidden="true"
        focusable="false"
        style={{
          display: "block",
          overflow: "visible",
          opacity: getFeatureOpacity(feature),
        }}
      >
        {isFreehandLineFeature(feature) ? (
          <path
            d={freehandPath}
            fill="none"
            stroke={color}
            strokeWidth={symbolWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
          />
        ) : (
          <line
            x1={lineStartX}
            y1={centerY}
            x2={lineEndX}
            y2={centerY}
            stroke={color}
            strokeWidth={symbolWeight}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={dashArray}
          />
        )}

        {hasArrowStart ? (
          <path
            d={`M ${startX} ${centerY} L ${startArrowBaseX} ${centerY - arrowHalfHeight} L ${startArrowBaseX} ${centerY + arrowHalfHeight} Z`}
            fill={color}
          />
        ) : null}

        {hasArrowEnd ? (
          <path
            d={`M ${endX} ${centerY} L ${endArrowBaseX} ${centerY - arrowHalfHeight} L ${endArrowBaseX} ${centerY + arrowHalfHeight} Z`}
            fill={color}
          />
        ) : null}
      </svg>
    );
  }

  if (isZone(feature)) {
    return (
      <span
        className="inline-block h-4 w-4 border"
        style={{
          backgroundColor: fillColor,
          borderColor: color,
          borderStyle,
          borderWidth: Math.max(1, Math.min(getFeatureWeight(feature), 4)),
          opacity: getFeatureFillOpacity(feature),
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="inline-block h-3 w-3 rounded-sm border border-black/20"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

export function LegendPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const features = useEditorTestFeaturesStore(
    (state) => state.features,
  ) as LegendFeature[];

  const updateFeature = useEditorTestFeaturesStore(
    (state) => state.updateFeature,
  );

  const commitFeaturesHistory = useEditorTestFeaturesStore(
    (state) => state.commitFeaturesHistory,
  );

  const updateFeatureWithHistory = useEditorTestFeaturesStore(
    (state) => state.updateFeatureWithHistory,
  );

  const setLegendGroupLabel = useEditorTestExportStore(
    (state) => state.setLegendGroupLabel,
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId,
  );

  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  function updateLegendLabelForVisualGroup(
    sourceFeature: LegendFeature,
    nextLegendLabel: string,
  ) {
    const sourceGroupKey = getLegendDedupeKey(sourceFeature);
    const groupFeatures = features.filter(
      (candidate) => getLegendDedupeKey(candidate) === sourceGroupKey,
    );

    setLegendGroupLabel(sourceGroupKey, nextLegendLabel);
    commitFeaturesHistory();

    for (const groupFeature of groupFeatures) {
      updateFeature(groupFeature.id, {
        ...groupFeature,
        properties: {
          ...groupFeature.properties,
          legendLabel: nextLegendLabel,
        },
      });
    }
  }

  useEffect(() => {
    if (selectedFeatureId) {
      setIsOpen(true);
    }
  }, [selectedFeatureId]);

  useEffect(() => {
    if (!selectedFeatureId || !isOpen) {
      return;
    }

    window.setTimeout(() => {
      itemRefs.current.get(selectedFeatureId)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
  }, [selectedFeatureId, isOpen, features.length]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-black/10 bg-white/95 px-4 py-2 text-sm font-medium text-slate-800 shadow-lg backdrop-blur transition hover:bg-slate-50"
      >
        Objets
        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {features.length}
        </span>
      </button>
    );
  }

  return (
    <aside className="absolute bottom-4 right-4 z-[1000] max-h-[65vh] w-96 overflow-hidden rounded-xl border border-black/10 bg-white/95 text-sm shadow-lg backdrop-blur">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-slate-900">Objets</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {features.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          Replier
        </button>
      </div>

      <div className="max-h-[55vh] overflow-y-auto p-4">
        {features.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-500">
            Aucun élément pour le moment. Passe en mode édition puis dessine un
            marqueur, une ligne, une zone ou un texte.
          </p>
        ) : (
          <ul className="space-y-3">
            {features.map((feature, index) => (
              <li
                key={feature.id}
                ref={(node) => {
                  if (node) {
                    itemRefs.current.set(feature.id, node);
                  } else {
                    itemRefs.current.delete(feature.id);
                  }
                }}
                onClick={(event) => {
                  const target = event.target as HTMLElement;

                  if (target.closest("input, button, select, textarea")) {
                    return;
                  }

                  if (selectedFeatureId === feature.id) {
                    clearSelectedFeatureId();
                    return;
                  }

                  setSelectedFeatureId(feature.id);
                }}
                className={[
                  "cursor-pointer rounded-lg border p-3 transition",
                  selectedFeatureId === feature.id
                    ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                    : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white",
                ].join(" ")}
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex w-10 shrink-0 items-center justify-center">
                    <LegendSymbol feature={feature} />
                  </span>

                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        Nom indicatif pour l’utilisateur
                      </span>
                      <input
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getFeatureObjectLabel(feature, index)}
                        onChange={(event) => {
                          const nextLabel = event.target.value;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                label: nextLabel,
                              },
                            }),
                          );
                        }}
                        placeholder={getDefaultFeatureLabel(feature, index)}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        Nom dans la légende
                      </span>
                      <input
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getFeatureLegendLabelValue(feature)}
                        onChange={(event) => {
                          updateLegendLabelForVisualGroup(
                            feature,
                            event.target.value,
                          );
                        }}
                        placeholder={getFeatureLegendLabelFallback(feature)}
                      />
                    </label>

                    <div className="text-xs text-slate-500">
                      {getFeatureTypeLabel(feature)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                    <span className="text-slate-600">
                      {isZone(feature) ? "Contour" : "Couleur"}
                    </span>
                    <input
                      type="color"
                      value={getFeatureColor(feature)}
                      onChange={(event) => {
                        const nextColor = event.target.value;

                        updateFeatureWithHistory(
                          feature.id,
                          (currentFeature) => ({
                            ...currentFeature,
                            properties: {
                              ...currentFeature.properties,
                              style: {
                                ...(currentFeature.properties?.style ?? {}),
                                color: nextColor,
                              },
                            },
                          }),
                        );
                      }}
                      className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

                  {isZone(feature) && (
                    <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">Fond</span>
                      <input
                        type="color"
                        value={getFeatureFillColor(feature)}
                        onChange={(event) => {
                          const nextFillColor = event.target.value;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  fillColor: nextFillColor,
                                },
                              },
                            }),
                          );
                        }}
                        className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                      />
                    </label>
                  )}

                  <label className="col-span-2 rounded-md bg-white px-2 py-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-slate-600">Opacité</span>
                      <span className="tabular-nums text-slate-500">
                        {Math.round(getFeatureOpacity(feature) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={getFeatureOpacity(feature)}
                      onPointerDown={() => {
                        commitFeaturesHistory();
                      }}
                      onChange={(event) => {
                        const nextOpacity = Number(event.target.value);

                        updateFeature(feature.id, {
                          ...feature,
                          properties: {
                            ...feature.properties,
                            style: {
                              ...(feature.properties?.style ?? {}),
                              opacity: nextOpacity,
                            },
                          },
                        });
                      }}
                      className="w-full"
                    />
                  </label>

                  {isText(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">Taille du texte</span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureFontSize(feature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_TEXT_FONT_SIZE}
                        max={MAX_TEXT_FONT_SIZE}
                        step="1"
                        value={getFeatureFontSize(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const fontSize = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                fontSize,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isMarker(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 text-slate-600">
                        Forme du marqueur
                      </div>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getSelectedBuiltinMarkerSymbolId(feature)}
                        onChange={(event) => {
                          const symbolId = event.target
                            .value as DroMapMarkerBuiltinSymbol;

                          const symbol: DroMapMarkerSymbol = {
                            type: "builtin",
                            id: symbolId,
                          };

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                symbol,
                              },
                            }),
                          );
                        }}
                      >
                        {DROMAP_BUILTIN_MARKER_SYMBOLS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {isMarker(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          Taille du marqueur
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureMarkerSize(feature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={MIN_MARKER_SIZE}
                        max={MAX_MARKER_SIZE}
                        step="1"
                        value={getFeatureMarkerSize(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const markerSize = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                markerSize,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {(isLine(feature) || isZone(feature)) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 text-slate-600">Trait</div>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        value={getFeatureDashStyle(feature)}
                        onChange={(event) => {
                          const dashStyle = event.target
                            .value as DroMapDashStyle;

                          updateFeatureWithHistory(
                            feature.id,
                            (currentFeature) => ({
                              ...currentFeature,
                              properties: {
                                ...currentFeature.properties,
                                style: {
                                  ...(currentFeature.properties?.style ?? {}),
                                  dashStyle,
                                },
                              },
                            }),
                          );
                        }}
                      >
                        {DROMAP_DASH_STYLES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {isLine(feature) && (
                    <div className="col-span-2 grid grid-cols-2 gap-2 rounded-md bg-white px-2 py-2">
                      <label className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Flèche début</span>
                        <input
                          type="checkbox"
                          checked={
                            feature.properties?.style?.arrowStart === true
                          }
                          onChange={(event) => {
                            const arrowStart = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    arrowStart,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-2">
                        <span className="text-slate-600">Flèche fin</span>
                        <input
                          type="checkbox"
                          checked={feature.properties?.style?.arrowEnd === true}
                          onChange={(event) => {
                            const arrowEnd = event.target.checked;

                            updateFeatureWithHistory(
                              feature.id,
                              (currentFeature) => ({
                                ...currentFeature,
                                properties: {
                                  ...currentFeature.properties,
                                  style: {
                                    ...(currentFeature.properties?.style ?? {}),
                                    arrowEnd,
                                  },
                                },
                              }),
                            );
                          }}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300"
                        />
                      </label>
                    </div>
                  )}

                  {(isLine(feature) || isZone(feature)) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          {isZone(feature) ? "Épaisseur contour" : "Épaisseur"}
                        </span>
                        <span className="tabular-nums text-slate-500">
                          {getFeatureWeight(feature)} px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="12"
                        step="1"
                        value={getFeatureWeight(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const nextWeight = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                weight: nextWeight,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}

                  {isZone(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">Opacité du fond</span>
                        <span className="tabular-nums text-slate-500">
                          {Math.round(getFeatureFillOpacity(feature) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.8"
                        step="0.05"
                        value={getFeatureFillOpacity(feature)}
                        onPointerDown={() => {
                          commitFeaturesHistory();
                        }}
                        onChange={(event) => {
                          const nextFillOpacity = Number(event.target.value);

                          updateFeature(feature.id, {
                            ...feature,
                            properties: {
                              ...feature.properties,
                              style: {
                                ...(feature.properties?.style ?? {}),
                                fillOpacity: nextFillOpacity,
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
