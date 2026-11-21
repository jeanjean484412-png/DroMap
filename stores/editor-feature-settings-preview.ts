import { create } from "zustand";
import { useMemo } from "react";
import type { DroMapFeature } from "@/lib/dromap/feature";
import type { DromapGeoJsonFeatureSettingsPatch } from "@/stores/editor-geojson-layers";
import { useEditorFeaturesStore } from "@/stores/editor-features";

type FeatureDraft = { original: DroMapFeature; edited: DroMapFeature };
type FeatureDrafts = ReadonlyMap<string, FeatureDraft>;

export type GeoJsonSettingsPreview = {
  layerId: string;
  featureId: string | number;
  patch: DromapGeoJsonFeatureSettingsPatch;
};

export const useEditorFeatureSettingsPreview = create<{
  features: FeatureDrafts;
  geoJson: GeoJsonSettingsPreview | null;
}>()(() => ({ features: new Map(), geoJson: null }));

function mergeEditedFields<T extends object>(latest: T, original: T, edited: T): T {
  const result = { ...latest };
  const keys = new Set([...Object.keys(original), ...Object.keys(edited)] as (keyof T)[]);
  for (const key of keys) {
    if (original[key] === edited[key]) continue;
    if (Object.hasOwn(edited, key)) result[key] = edited[key];
    else delete result[key];
  }
  return result;
}

export function applyFeatureSettingsDraft(feature: DroMapFeature, draft: FeatureDraft | undefined): DroMapFeature {
  if (!draft) return feature;
  const { original, edited } = draft;
  if (feature === original) return edited;

  return {
    ...feature,
    geometry: feature.geometry === original.geometry ? edited.geometry : feature.geometry,
    properties: {
      ...mergeEditedFields(feature.properties, original.properties, edited.properties),
      style: mergeEditedFields(feature.properties.style ?? {}, original.properties.style ?? {}, edited.properties.style ?? {}),
    },
  };
}

export function getFeaturesWithSettingsPreview(features: DroMapFeature[], drafts: FeatureDrafts): DroMapFeature[] {
  return drafts.size === 0 ? features : features.map((feature) => applyFeatureSettingsDraft(feature, drafts.get(feature.id)));
}

export function useFeaturesWithSettingsPreview() {
  const features = useEditorFeaturesStore((state) => state.features);
  const drafts = useEditorFeatureSettingsPreview((state) => state.features);
  return useMemo(() => getFeaturesWithSettingsPreview(features, drafts), [features, drafts]);
}

export function stageFeatureSettings(
  features: DroMapFeature[],
  featureIds: string[],
  update: (feature: DroMapFeature) => DroMapFeature,
) {
  const targets = new Set(featureIds);
  useEditorFeatureSettingsPreview.setState((state) => {
    const drafts = new Map(state.features);
    let changed = false;
    for (const feature of features) {
      if (!targets.has(feature.id)) continue;
      const current = applyFeatureSettingsDraft(feature, drafts.get(feature.id));
      const edited = update(current);
      if (edited === current) continue;
      const { layerRenderOrder: _layerRenderOrder, ...properties } = edited.properties;
      drafts.set(feature.id, { original: feature, edited: { ...edited, properties } });
      changed = true;
    }
    return changed ? { features: drafts } : state;
  });
}
