"use client";

import { useState } from "react";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";

type FeatureStyle = {
  color?: string;
  fillColor?: string;
  opacity?: number;
  fillOpacity?: number;
  weight?: number;
};

type LegendFeature = {
  id?: string;
  geometry?: {
    type?: string;
  };
  properties?: {
    type?: "marker" | "line" | "zone" | string;
    label?: string;
    style?: FeatureStyle;
  };
};

function getFeatureTypeLabel(feature: LegendFeature) {
  const type = feature.properties?.type;
  const geometryType = feature.geometry?.type;

  if (type === "marker" || geometryType === "Point") return "Marqueur";
  if (type === "line" || geometryType === "LineString") return "Ligne";
  if (type === "zone" || geometryType === "Polygon") return "Zone";

  return "Élément";
}

function getDefaultFeatureLabel(feature: LegendFeature, index: number) {
  return `${getFeatureTypeLabel(feature)} ${index + 1}`;
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

function isMarker(feature: LegendFeature) {
  return (
    feature.properties?.type === "marker" || feature.geometry?.type === "Point"
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

  if (isMarker(feature)) {
    return (
      <span
        className="inline-block h-3 w-3 rounded-full border border-black/20"
        style={{
          backgroundColor: color,
          opacity: getFeatureOpacity(feature),
        }}
        aria-hidden="true"
      />
    );
  }

  if (isLine(feature)) {
    return (
      <span
        className="inline-block rounded-full"
        style={{
          width: 32,
          height: Math.max(2, getFeatureWeight(feature)),
          backgroundColor: color,
          opacity: getFeatureOpacity(feature),
        }}
        aria-hidden="true"
      />
    );
  }

  if (isZone(feature)) {
    return (
      <span
        className="inline-block h-4 w-4 border"
        style={{
          backgroundColor: fillColor,
          borderColor: color,
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

  const features = useEditorTestFeaturesStore(
    (state) => state.features
  ) as LegendFeature[];

  const updateFeature = useEditorTestFeaturesStore(
    (state) => state.updateFeature
  );

  const selectedFeatureId = useEditorTestSelectionStore(
    (state) => state.selectedFeatureId
  );
  
  const setSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.setSelectedFeatureId
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId
  );

  function updateFeatureLabel(feature: LegendFeature, label: string) {
    if (!feature.id) return;

    updateFeature(feature.id, {
      ...feature,
      properties: {
        ...feature.properties,
        label,
      },
    });
  }

  function updateFeatureStyle(feature: LegendFeature, stylePatch: FeatureStyle) {
    if (!feature.id) return;

    updateFeature(feature.id, {
      ...feature,
      properties: {
        ...feature.properties,
        style: {
          ...feature.properties?.style,
          ...stylePatch,
        },
      },
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute bottom-4 right-4 z-[1000] rounded-xl border border-black/10 bg-white/95 px-4 py-2 text-sm font-medium text-slate-800 shadow-lg backdrop-blur transition hover:bg-slate-50"
      >
        Légende
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
          <h2 className="font-semibold text-slate-900">Légende</h2>
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
            marqueur, une ligne ou une zone.
          </p>
        ) : (
          <ul className="space-y-3">
            {features.map((feature, index) => (
              <li
                key={feature.id ?? index}
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("input, button, select, textarea")){
                    return;
                  }
                  if (!feature.id) return;

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

                  <div className="min-w-0 flex-1">
                    <input
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={
                        feature.properties?.label ??
                        getDefaultFeatureLabel(feature, index)
                      }
                      onChange={(event) =>
                        updateFeatureLabel(feature, event.target.value)
                      }
                      placeholder={getDefaultFeatureLabel(feature, index)}
                    />

                    <div className="mt-1 text-xs text-slate-500">
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
                      onChange={(event) =>
                        updateFeatureStyle(feature, {
                          color: event.target.value,
                        })
                      }
                      className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

                  {isZone(feature) && (
                    <label className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2">
                      <span className="text-slate-600">Fond</span>
                      <input
                        type="color"
                        value={getFeatureFillColor(feature)}
                        onChange={(event) =>
                          updateFeatureStyle(feature, {
                            fillColor: event.target.value,
                          })
                        }
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
                      onChange={(event) =>
                        updateFeatureStyle(feature, {
                          opacity: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>

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
                        onChange={(event) =>
                          updateFeatureStyle(feature, {
                            weight: Number(event.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </label>
                  )}

                  {isZone(feature) && (
                    <label className="col-span-2 rounded-md bg-white px-2 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-slate-600">
                          Opacité du fond
                        </span>
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
                        onChange={(event) =>
                          updateFeatureStyle(feature, {
                            fillOpacity: Number(event.target.value),
                          })
                        }
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