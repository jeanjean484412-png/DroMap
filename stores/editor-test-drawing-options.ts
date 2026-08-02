import { create } from "zustand";

import type {
  DroMapFeature,
  DroMapFeatureStyle,
  DroMapMarkerBuiltinSymbol,
  DroMapZoneHatchingStyle,
  DroMapZoneShapeKind,
  DroMapMarkerSymbol,
} from "@/lib/dromap/feature";

type MarkerStylePreset = {
  color: string;
  opacity: number;
  markerSize: number;
  weight: number;
  markerFilled: boolean;
};

type LineStylePreset = {
  color: string;
  opacity: number;
  weight: number;
  dashStyle: "solid" | "dashed" | "dotted";
  arrowStart: boolean;
  arrowEnd: boolean;
  freehandSmoothing: number;
};

type ZoneStylePreset = {
  color: string;
  opacity: number;
  weight: number;
  fillColor: string;
  fillOpacity: number;
  dashStyle: "solid" | "dashed" | "dotted";
  zoneStrokeEnabled: boolean;
  zoneFillEnabled: boolean;
  zoneHatchingStyle: DroMapZoneHatchingStyle;
  zoneHatchingColor: string;
  zoneHatchingWeight: number;
  zoneHatchingSpacing: number;
  zoneDotsEnabled: boolean;
  zoneDotsColor: string;
  zoneDotsRadius: number;
  zoneDotsSpacing: number;
  zoneShapeKind: DroMapZoneShapeKind;
  zoneShapeWidth: number;
  zoneShapeHeight: number;
  zoneShapeRotation: number;
  freehandSmoothing: number;
};

type TextStylePreset = {
  color: string;
  opacity: number;
  fontSize: number;
  textBold: boolean;
  textItalic: boolean;
  textRotation: number;
  textBackgroundEnabled: boolean;
  textBackgroundColor: string;
  textBackgroundOpacity: number;
  textBorderEnabled: boolean;
  textBorderColor: string;
  textBorderWidth: number;
  textOutlineEnabled: boolean;
  textOutlineColor: string;
  textOutlineWidth: number;
};

type EditorTestDrawingOptionsState = {
  markerStyle: MarkerStylePreset;
  markerSymbol: DroMapMarkerSymbol;
  lineStyle: LineStylePreset;
  zoneStyle: ZoneStylePreset;
  textStyle: TextStylePreset;

  updateMarkerStyle: (style: Partial<MarkerStylePreset>) => void;
  setMarkerBuiltinSymbol: (symbolId: DroMapMarkerBuiltinSymbol) => void;
  setMarkerSymbol: (symbol: DroMapMarkerSymbol) => void;
  updateLineStyle: (style: Partial<LineStylePreset>) => void;
  updateZoneStyle: (style: Partial<ZoneStylePreset>) => void;
  updateTextStyle: (style: Partial<TextStylePreset>) => void;
};

export const useEditorTestDrawingOptionsStore =
  create<EditorTestDrawingOptionsState>((set) => ({
    markerStyle: {
      color: "#000000",
      opacity: 1,
      markerSize: 22,
      weight: 7,
      markerFilled: true,
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
      freehandSmoothing: 45,
    },

    zoneStyle: {
      color: "#111827",
      opacity: 1,
      weight: 3,
      fillColor: "#22c55e",
      fillOpacity: 0.25,
      dashStyle: "solid",
      zoneStrokeEnabled: true,
      zoneFillEnabled: false,
      zoneHatchingStyle: "none",
      zoneHatchingColor: "#111827",
      zoneHatchingWeight: 2,
      zoneHatchingSpacing: 14,
      zoneDotsEnabled: false,
      zoneDotsColor: "#111827",
      zoneDotsRadius: 2,
      zoneDotsSpacing: 14,
      zoneShapeKind: "rectangle",
      zoneShapeWidth: 180,
      zoneShapeHeight: 110,
      zoneShapeRotation: 0,
      freehandSmoothing: 45,
    },

    textStyle: {
      color: "#111827",
      opacity: 1,
      fontSize: 22,
      textBold: false,
      textItalic: false,
      textRotation: 0,
      textBackgroundEnabled: false,
      textBackgroundColor: "#ffffff",
      textBackgroundOpacity: 0.85,
      textBorderEnabled: false,
      textBorderColor: "#111827",
      textBorderWidth: 2,
      textOutlineEnabled: true,
      textOutlineColor: "#ffffff",
      textOutlineWidth: 1.5,
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

    setMarkerSymbol: (symbol) =>
      set({
        markerSymbol: symbol,
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
    const presetStyle: DroMapFeatureStyle = {
      color: state.lineStyle.color,
      opacity: state.lineStyle.opacity,
      weight: state.lineStyle.weight,
      dashStyle: state.lineStyle.dashStyle,
      arrowStart: state.lineStyle.arrowStart,
      arrowEnd: state.lineStyle.arrowEnd,
      ...(feature.properties.lineVariant === "freehand"
        ? { freehandSmoothing: state.lineStyle.freehandSmoothing }
        : {}),
    };

    return {
      ...feature,
      properties: {
        ...feature.properties,
        style: mergeStyle(feature.properties.style, presetStyle),
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