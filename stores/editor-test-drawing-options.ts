import { create } from "zustand";

import type {
  DroMapFeature,
  DroMapFeatureStyle,
  DroMapMarkerBuiltinSymbol,
  DroMapMarkerSymbol,
} from "@/lib/dromap/feature";

type MarkerStylePreset = {
  color: string;
  opacity: number;
  markerSize: number;
};

type LineStylePreset = {
  color: string;
  opacity: number;
  weight: number;
  dashStyle: "solid" | "dashed" | "dotted";
  arrowStart: boolean;
  arrowEnd: boolean;
};

type ZoneStylePreset = {
  color: string;
  opacity: number;
  weight: number;
  fillColor: string;
  fillOpacity: number;
  dashStyle: "solid" | "dashed" | "dotted";
};

type TextStylePreset = {
  color: string;
  opacity: number;
  fontSize: number;
};

type EditorTestDrawingOptionsState = {
  markerStyle: MarkerStylePreset;
  markerSymbol: DroMapMarkerSymbol;
  lineStyle: LineStylePreset;
  zoneStyle: ZoneStylePreset;
  textStyle: TextStylePreset;

  updateMarkerStyle: (style: Partial<MarkerStylePreset>) => void;
  setMarkerBuiltinSymbol: (symbolId: DroMapMarkerBuiltinSymbol) => void;
  updateLineStyle: (style: Partial<LineStylePreset>) => void;
  updateZoneStyle: (style: Partial<ZoneStylePreset>) => void;
  updateTextStyle: (style: Partial<TextStylePreset>) => void;
};

export const useEditorTestDrawingOptionsStore =
  create<EditorTestDrawingOptionsState>((set) => ({
    markerStyle: {
      color: "#e63946",
      opacity: 1,
      markerSize: 22,
    },
    markerSymbol: {
      type: "builtin",
      id: "circle",
    },

    lineStyle: {
      color: "#111827",
      opacity: 1,
      weight: 4,
      dashStyle: "solid",
      arrowStart: false,
      arrowEnd: false,
    },

    zoneStyle: {
      color: "#111827",
      opacity: 1,
      weight: 3,
      fillColor: "#22c55e",
      fillOpacity: 0.25,
      dashStyle: "solid",
    },

    textStyle: {
      color: "#111827",
      opacity: 1,
      fontSize: 22,
    },

    updateMarkerStyle: (style) =>
      set((state) => ({
        markerStyle: {
          ...state.markerStyle,
          ...style,
        },
      })),

    setMarkerBuiltinSymbol: (symbolId) =>
      set({
        markerSymbol: {
          type: "builtin",
          id: symbolId,
        },
      }),

    updateLineStyle: (style) =>
      set((state) => ({
        lineStyle: {
          ...state.lineStyle,
          ...style,
        },
      })),

    updateZoneStyle: (style) =>
      set((state) => ({
        zoneStyle: {
          ...state.zoneStyle,
          ...style,
        },
      })),

    updateTextStyle: (style) =>
      set((state) => ({
        textStyle: {
          ...state.textStyle,
          ...style,
        },
      })),
  }));

function mergeStyle(
  currentStyle: DroMapFeatureStyle,
  presetStyle: DroMapFeatureStyle,
): DroMapFeatureStyle {
  return {
    ...currentStyle,
    ...presetStyle,
  };
}

export function applyDrawingPresetToFeature(
  feature: DroMapFeature,
): DroMapFeature {
  const state = useEditorTestDrawingOptionsStore.getState();
  const featureType = feature.properties.type;

  if (featureType === "marker") {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        symbol: state.markerSymbol,
        style: mergeStyle(feature.properties.style, state.markerStyle),
      },
    };
  }

  if (featureType === "line") {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: mergeStyle(feature.properties.style, state.lineStyle),
      },
    };
  }

  if (featureType === "zone") {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: mergeStyle(feature.properties.style, state.zoneStyle),
      },
    };
  }

  if (featureType === "text") {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: mergeStyle(feature.properties.style, state.textStyle),
      },
    };
  }

  return feature;
}