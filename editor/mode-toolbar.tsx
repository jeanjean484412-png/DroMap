"use client";

import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { DromapContactDialog } from "@/components/dromap-product/contact-dialog";
import { EDITOR_MODE_LABELS } from "@/lib/dromap/editor-mode";
import type {
  DroMapFeatureDashStyle,
  DroMapMarkerBuiltinSymbol,
  DroMapMarkerSymbol,
  DroMapZoneHatchingStyle,
  DroMapZoneShapeKind,
} from "@/lib/dromap/feature";
import { useEditorModeStore } from "@/stores/editor-mode";
import {
  type EditorActiveTool,
  useEditorToolStore,
} from "@/stores/editor-tool";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorBasemapStore } from "@/stores/editor-basemap";
import { useEditorDrawingOptionsStore } from "@/stores/editor-drawing-options";
import { useEditorToolShortcutsStore, type EditorToolShortcut as ToolShortcut } from "@/stores/editor-tool-shortcuts";
import { useEditorCustomMarkersStore } from "@/stores/editor-custom-markers";
import {
  getGeoJsonLayerLoadedDisplayData,
  useEditorGeoJsonLayersStore,
} from "@/stores/editor-geojson-layers";

import {
  DROMAP_DASH_STYLES,
  MAX_DASH_GAP,
  MAX_DASH_LENGTH,
  MIN_DASH_GAP,
  MIN_DASH_LENGTH,
  clampMarkerSizeForSymbol,
  getMarkerSizeLimitsForSymbol,
} from "./feature-style";
import {
  DROMAP_MARKER_SYMBOL_CATEGORIES,
  loadMarkerSymbolCatalog,
  markerSymbolNeedsCatalog,
  type DroMapMarkerSymbolOption,
  getMarkerSymbolHtml,
  getMarkerSymbolLabel,
  markerSymbolSupportsFill,
  markerSymbolSupportsStrokeWeight,
} from "./marker-symbol";
import { MAX_TEXT_BORDER_WIDTH, MIN_TEXT_BORDER_WIDTH } from "./text-rendering";
import { UndoRedoControls } from "./undo-redo-controls";
import { SaveLoadControls } from "./save-load-controls";
import {
  DROMAP_ZONE_HATCHING_STYLES,
  MAX_ZONE_DOTS_RADIUS,
  MAX_ZONE_DOTS_SPACING,
  MAX_ZONE_HATCHING_SPACING,
  MAX_ZONE_HATCHING_WEIGHT,
  MIN_ZONE_DOTS_RADIUS,
  MIN_ZONE_DOTS_SPACING,
  MIN_ZONE_HATCHING_SPACING,
  MIN_ZONE_HATCHING_WEIGHT,
} from "./zone-style";
import { DROMAP_QUICK_SHAPES } from "./quick-shape";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";
import { getEffectiveGeoJsonFeatureStyle } from "./geojson-layer-style";
import { ColorPicker } from "./color-picker";
import { useMarkerSymbolCatalog } from "./use-marker-symbol-catalog";
import { CustomMarkerLibrary } from "./custom-marker-library";
import motionStyles from "./tool-button-motion.module.css";
import controlStyles from "./settings-controls.module.css";
import {
  DROMAP_OPEN_BUILDINGS_IMPORT_EVENT,
  DROMAP_OPEN_ROUTES_IMPORT_EVENT,
} from "./import-launcher-events";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";

const MIN_TEXT_FONT_SIZE = 1;
const MAX_TEXT_FONT_SIZE = 72;
const TEXT_FONT_SIZE_OPTIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72,
] as const;
const MIN_MARKER_STROKE_WIDTH = 3;
const MAX_MARKER_STROKE_WIDTH = 13;
const DEFAULT_MARKER_STROKE_WIDTH = 7;

function isClosedVectorRing(value: unknown) {
  if (!Array.isArray(value) || value.length < 4) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return (
    Array.isArray(first) &&
    Array.isArray(last) &&
    typeof first[0] === "number" &&
    typeof first[1] === "number" &&
    typeof last[0] === "number" &&
    typeof last[1] === "number" &&
    Math.abs(first[0] - last[0]) < 1e-9 &&
    Math.abs(first[1] - last[1]) < 1e-9
  );
}

const DEFAULT_MARKER_STYLE = {
  color: "#000000",
  opacity: 1,
  markerSize: 22,
  weight: DEFAULT_MARKER_STROKE_WIDTH,
  markerFilled: true,
};

const DEFAULT_LINE_STYLE = {
  color: "#111827",
  opacity: 1,
  weight: 4,
  dashStyle: "solid" as DroMapFeatureDashStyle,
  dashLength: 12,
  dashGap: 8,
  arrowStart: false,
  arrowEnd: false,
  freehandSmoothing: 45,
};

const DEFAULT_ZONE_STYLE = {
  color: "#111827",
  opacity: 1,
  weight: 3,
  fillColor: "#22c55e",
  fillOpacity: 0.25,
  dashStyle: "solid" as DroMapFeatureDashStyle,
  dashLength: 12,
  dashGap: 8,
  zoneStrokeEnabled: true,
  zoneFillEnabled: false,
  zoneHatchingStyle: "none" as DroMapZoneHatchingStyle,
  zoneHatchingColor: "#111827",
  zoneHatchingWeight: 2,
  zoneHatchingSpacing: 14,
  zoneDotsEnabled: false,
  zoneDotsColor: "#111827",
  zoneDotsRadius: 2,
  zoneDotsSpacing: 14,
  zoneShapeWidth: 180,
  zoneShapeHeight: 110,
  zoneShapeRotation: 0,
  freehandSmoothing: 45,
};

const DEFAULT_TEXT_STYLE = {
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
};

type LineToolChoice = Extract<
  EditorActiveTool,
  "line" | "curved-line" | "freehand" | "trace-line"
>;
type ZoneToolChoice = Extract<
  EditorActiveTool,
  "zone" | "freehand-zone" | "fill-zone" | "shape"
>;
type MarkerSettingsStep = "symbols" | "style";
type PickerCategory = "marker" | "line" | "zone";

function shortcutKey(
  tool: ToolShortcut["tool"],
  symbol?: DroMapMarkerSymbol,
  shapeKind?: DroMapZoneShapeKind,
) {
  if (tool === "marker" && symbol) return `marker:${symbol.type}:${symbol.id}`;
  if (tool === "shape") return `shape:${shapeKind ?? "rectangle"}`;
  return tool;
}

function shortcutLabel(
  tool: ToolShortcut["tool"],
  symbol?: DroMapMarkerSymbol,
  shapeKind?: DroMapZoneShapeKind,
) {
  if (tool === "marker" && symbol) {
    return getMarkerSymbolLabel({ properties: { symbol } });
  }
  if (tool === "curved-line") return "Trait courbe";
  if (tool === "trace-line") return "Suivi de trait";
  return getActiveToolLabel(tool, shapeKind ?? "rectangle");
}

type ToolButtonRowProps = {
  label: string;
  displayLabel?: string;
  active?: boolean;
  icon: ReactNode;
  picker: PickerCategory | "text" | "imports";
  onClick: () => void;
};

function SettingsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

function MarkerPinGlyph() {
  return (
    <span className="relative grid h-7 w-7 place-items-center" aria-hidden="true">
      <span className={`${motionStyles.pinShadow} absolute bottom-[3px] h-[3px] w-3 rounded-full bg-current text-neutral-400`} />
      <span className={`${motionStyles.pin} relative origin-[50%_90%]`}>
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M12 3a6 6 0 0 0-6 6c0 4.2 4.7 9.2 5.5 10a.7.7 0 0 0 1 0c.8-.8 5.5-5.8 5.5-10a6 6 0 0 0-6-6Zm0 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
          />
        </svg>
      </span>
    </span>
  );
}

function ImportsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path className={motionStyles.importArrow} d="m21 21-7-7m0 5v-5h5" />
    </svg>
  );
}

function BuildingsGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M9 21v-6h6v6" />
      <path d="M8 10h.01M12 10h.01M16 10h.01" />
    </svg>
  );
}

function RoadGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3 5 21" />
      <path d="m16 3 3 18" />
      <path d="M12 5v3M12 11v3M12 17v2" />
    </svg>
  );
}

function CycleGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="m8 17 3-7h3l2 4" />
      <path d="m10 10-2-2" />
      <path d="M13 7h3" />
    </svg>
  );
}

function ClassicLineGlyph() {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className={motionStyles.outline} pathLength={1} d="M3 18 10 10l6 4 9-9" />
      <g className={motionStyles.vertices} fill="currentColor" stroke="none">
        <circle cx="3" cy="18" r="1.7" />
        <circle cx="10" cy="10" r="1.7" />
        <circle cx="16" cy="14" r="1.7" />
        <circle cx="25" cy="5" r="1.7" />
      </g>
    </svg>
  );
}

function FreehandLineGlyph() {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 17c4-10 7 4 11-4s6 5 11-5" />
      <path d="m20 19 4-4 2 2-4 4-3 1 1-3Z" fill="currentColor" />
    </svg>
  );
}

function TraceLineGlyph() {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 18c4-9 8-9 12-4s7 2 10-7" strokeDasharray="3 3" />
      <path d="m20 6 5 1-1 5" />
      <circle cx="3" cy="18" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PolygonGlyph() {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        className={`${motionStyles.outline} ${motionStyles.zoneFill}`}
        pathLength={1}
        d="m5 6 9-3 9 6-3 11H8L3 13Z"
        fill="currentColor"
        fillOpacity="0.18"
      />
      <g className={motionStyles.vertices} fill="currentColor" stroke="none">
        <circle cx="5" cy="6" r="1.5" />
        <circle cx="14" cy="3" r="1.5" />
        <circle cx="23" cy="9" r="1.5" />
        <circle cx="20" cy="20" r="1.5" />
        <circle cx="8" cy="20" r="1.5" />
        <circle cx="3" cy="13" r="1.5" />
      </g>
    </svg>
  );
}

function FreehandZoneGlyph() {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M4 13c0-5 5-9 10-8 4-3 10 1 9 6 4 5-1 10-6 9-5 3-13-1-13-7Z"
        fill="currentColor"
        fillOpacity="0.18"
      />
      <path d="m19 20 4-4 2 2-4 4-3 1 1-3Z" fill="currentColor" />
    </svg>
  );
}

function PaintBucketGlyph() {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 5 11 11-6 6a2 2 0 0 1-2.8 0L2.8 17.6a2 2 0 0 1 0-2.8L11 6.6" />
      <path d="M4.5 13h9" />
      <path
        d="M22 14.5c1.7 2 2.5 3.3 2.5 4.3a2.5 2.5 0 0 1-5 0c0-1 .8-2.3 2.5-4.3Z"
        fill="currentColor"
        fillOpacity="0.28"
      />
    </svg>
  );
}

function QuickShapeGlyph({ shapeKind }: { shapeKind: DroMapZoneShapeKind }) {
  return (
    <svg
      viewBox="0 0 28 24"
      className="h-6 w-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {shapeKind === "circle" ? (
        <circle cx="14" cy="12" r="8" fill="currentColor" fillOpacity="0.14" />
      ) : shapeKind === "ellipse" ? (
        <ellipse cx="14" cy="12" rx="10" ry="6.5" fill="currentColor" fillOpacity="0.14" />
      ) : (
        <rect x="5" y="5" width="18" height="14" rx="1.5" fill="currentColor" fillOpacity="0.14" />
      )}
    </svg>
  );
}

const LINE_TOOL_CHOICES: {
  value: LineToolChoice;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "line",
    label: "Trait classique",
    description: "Pose les points un par un, puis double-clique au point d’arrivée.",
    icon: <ClassicLineGlyph />,
  },
  {
    value: "curved-line",
    label: "Trait courbe",
    description: "Pose les deux extrémités, puis déplace les poignées pour courber le trait.",
    icon: <svg width="28" height="20" viewBox="0 0 28 20" fill="none"><path d="M2 17 Q14 -10 26 17" stroke="currentColor" strokeWidth="2" /><circle cx="14" cy="3.5" r="3" fill="currentColor" /></svg>,
  },
  {
    value: "freehand",
    label: "Dessin libre",
    description: "Maintiens le clic pour dessiner le trait, puis relâche pour le terminer.",
    icon: <FreehandLineGlyph />,
  },
  {
    value: "trace-line",
    label: "Suivi de trait",
    description: "Clique et glisse le long d’une frontière, d’un contour ou d’une route importée visible.",
    icon: <TraceLineGlyph />,
  },
];

const ZONE_TOOL_CHOICES: {
  value: Exclude<ZoneToolChoice, "shape">;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "zone",
    label: "Zone classique",
    description: "Pose les sommets, puis clique sur le premier point pour fermer la zone.",
    icon: <PolygonGlyph />,
  },
  {
    value: "freehand-zone",
    label: "Zone libre",
    description: "Dessine le contour en maintenant le clic, puis relâche pour fermer la zone.",
    icon: <FreehandZoneGlyph />,
  },
  {
    value: "fill-zone",
    label: "Remplissage",
    description: "Clique dans un territoire du fond vectoriel ou dans un polygone GeoJSON visible.",
    icon: <PaintBucketGlyph />,
  },
];

const DRAWING_TOOL_HELP: Partial<Record<EditorActiveTool, string>> = {
  line: "Clique sur la carte pour poser chaque point du trait. Double-clique au point d’arrivée pour terminer.",
  "curved-line": "Clique au départ puis à l’arrivée. Une fois le trait posé, déplace ses poignées pour le courber. Double-clique sur le trait pour ajouter une poignée.",
  freehand: "Maintiens le clic en déplaçant la souris, puis relâche pour terminer le trait. Augmente le lissage pour atténuer les tremblements.",
  "trace-line": "Commence près d’une ligne visible et maintiens le clic en la longeant, puis relâche pour terminer. Tu peux suivre les frontières d’un fond blanc vectoriel, les routes importées et les lignes ou contours des calques GeoJSON visibles.",
  zone: "Clique pour poser les sommets de la zone. Quand le contour est prêt, clique sur le premier point pour fermer le polygone.",
  "freehand-zone": "Maintiens le clic en dessinant le contour, puis relâche pour fermer la zone. Augmente le lissage pour atténuer les tremblements du contour.",
  "fill-zone": "Clique à l’intérieur d’un territoire du fond vectoriel ou d’un polygone GeoJSON visible. DroMap reprend sa forme et applique les réglages ci-dessus. Garde au moins le fond ou le contour activé.",
  shape: "Clique pour poser le premier point, puis clique à l’opposé pour dimensionner la forme. Après la pose, sélectionne-la pour ajuster sa taille avec les poignées bleues.",
};

function DrawingLibraryOption({
  label,
  icon,
  description,
  unavailableReason,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  description: string;
  unavailableReason?: string;
  onClick: () => void;
}) {
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className={motionStyles.toolChoice}
        aria-describedby={descriptionId}
        disabled={Boolean(unavailableReason)}
        onClick={onClick}
      >
        {icon}
        <span>{label}</span>
      </button>
      <p id={descriptionId} className={motionStyles.toolDescription}>
        {unavailableReason ?? description}
      </p>
    </>
  );
}

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function normalizeMarkerSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type MarkerSymbolOption = DroMapMarkerSymbolOption;
const EMPTY_MARKER_OPTIONS: MarkerSymbolOption[] = [];

type MarkerSymbolSearchGroup = {
  category: (typeof DROMAP_MARKER_SYMBOL_CATEGORIES)[number];
  options: MarkerSymbolOption[];
};

const MARKER_SEARCH_SYNONYMS: Record<string, string[]> = {
  aeroport: ["avion", "plane", "airport", "piste", "transport aerien"],
  aerien: ["avion", "plane", "airport", "helicoptere", "drone"],
  avion: ["plane", "airport", "aeroport", "vol"],
  armee: ["militaire", "guerre", "conflit", "soldat", "battle", "tank", "defense"],
  autoroute: ["route", "road", "traffic", "voiture", "transport"],
  bataille: ["guerre", "militaire", "conflit", "target", "sword", "shield"],
  batiment: ["building", "maison", "ville", "habitat", "urbain"],
  catastrophe: ["risque", "danger", "alerte", "urgence", "crise"],
  centrale: ["energie", "electricite", "power", "factory", "bolt"],
  charbon: ["energie", "mine", "industrie", "ressource"],
  climat: ["meteo", "nuage", "cloud", "soleil", "pluie", "temperature", "environnement"],
  colonie: ["histoire", "empire", "territoire", "geopolitique", "drapeau"],
  commerce: ["marche", "shop", "shopping", "store", "economie", "trade"],
  conflit: ["guerre", "militaire", "armee", "bataille", "front", "danger"],
  danger: ["risque", "alerte", "warning", "urgent", "crise"],
  deplacement: ["transport", "mobilite", "flux", "route", "arrows", "migration"],
  deces: ["mort", "mortalite", "death", "skull", "victime"],
  economie: ["commerce", "industrie", "ressource", "argent", "finance", "production", "chart"],
  ecole: ["education", "school", "livre", "societe"],
  energie: ["electricite", "bolt", "battery", "plug", "nucleaire", "solaire", "eolien", "petrole", "gaz"],
  eolien: ["wind", "windmill", "turbine", "energie"],
  etat: ["pouvoir", "frontiere", "territoire", "drapeau", "geopolitique"],
  usine: ["industrie", "factory", "production", "economie"],
  finance: ["argent", "monnaie", "banque", "cash", "currency", "economie"],
  fleuve: ["riviere", "water", "eau", "droplet", "environnement"],
  foret: ["tree", "trees", "leaf", "environment", "nature"],
  frontiere: ["border", "limite", "territoire", "geopolitique", "etat"],
  gaz: ["energie", "flame", "petrole", "ressource"],
  guerre: ["militaire", "armee", "conflit", "bataille", "front", "danger"],
  hopital: ["sante", "hospital", "medical", "urgence"],
  incendie: ["feu", "flame", "fire", "pompiers", "risque"],
  industrie: ["usine", "factory", "production", "economie", "ressource"],
  inondation: ["eau", "flood", "waves", "pluie", "risque"],
  littoral: ["mer", "beach", "coast", "port", "navire"],
  logistique: ["transport", "truck", "container", "warehouse", "route", "port"],
  maritime: ["mer", "port", "ship", "boat", "navire", "transport"],
  migration: ["population", "deplacement", "flux", "users", "arrows"],
  militaire: ["armee", "guerre", "conflit", "bataille", "defense"],
  mine: ["extraction", "ressource", "industrie", "shovel", "pick"],
  mondialisation: ["monde", "world", "globe", "commerce", "flux", "transport", "echange"],
  montagne: ["relief", "mountain", "hill", "environnement"],
  mort: ["mortalite", "deces", "death", "skull", "victime"],
  mortalite: ["mort", "deces", "death", "skull", "victime"],
  nucleaire: ["atom", "energie", "centrale", "electricite"],
  petrole: ["oil", "barrel", "gaz", "energie", "ressource"],
  port: ["maritime", "ship", "boat", "anchor", "container", "transport"],
  population: ["habitants", "users", "societe", "ville", "migration"],
  religion: ["eglise", "church", "mosquee", "temple", "pray", "cross"],
  ressource: ["energie", "eau", "mine", "agriculture", "industrie", "economie"],
  risque: ["danger", "alerte", "catastrophe", "crise", "urgence"],
  route: ["road", "autoroute", "transport", "traffic", "itineraire"],
  sante: ["hopital", "medical", "hospital", "stethoscope", "urgence"],
  seisme: ["tremblement", "earthquake", "risque", "danger"],
  solaire: ["sun", "energie", "electricite"],
  transport: ["route", "train", "avion", "port", "flux", "mobilite"],
  urbain: ["ville", "building", "habitat", "urbanisation"],
  urbanisation: ["ville", "urbain", "building", "habitat"],
  ville: ["city", "building", "habitat", "urbain", "peuplement"],
};

// Vocabulaire volontairement proche des mots qu’un utilisateur non spécialiste
// peut taper dans la recherche. Il complète les mots-clés techniques des icônes.
const ADDITIONAL_MARKER_SEARCH_SYNONYMS: Record<string, string[]> = {
  agriculture: ["ferme", "champ", "culture", "tracteur", "food", "wheat"],
  ambulance: ["sante", "hopital", "urgence", "medical"],
  banque: ["finance", "argent", "economie", "bank", "currency"],
  barrage: ["eau", "energie", "hydro", "dam", "electricite"],
  base: ["militaire", "camp", "defense", "army", "fort"],
  bateau: ["navire", "ship", "port", "maritime", "transport"],
  bombe: ["explosion", "guerre", "militaire", "danger", "conflit"],
  bus: ["transport", "arret", "station", "route", "mobilite"],
  capitale: ["ville", "city", "etat", "gouvernement", "pouvoir"],
  char: ["tank", "militaire", "armee", "guerre", "vehicule"],
  douane: ["frontiere", "border", "poste", "controle", "etat"],
  drapeau: ["flag", "pays", "etat", "geopolitique", "frontiere"],
  eau: ["water", "fleuve", "riviere", "lac", "barrage", "ressource"],
  eglise: ["religion", "church", "culte", "societe"],
  election: ["vote", "politique", "etat", "gouvernement", "societe"],
  elevage: ["agriculture", "ferme", "animal", "food", "rural"],
  euro: ["monnaie", "argent", "finance", "economie", "currency"],
  ferme: ["agriculture", "champ", "rural", "food", "tracteur"],
  gare: ["train", "rail", "station", "transport", "chemin de fer"],
  gouvernement: ["etat", "politique", "pouvoir", "institution", "capitale"],
  helicoptere: ["aerien", "avion", "transport", "militaire", "urgence"],
  lac: ["eau", "water", "environnement", "ressource"],
  metro: ["transport", "train", "station", "urbain", "mobilite"],
  missile: ["militaire", "guerre", "arme", "rocket", "conflit"],
  monument: ["histoire", "patrimoine", "tourisme", "building", "culture"],
  mosquee: ["religion", "culte", "societe", "culture"],
  navire: ["bateau", "ship", "port", "maritime", "transport"],
  parlement: ["politique", "etat", "gouvernement", "institution"],
  pont: ["bridge", "route", "transport", "infrastructure"],
  rail: ["train", "gare", "transport", "chemin de fer"],
  riviere: ["fleuve", "eau", "water", "ressource", "environnement"],
  soldat: ["militaire", "armee", "guerre", "defense", "army"],
  station: ["gare", "metro", "bus", "train", "transport"],
  tempete: ["meteo", "risque", "danger", "vent", "storm"],
  train: ["gare", "rail", "transport", "chemin de fer", "station"],
  tram: ["transport", "rail", "station", "urbain", "mobilite"],
  tunnel: ["route", "rail", "transport", "infrastructure"],
  universite: ["education", "ecole", "school", "societe"],
  volcan: ["risque", "montagne", "eruption", "danger", "environnement"],
  voiture: ["route", "transport", "traffic", "mobilite", "car"],
};

const POPULAR_MARKER_SYMBOL_IDS = new Set([
  "city",
  "capital",
  "village",
  "port",
  "airport",
  "train-station",
  "road",
  "industry",
  "market",
  "bank",
  "power-plant",
  "nuclear",
  "solar",
  "wind-power",
  "water-resource",
  "forest",
  "mountain",
  "border-post",
  "flag",
  "battle",
  "army",
  "fort",
  "school",
  "hospital",
  "religion",
  "warning",
  "fire",
  "flood",
  "circle",
  "square",
  "diamond",
  "triangle",
  "star",
  "navigation",
]);

const MARKER_SEARCH_STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "d",
  "de",
  "des",
  "du",
  "en",
  "et",
  "la",
  "le",
  "les",
  "l",
  "pour",
  "sur",
]);

type MarkerSearchWordGroup = {
  primary: string[];
  synonyms: string[];
};

function getMarkerSearchWords(normalizedQuery: string): MarkerSearchWordGroup[] {
  const rawWords = normalizedQuery.split(/\s+/).filter(Boolean);

  return rawWords.map((word) => {
    const primary = new Set([word]);

    // Tolère les pluriels usuels : « gares », « ports », « villes »…
    if (word.length > 4 && word.endsWith("s")) primary.add(word.slice(0, -1));
    if (word.length > 5 && word.endsWith("es")) primary.add(word.slice(0, -2));
    if (word.length > 5 && word.endsWith("x")) primary.add(word.slice(0, -1));

    const synonyms = new Set<string>();
    const synonymPhrases = [
      ...(MARKER_SEARCH_SYNONYMS[word] ?? []),
      ...(ADDITIONAL_MARKER_SEARCH_SYNONYMS[word] ?? []),
    ];

    for (const synonym of synonymPhrases) {
      for (const synonymWord of normalizeMarkerSearchText(synonym)
        .split(/\s+/)
        .filter(Boolean)) {
        // Ne jamais transformer les mots de liaison d'une expression telle que
        // « chemin de fer » en critères de recherche autonomes : « de » faisait
        // auparavant remonter une grande partie du catalogue sans rapport.
        if (
          synonymWord.length < 3 ||
          MARKER_SEARCH_STOP_WORDS.has(synonymWord) ||
          primary.has(synonymWord)
        ) {
          continue;
        }
        synonyms.add(synonymWord);
      }
    }

    return {
      primary: Array.from(primary),
      synonyms: Array.from(synonyms),
    };
  });
}

function levenshteinDistance(a: string, b: string, maxDistance = 2) {
  if (Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let lastDiagonal = previous[0];
    previous[0] = i;
    let rowMin = previous[0];

    for (let j = 1; j <= b.length; j += 1) {
      const oldDiagonal = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        lastDiagonal + cost,
      );
      lastDiagonal = oldDiagonal;
      rowMin = Math.min(rowMin, previous[j]);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }
  }

  return previous[b.length];
}

function fuzzyWordMatches(word: string, token: string) {
  if (word.length < 4 || token.length < 4) {
    return false;
  }

  if (token.includes(word) || word.includes(token)) {
    return true;
  }

  const longest = Math.max(word.length, token.length);

  // Sur les mots courts, une seule lettre différente produit trop de faux
  // positifs (ex. « mort » ~ « sort »). On garde la tolérance aux petites
  // fautes uniquement lorsque le début du mot reste cohérent.
  if (longest <= 5 && word[0] !== token[0]) {
    return false;
  }

  const maxDistance = longest >= 10 ? 3 : longest >= 6 ? 2 : 1;

  return levenshteinDistance(word, token, maxDistance) <= maxDistance;
}

function getMarkerSearchHaystack(
  option: MarkerSymbolOption,
  categoryLabel: string,
) {
  const normalizedLabel = normalizeMarkerSearchText(option.label);
  const normalizedCategory = normalizeMarkerSearchText(categoryLabel);
  const normalizedSourceIcon = normalizeMarkerSearchText(option.sourceIcon);
  const normalizedId = normalizeMarkerSearchText(option.id);
  const normalizedKeywords = normalizeMarkerSearchText(option.keywords.join(" "));

  const tokenize = (value: string) =>
    value.split(/[\s-]+/).filter((token) => token.length > 0);

  return {
    normalizedLabel,
    normalizedCategory,
    normalizedSourceIcon,
    normalizedId,
    normalizedKeywords,
    labelTokens: tokenize(normalizedLabel),
    categoryTokens: tokenize(normalizedCategory),
    sourceTokens: tokenize(`${normalizedSourceIcon} ${normalizedId}`),
    keywordTokens: tokenize(normalizedKeywords),
  };
}

function directSearchWordMatches(
  normalizedText: string,
  tokens: string[],
  word: string,
) {
  if (!word) return false;

  // Pour les recherches très courtes, éviter les sous-chaînes arbitraires
  // (« or » dans « transport »). Un début de mot reste néanmoins utile pour
  // « tri » -> « triangle ».
  if (word.length <= 3) {
    return tokens.some((token) => token === word || token.startsWith(word));
  }

  return normalizedText.includes(word);
}

type MarkerSymbolSearchScore = {
  score: number;
  primaryDirectGroupCount: number;
  semanticGroupCount: number;
  fuzzyGroupCount: number;
};

function markerSymbolSearchScore(
  option: MarkerSymbolOption,
  categoryLabel: string,
  normalizedQuery: string,
): MarkerSymbolSearchScore | null {
  if (!normalizedQuery) {
    return {
      score: POPULAR_MARKER_SYMBOL_IDS.has(option.id) ? 20 : 1,
      primaryDirectGroupCount: 0,
      semanticGroupCount: 0,
      fuzzyGroupCount: 0,
    };
  }

  const haystack = getMarkerSearchHaystack(option, categoryLabel);
  const queryGroups = getMarkerSearchWords(normalizedQuery);
  let score = 0;
  let primaryDirectGroupCount = 0;
  let semanticGroupCount = 0;
  let fuzzyGroupCount = 0;

  for (const group of queryGroups) {
    let primaryScore = 0;

    for (const word of group.primary) {
      if (haystack.normalizedLabel === word) {
        primaryScore = Math.max(primaryScore, 320);
      } else if (haystack.labelTokens.includes(word)) {
        primaryScore = Math.max(primaryScore, 250);
      } else if (haystack.normalizedLabel.startsWith(word)) {
        primaryScore = Math.max(primaryScore, 210);
      } else if (
        directSearchWordMatches(haystack.normalizedLabel, haystack.labelTokens, word)
      ) {
        primaryScore = Math.max(primaryScore, 170);
      }

      if (
        directSearchWordMatches(
          haystack.normalizedKeywords,
          haystack.keywordTokens,
          word,
        )
      ) {
        primaryScore = Math.max(primaryScore, 125);
      }

      if (
        directSearchWordMatches(
          `${haystack.normalizedSourceIcon} ${haystack.normalizedId}`,
          haystack.sourceTokens,
          word,
        )
      ) {
        primaryScore = Math.max(primaryScore, 90);
      }

      if (
        directSearchWordMatches(
          haystack.normalizedCategory,
          haystack.categoryTokens,
          word,
        )
      ) {
        primaryScore = Math.max(primaryScore, 55);
      }
    }

    if (primaryScore > 0) {
      primaryDirectGroupCount += 1;
      score += primaryScore;
      continue;
    }

    // Les synonymes servent de second niveau de recherche. Ils sont comparés
    // aux noms et identifiants des pictogrammes, mais pas aux catégories ou aux
    // mots-clés génériques afin d'éviter qu'un mot comme « transport » fasse
    // remonter toute une rubrique lorsqu'on cherche simplement « métro ».
    let semanticScore = 0;
    for (const synonym of group.synonyms) {
      if (haystack.normalizedLabel === synonym) {
        semanticScore = Math.max(semanticScore, 105);
      } else if (haystack.labelTokens.includes(synonym)) {
        semanticScore = Math.max(semanticScore, 90);
      } else if (haystack.normalizedLabel.startsWith(synonym)) {
        semanticScore = Math.max(semanticScore, 80);
      } else if (
        directSearchWordMatches(
          haystack.normalizedLabel,
          haystack.labelTokens,
          synonym,
        )
      ) {
        semanticScore = Math.max(semanticScore, 70);
      }

      if (
        directSearchWordMatches(
          `${haystack.normalizedSourceIcon} ${haystack.normalizedId}`,
          haystack.sourceTokens,
          synonym,
        )
      ) {
        semanticScore = Math.max(semanticScore, 60);
      }
    }

    if (semanticScore > 0) {
      semanticGroupCount += 1;
      score += semanticScore;
      continue;
    }

    let fuzzyScore = 0;
    for (const word of group.primary) {
      if (haystack.labelTokens.some((token) => fuzzyWordMatches(word, token))) {
        fuzzyScore = Math.max(fuzzyScore, 45 + Math.min(word.length, 10));
      } else if (
        haystack.sourceTokens.some((token) => fuzzyWordMatches(word, token))
      ) {
        fuzzyScore = Math.max(fuzzyScore, 32 + Math.min(word.length, 10));
      }
    }

    if (fuzzyScore > 0) {
      fuzzyGroupCount += 1;
      score += fuzzyScore;
      continue;
    }

    return null;
  }

  if (POPULAR_MARKER_SYMBOL_IDS.has(option.id)) score += 8;

  return {
    score,
    primaryDirectGroupCount,
    semanticGroupCount,
    fuzzyGroupCount,
  };
}

function getMarkerSymbolSearchGroups(options: MarkerSymbolOption[], normalizedQuery: string): {
  groups: MarkerSymbolSearchGroup[];
  count: number;
  fallback: boolean;
} {
  const queryGroupCount = normalizedQuery
    ? getMarkerSearchWords(normalizedQuery).length
    : 0;

  const scored = options.map((option, index) => {
    const category =
      DROMAP_MARKER_SYMBOL_CATEGORIES.find(
        (candidate) => candidate.id === option.categoryId,
      ) ?? DROMAP_MARKER_SYMBOL_CATEGORIES[0];
    const match = markerSymbolSearchScore(option, category.label, normalizedQuery);

    return {
      option,
      category,
      index,
      score: match?.score ?? -1,
      primaryDirectGroupCount: match?.primaryDirectGroupCount ?? 0,
      semanticGroupCount: match?.semanticGroupCount ?? 0,
      fuzzyGroupCount: match?.fuzzyGroupCount ?? 0,
    };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const primaryRows =
    queryGroupCount > 0
      ? scored.filter(
          (item) => item.primaryDirectGroupCount === queryGroupCount,
        )
      : scored;

  const semanticRows =
    queryGroupCount > 0
      ? scored.filter(
          (item) =>
            item.fuzzyGroupCount === 0 &&
            item.primaryDirectGroupCount + item.semanticGroupCount ===
              queryGroupCount,
        )
      : [];

  // Priorité absolue aux mots réellement saisis. Les synonymes ne prennent le
  // relais que si aucun résultat direct complet n'existe, puis la tolérance
  // orthographique n'intervient qu'en dernier recours. Ainsi « mort » remonte
  // « Mortalité » et ne fait plus apparaître « Tri » via « sort ».
  const relevantScored =
    primaryRows.length > 0
      ? primaryRows
      : semanticRows.length > 0
        ? semanticRows
        : scored;

  const fallback = normalizedQuery.length > 0 && relevantScored.length === 0;
  const rows = fallback
    ? options.map((option, index) => {
        const category =
          DROMAP_MARKER_SYMBOL_CATEGORIES.find(
            (candidate) => candidate.id === option.categoryId,
          ) ?? DROMAP_MARKER_SYMBOL_CATEGORIES[0];

        return {
          option,
          category,
          index,
          score: POPULAR_MARKER_SYMBOL_IDS.has(option.id) ? 10 : 1,
          primaryDirectGroupCount: 0,
          semanticGroupCount: 0,
          fuzzyGroupCount: 0,
        };
      })
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 96)
    : relevantScored;

  const groups = DROMAP_MARKER_SYMBOL_CATEGORIES.map((category, categoryIndex) => {
    const categoryRows = rows.filter((item) => item.category.id === category.id);
    const options = categoryRows.map((item) => item.option);
    const bestScore = categoryRows.length > 0 ? categoryRows[0].score : -1;
    const bestGlobalIndex =
      categoryRows.length > 0 ? categoryRows[0].index : Number.MAX_SAFE_INTEGER;

    return {
      category,
      options,
      bestScore,
      bestGlobalIndex,
      categoryIndex,
    };
  })
    .filter((group) => group.options.length > 0)
    .sort((a, b) => {
      if (!normalizedQuery) {
        return a.categoryIndex - b.categoryIndex;
      }

      return (
        b.bestScore - a.bestScore ||
        a.bestGlobalIndex - b.bestGlobalIndex ||
        a.categoryIndex - b.categoryIndex
      );
    })
    .map(({ category, options }) => ({ category, options }));

  return {
    groups,
    count: rows.length,
    fallback,
  };
}

function getMarkerCategoryElementId(categoryId: string) {
  return `dromap-marker-category-${categoryId}`;
}

function getActiveToolLabel(
  tool: EditorActiveTool,
  shapeKind: DroMapZoneShapeKind,
) {
  if (tool === "select") return "Sélection";
  if (tool === "edit") return "Modifier";
  if (tool === "marker") return "Marqueur";
  if (tool === "line") return "Trait classique";
  if (tool === "freehand") return "Dessin libre";
  if (tool === "zone") return "Zone classique";
  if (tool === "freehand-zone") return "Zone libre";
  if (tool === "fill-zone") return "Remplissage";
  if (tool === "shape") {
    if (shapeKind === "circle") return "Cercle";
    if (shapeKind === "ellipse") return "Ellipse";
    return "Rectangle";
  }
  if (tool === "text") return "Texte";

  return "Outil";
}

function getSettingsTitle(openSettingsTool: EditorActiveTool) {
  if (openSettingsTool === "marker") return "Marqueur";
  if (
    openSettingsTool === "line" ||
    openSettingsTool === "curved-line" ||
    openSettingsTool === "freehand" ||
    openSettingsTool === "trace-line"
  ) {
    return "Traits";
  }
  if (
    openSettingsTool === "zone" ||
    openSettingsTool === "freehand-zone" ||
    openSettingsTool === "fill-zone" ||
    openSettingsTool === "shape"
  ) {
    return "Zones";
  }
  if (openSettingsTool === "text") return "Texte";

  return "Paramètres";
}

function getLineToolIcon(tool: LineToolChoice) {
  if (tool === "curved-line") return LINE_TOOL_CHOICES.find((choice) => choice.value === tool)!.icon;
  if (tool === "freehand") {
    return <FreehandLineGlyph />;
  }

  if (tool === "trace-line") {
    return <TraceLineGlyph />;
  }

  return <ClassicLineGlyph />;
}

function getZoneToolIcon(tool: ZoneToolChoice, shapeKind: DroMapZoneShapeKind) {
  if (tool === "freehand-zone") {
    return <FreehandZoneGlyph />;
  }

  if (tool === "fill-zone") {
    return <PaintBucketGlyph />;
  }

  if (tool === "shape") {
    return <QuickShapeGlyph shapeKind={shapeKind} />;
  }

  return <PolygonGlyph />;
}

function ToolButtonRow({
  label,
  displayLabel,
  active = false,
  icon,
  picker,
  onClick,
}: ToolButtonRowProps) {
  const tracksSelection = picker === "text" || picker === "imports";

  return (
    <div className="flex w-full justify-center">
      <button
        type="button"
        data-dromap-tool-control="true"
        data-dromap-tool-picker={picker}
        aria-pressed={tracksSelection ? active : undefined}
        onClick={onClick}
        className={[
          motionStyles.launcher,
          "flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 shadow-sm transition",
          tracksSelection && active
            ? "border-blue-700 bg-blue-600 text-white shadow-blue-200/70"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-blue-300 hover:bg-blue-50/60",
        ].join(" ")}
        title={label}
      >
        <span className="flex h-7 items-center justify-center">{icon}</span>
        <span className="max-w-full truncate text-[8px] font-extrabold uppercase leading-none tracking-wide">
          {displayLabel ?? label}
        </span>
      </button>
    </div>
  );
}

type MarkerSymbolPreviewProps = {
  symbol: DroMapMarkerSymbol;
  color: string;
  opacity?: number;
  size: number;
  weight?: number;
  markerFilled?: boolean;
};

function MarkerSymbolPreview({
  symbol,
  color,
  opacity = 1,
  size,
  weight,
  markerFilled = false,
}: MarkerSymbolPreviewProps) {
  const markerCatalog = useMarkerSymbolCatalog(markerSymbolNeedsCatalog(symbol));
  const html = useMemo(
    () =>
      getMarkerSymbolHtml(
        {
          properties: {
            style: {
              color,
              opacity,
              markerSize: size,
              weight,
              markerFilled,
            },
            symbol,
          },
        },
        { size },
      ),
    [color, markerFilled, opacity, size, symbol, weight, markerCatalog],
  );

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none inline-flex items-center justify-center leading-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function getGeoJsonToolCapabilities(
  geoJsonLayers: Parameters<typeof getGeoJsonLayerLoadedDisplayData>[0][],
  workspaceBounds: Parameters<typeof getGeoJsonLayerLoadedDisplayData>[1],
) {
  let canFill = false;
  let canTrace = false;

  for (const layer of geoJsonLayers) {
    if (layer.visible === false || layer.opacity <= 0) {
      continue;
    }

    const displayData = getGeoJsonLayerLoadedDisplayData(
      layer,
      workspaceBounds,
    );

    for (const feature of displayData.features) {
      const geometryType = feature.geometry.type;
      const isPolygon =
        geometryType === "Polygon" || geometryType === "MultiPolygon";
      const isTraceableGeometry =
        geometryType === "LineString" ||
        geometryType === "MultiLineString" ||
        isPolygon;

      const isClosedLine =
        geometryType === "LineString" &&
        isClosedVectorRing(feature.geometry.coordinates);
      const hasClosedMultiLine =
        geometryType === "MultiLineString" &&
        feature.geometry.coordinates.some((line) => isClosedVectorRing(line));
      if (isPolygon || isClosedLine || hasClosedMultiLine) {
        canFill = true;
      }

      if (isTraceableGeometry) {
        const style = getEffectiveGeoJsonFeatureStyle(layer, feature);
        if (style.strokeOpacity > 0 && style.zoneStrokeEnabled !== false) {
          canTrace = true;
        }
      }

      if (canFill && canTrace) {
        return { canFill, canTrace };
      }
    }
  }

  return { canFill, canTrace };
}

type ModeToolbarProps = {
  variant?: "floating" | "embedded";
  showUtilityControls?: boolean;
};

export default function ModeToolbar({
  variant = "floating",
  showUtilityControls = true,
}: ModeToolbarProps = {}) {
  const [openSettingsTool, setOpenSettingsTool] =
    useState<EditorActiveTool | null>(null);
  const [markerSettingsStep, setMarkerSettingsStep] =
    useState<MarkerSettingsStep>("symbols");
  const [markerSymbolSearch, setMarkerSymbolSearch] = useState("");
  const [markerThemesOpen, setMarkerThemesOpen] = useState(false);
  const [settingsPanelZIndex, setSettingsPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const [lineToolChoice, setLineToolChoice] = useState<LineToolChoice>("line");
  const [zoneToolChoice, setZoneToolChoice] = useState<ZoneToolChoice>("zone");
  const [pickerCategory, setPickerCategory] = useState<PickerCategory | null>(null);
  const shortcuts = useEditorToolShortcutsStore((state) => state.shortcuts);
  const setShortcuts = useEditorToolShortcutsStore((state) => state.setShortcuts);
  const [activeShortcutKey, setActiveShortcutKey] = useState<string | null>(null);
  const [importsOpen, setImportsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [importsPanelTop, setImportsPanelTop] = useState(8);
  const toolbarRootRef = useRef<HTMLDivElement | null>(null);
  const importsLauncherRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const markerLibraryScrollRef = useRef<HTMLDivElement | null>(null);
  const customMarkerListRef = useRef<HTMLDivElement | null>(null);
  const markerLibraryScroll = useRef({ panel: 0, symbols: 0, custom: 0 });

  const currentMode = useEditorModeStore((state) => state.currentMode);
  const pathname = usePathname();
  const { enabled: productRuntimeEnabled, capabilities } = useDromapProductRuntime();

  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const activeTool = useEditorToolStore((state) => state.activeTool);
  const setActiveTool = useEditorToolStore((state) => state.setActiveTool);
  const resetActiveTool = useEditorToolStore(
    (state) => state.resetActiveTool,
  );

  const markerStyle = useEditorDrawingOptionsStore(
    (state) => state.markerStyle,
  );
  const markerSymbol = useEditorDrawingOptionsStore(
    (state) => state.markerSymbol,
  );
  useEditorCustomMarkersStore((state) => state.customMarkers);
  const lineStyle = useEditorDrawingOptionsStore(
    (state) => state.lineStyle,
  );
  const zoneStyle = useEditorDrawingOptionsStore(
    (state) => state.zoneStyle,
  );
  const basemapId = useEditorBasemapStore((state) => state.basemapId);
  const activeBasemap = getDromapBasemapConfig(basemapId);
  const geoJsonLayers = useEditorGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const hasUsableBasemapBoundaries = Boolean(
    activeBasemap.boundaryOverlay?.layers.some(
      (layer) => layer.displayRole !== "country-neighbor-context",
    ),
  );
  const geoJsonToolCapabilities = useMemo(
    () => getGeoJsonToolCapabilities(geoJsonLayers, workspaceBounds),
    [geoJsonLayers, workspaceBounds],
  );
  const canUseFillToolOnCurrentBasemap =
    hasUsableBasemapBoundaries || geoJsonToolCapabilities.canFill;
  const canUseTraceToolOnCurrentBasemap =
    hasUsableBasemapBoundaries || geoJsonToolCapabilities.canTrace;
  const textStyle = useEditorDrawingOptionsStore(
    (state) => state.textStyle,
  );

  const updateMarkerStyle = useEditorDrawingOptionsStore(
    (state) => state.updateMarkerStyle,
  );
  const setMarkerBuiltinSymbol = useEditorDrawingOptionsStore(
    (state) => state.setMarkerBuiltinSymbol,
  );
  const setMarkerSymbol = useEditorDrawingOptionsStore(
    (state) => state.setMarkerSymbol,
  );
  const updateLineStyle = useEditorDrawingOptionsStore(
    (state) => state.updateLineStyle,
  );
  const updateZoneStyle = useEditorDrawingOptionsStore(
    (state) => state.updateZoneStyle,
  );
  const updateTextStyle = useEditorDrawingOptionsStore(
    (state) => state.updateTextStyle,
  );

  const selectedMarkerIsBuiltin = markerSymbol.type === "builtin";
  const markerSizeLimits = getMarkerSizeLimitsForSymbol(markerSymbol);
  const displayedMarkerSize = clampMarkerSizeForSymbol(
    markerStyle.markerSize,
    markerSymbol,
  );
  const selectedMarkerSymbolId: DroMapMarkerBuiltinSymbol =
    selectedMarkerIsBuiltin ? markerSymbol.id : "circle";
  const markerStrokeWeight = markerStyle.weight ?? DEFAULT_MARKER_STROKE_WIDTH;
  const selectedMarkerHasStroke =
    selectedMarkerIsBuiltin &&
    markerSymbolSupportsStrokeWeight(selectedMarkerSymbolId);
  const selectedMarkerCanBeFilled =
    selectedMarkerIsBuiltin && markerSymbolSupportsFill(selectedMarkerSymbolId);
  const markerFilledEnabled =
    selectedMarkerCanBeFilled && markerStyle.markerFilled === true;
  const zoneStrokeEnabled = zoneStyle.zoneStrokeEnabled !== false;
  const zoneFillEnabled = zoneStyle.zoneFillEnabled === true;

  const markerLibraryOpen = openSettingsTool === "marker" && markerSettingsStep === "symbols";
  const drawingLibraryOpen = pickerCategory === "line" || pickerCategory === "zone";
  const markerCatalog = useMarkerSymbolCatalog(markerLibraryOpen);
  const markerSearchResult = useMemo(
    () => getMarkerSymbolSearchGroups(
      markerLibraryOpen ? markerCatalog?.DROMAP_BUILTIN_MARKER_SYMBOLS ?? EMPTY_MARKER_OPTIONS : EMPTY_MARKER_OPTIONS,
      normalizeMarkerSearchText(markerSymbolSearch),
    ),
    [markerCatalog, markerLibraryOpen, markerSymbolSearch],
  );
  const markerSymbolGroups = markerSearchResult.groups;
  const markerSymbolCount = markerSearchResult.count;

  useLayoutEffect(() => {
    if (!markerLibraryOpen) {
      if (pickerCategory === "line" || pickerCategory === "zone") {
        settingsPanelRef.current?.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    const { panel, symbols, custom } = markerLibraryScroll.current;
    if (settingsPanelRef.current) settingsPanelRef.current.scrollTop = panel;
    if (markerLibraryScrollRef.current) markerLibraryScrollRef.current.scrollTop = symbols;
    if (customMarkerListRef.current) customMarkerListRef.current.scrollTop = custom;
  }, [markerLibraryOpen, pickerCategory]);

  const lineSettingsOpen =
    pickerCategory === null && (
      openSettingsTool === "line" ||
      openSettingsTool === "curved-line" ||
      openSettingsTool === "freehand" ||
      openSettingsTool === "trace-line"
    );
  const zoneSettingsOpen =
    pickerCategory === null && (
      openSettingsTool === "zone" ||
      openSettingsTool === "freehand-zone" ||
      openSettingsTool === "fill-zone" ||
      openSettingsTool === "shape"
    );

  const settingsPanelWidth =
    markerLibraryOpen
      ? "w-[calc(100vw-5rem)] sm:w-[30rem]"
      : drawingLibraryOpen
        ? "w-[calc(100vw-5rem)] sm:w-[26rem]"
        : "w-[calc(100vw-5rem)] sm:w-72";

  const drawingHelp = openSettingsTool ? DRAWING_TOOL_HELP[openSettingsTool] : null;

  const canResetCurrentSettings =
    openSettingsTool !== null &&
    pickerCategory === null &&
    (openSettingsTool !== "marker" || markerSettingsStep === "style");
  const settingsMotionClass = canResetCurrentSettings
    ? `${controlStyles.settings} ${controlStyles.beforePlacement}`
    : "";

  useEffect(() => {
    if (!activeShortcutKey) return;
    setShortcuts((current) => current.map((shortcut) => {
      if (shortcut.key !== activeShortcutKey || shortcut.tool !== activeTool) return shortcut;
      if (shortcut.tool === "marker" && shortcut.markerStyle !== markerStyle) return { ...shortcut, markerStyle };
      if (["line", "curved-line", "freehand", "trace-line"].includes(shortcut.tool) && shortcut.lineStyle !== lineStyle) return { ...shortcut, lineStyle };
      if (["zone", "freehand-zone", "fill-zone", "shape"].includes(shortcut.tool) && shortcut.zoneStyle !== zoneStyle) return { ...shortcut, zoneStyle };
      return shortcut;
    }));
  }, [activeShortcutKey, activeTool, lineStyle, markerStyle, setShortcuts, zoneStyle]);

  useEffect(() => {
    if (activeShortcutKey && shortcuts.find((shortcut) => shortcut.key === activeShortcutKey)?.tool !== activeTool) {
      setActiveShortcutKey(null);
    }
  }, [activeShortcutKey, activeTool, shortcuts]);

  useEffect(() => {
    if (currentMode !== "edit") {
      resetActiveTool();
      setOpenSettingsTool(null);
      setImportsOpen(false);
      setMarkerSettingsStep("symbols");
      setPickerCategory(null);
      setActiveShortcutKey(null);
    }
  }, [currentMode, resetActiveTool]);

  useEffect(() => {
    if (
      activeTool === "line" ||
      activeTool === "curved-line" ||
    activeTool === "freehand" ||
      activeTool === "trace-line"
    ) {
      setLineToolChoice(activeTool);
    }

    if (
      activeTool === "zone" ||
      activeTool === "freehand-zone" ||
      activeTool === "fill-zone" ||
      activeTool === "shape"
    ) {
      setZoneToolChoice(activeTool);
    }
  }, [activeTool]);

  useEffect(() => {
    if (lineToolChoice !== "trace-line" || canUseTraceToolOnCurrentBasemap) {
      return;
    }

    setLineToolChoice("line");
    if (activeTool === "trace-line") {
      resetActiveTool();
    }
    if (openSettingsTool === "trace-line") {
      setPickerCategory("line");
      setOpenSettingsTool("line");
    }
  }, [
    activeTool,
    canUseTraceToolOnCurrentBasemap,
    lineToolChoice,
    openSettingsTool,
    resetActiveTool,
  ]);

  useEffect(() => {
    if (zoneToolChoice !== "fill-zone") {
      return;
    }

    if (!canUseFillToolOnCurrentBasemap) {
      setZoneToolChoice("zone");
      if (activeTool === "fill-zone") {
        resetActiveTool();
      }
      if (openSettingsTool === "fill-zone") {
        setPickerCategory("zone");
        setOpenSettingsTool("zone");
      }
      return;
    }

    if (!zoneStrokeEnabled && !zoneFillEnabled) {
      updateZoneStyle({ zoneFillEnabled: true, zoneStrokeEnabled: false });
    }
  }, [
    activeTool,
    canUseFillToolOnCurrentBasemap,
    openSettingsTool,
    resetActiveTool,
    updateZoneStyle,
    zoneFillEnabled,
    zoneStrokeEnabled,
    zoneToolChoice,
  ]);

  useEffect(() => {
    if (!importsOpen) {
      return;
    }

    const closeImportsOnOutsidePointer = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (
        event.target.closest('[data-dromap-imports-panel="true"]') ||
        event.target.closest('[data-dromap-tour="tools"]')
      ) {
        return;
      }

      setImportsOpen(false);
    };

    document.addEventListener("mousedown", closeImportsOnOutsidePointer, true);
    return () => {
      document.removeEventListener(
        "mousedown",
        closeImportsOnOutsidePointer,
        true,
      );
    };
  }, [importsOpen]);

  function bringSettingsPanelToFront() {
    setImportsOpen(false);
    setSettingsPanelZIndex(bringFloatingPanelToFront());
  }

  function scrollMarkerSettingsToTop() {
    window.requestAnimationFrame(() => {
      settingsPanelRef.current?.scrollTo({ top: 0 });
    });
  }

  function updateZoneStrokeEnabled(nextValue: boolean) {
    if (zoneToolChoice === "fill-zone" && !nextValue && !zoneFillEnabled) {
      return;
    }

    updateZoneStyle({ zoneStrokeEnabled: nextValue });
  }

  function updateZoneFillEnabled(nextValue: boolean) {
    if (zoneToolChoice === "fill-zone" && !nextValue && !zoneStrokeEnabled) {
      return;
    }

    updateZoneStyle({ zoneFillEnabled: nextValue });
  }

  function rememberShortcut(
    tool: ToolShortcut["tool"],
    symbol?: DroMapMarkerSymbol,
    shapeKind?: DroMapZoneShapeKind,
  ) {
    const key = shortcutKey(tool, symbol, shapeKind);
    const existing = shortcuts.find((item) => item.key === key);
    if (existing?.markerStyle) updateMarkerStyle(existing.markerStyle);
    if (existing?.lineStyle) updateLineStyle(existing.lineStyle);
    if (existing?.zoneStyle) updateZoneStyle(existing.zoneStyle);
    const options = useEditorDrawingOptionsStore.getState();
    const lastUsed = Math.max(0, ...shortcuts.map((item) => item.lastUsed)) + 1;
    const shortcut: ToolShortcut = {
      key,
      tool,
      label: shortcutLabel(tool, symbol, shapeKind),
      lastUsed,
      symbol,
      shapeKind,
      markerStyle: tool === "marker" ? options.markerStyle : undefined,
      lineStyle: ["line", "curved-line", "freehand", "trace-line"].includes(tool) ? options.lineStyle : undefined,
      zoneStyle: ["zone", "freehand-zone", "fill-zone", "shape"].includes(tool) ? options.zoneStyle : undefined,
    };
    setShortcuts((current) => {
      const existingIndex = current.findIndex((item) => item.key === key);
      if (existingIndex >= 0) {
        return current.map((item, index) => index === existingIndex ? { ...item, lastUsed: shortcut.lastUsed } : item);
      }
      if (current.length < 4) return [...current, shortcut];
      const oldestIndex = current.reduce(
        (oldest, item, index) => item.lastUsed < current[oldest].lastUsed ? index : oldest,
        0,
      );
      return current.map((item, index) => index === oldestIndex ? shortcut : item);
    });
    setActiveShortcutKey(key);
    setPickerCategory(null);
  }

  function openPicker(category: PickerCategory) {
    resetActiveTool();
    setActiveShortcutKey(null);
    setPickerCategory(category);
    bringSettingsPanelToFront();
    setOpenSettingsTool(category);
    if (category === "marker") {
      void loadMarkerSymbolCatalog().catch(() => undefined);
      setMarkerSettingsStep("symbols");
    }
  }

  function activateShortcut(shortcut: ToolShortcut) {
    if (activeShortcutKey === shortcut.key && activeTool === shortcut.tool) {
      resetActiveTool();
      setActiveShortcutKey(null);
      setOpenSettingsTool(null);
      return;
    }
    if (shortcut.tool === "trace-line" && !canUseTraceToolOnCurrentBasemap) {
      openPicker("line");
      return;
    }
    if (shortcut.tool === "fill-zone" && !canUseFillToolOnCurrentBasemap) {
      openPicker("zone");
      return;
    }
    if (shortcut.tool === "marker" && shortcut.symbol) {
      setMarkerSymbol(shortcut.symbol);
      if (shortcut.markerStyle) updateMarkerStyle(shortcut.markerStyle);
      setMarkerSettingsStep("style");
    } else if (["line", "curved-line", "freehand", "trace-line"].includes(shortcut.tool)) {
      setLineToolChoice(shortcut.tool as LineToolChoice);
      if (shortcut.lineStyle) updateLineStyle(shortcut.lineStyle);
    } else if (["zone", "freehand-zone", "fill-zone", "shape"].includes(shortcut.tool)) {
      setZoneToolChoice(shortcut.tool as ZoneToolChoice);
      if (shortcut.zoneStyle) updateZoneStyle(shortcut.zoneStyle);
      if (shortcut.shapeKind) updateZoneStyle({ zoneShapeKind: shortcut.shapeKind });
    }
    setActiveTool(shortcut.tool);
    setActiveShortcutKey(shortcut.key);
    setShortcuts((current) => current.map((item) =>
      item.key === shortcut.key
        ? { ...item, lastUsed: Math.max(0, ...current.map((entry) => entry.lastUsed)) + 1 }
        : item,
    ));
    setPickerCategory(null);
    bringSettingsPanelToFront();
    setOpenSettingsTool(shortcut.tool);
  }

  function openShortcutSettings(shortcut: ToolShortcut) {
    if (activeShortcutKey !== shortcut.key || activeTool !== shortcut.tool) {
      activateShortcut(shortcut);
      return;
    }
    const isOpen = openSettingsTool === shortcut.tool &&
      pickerCategory === null &&
      (shortcut.tool !== "marker" || markerSettingsStep === "style");
    if (isOpen) {
      setOpenSettingsTool(null);
      return;
    }
    if (shortcut.tool === "marker") setMarkerSettingsStep("style");
    setPickerCategory(null);
    bringSettingsPanelToFront();
    setOpenSettingsTool(shortcut.tool);
  }

  function activateTextTool() {
    setActiveTool("text");
    setActiveShortcutKey(null);
    setPickerCategory(null);
    bringSettingsPanelToFront();
    setOpenSettingsTool("text");
  }

  function scrollToMarkerCategory(categoryId: string) {
    setMarkerSymbolSearch("");

    window.setTimeout(() => {
      document
        .getElementById(getMarkerCategoryElementId(categoryId))
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  function chooseLineTool(tool: LineToolChoice) {
    if (tool === "trace-line" && !canUseTraceToolOnCurrentBasemap) return;

    setLineToolChoice(tool);
    setActiveTool(tool);
    rememberShortcut(tool);
    bringSettingsPanelToFront();
    setOpenSettingsTool(tool);
  }

  function chooseZoneTool(tool: ZoneToolChoice, shapeKind?: DroMapZoneShapeKind) {
    if (tool === "fill-zone" && !canUseFillToolOnCurrentBasemap) return;

    if (tool === "fill-zone" && zoneToolChoice !== "fill-zone") {
      updateZoneStyle({
        zoneFillEnabled: true,
        zoneStrokeEnabled: false,
      });
    }
    if (shapeKind) updateZoneStyle({ zoneShapeKind: shapeKind });

    setZoneToolChoice(tool);
    setActiveTool(tool);
    rememberShortcut(tool, undefined, shapeKind);
    bringSettingsPanelToFront();
    setOpenSettingsTool(tool);
  }

  function toggleImportsPanel() {
    if (importsOpen) {
      setImportsOpen(false);
      return;
    }

    const rootRect = toolbarRootRef.current?.getBoundingClientRect();
    const launcherRect = importsLauncherRef.current?.getBoundingClientRect();

    if (rootRect && launcherRect) {
      setImportsPanelTop(Math.max(8, launcherRect.top - rootRect.top));
    }

    setOpenSettingsTool(null);
    setPickerCategory(null);
    setImportsOpen(true);
  }

  function openBuildingsImport() {
    setImportsOpen(false);
    window.dispatchEvent(new Event(DROMAP_OPEN_BUILDINGS_IMPORT_EVENT));
  }

  function openRoutesImport() {
    setImportsOpen(false);
    window.dispatchEvent(new Event(DROMAP_OPEN_ROUTES_IMPORT_EVENT));
  }

  function resetCurrentSettings() {
    if (openSettingsTool === "marker") {
      updateMarkerStyle(DEFAULT_MARKER_STYLE);
      return;
    }

    if (
    openSettingsTool === "line" ||
    openSettingsTool === "curved-line" ||
    openSettingsTool === "freehand" ||
    openSettingsTool === "trace-line"
  ) {
      updateLineStyle(DEFAULT_LINE_STYLE);
      return;
    }

    if (
      openSettingsTool === "zone" ||
      openSettingsTool === "freehand-zone" ||
      openSettingsTool === "fill-zone" ||
      openSettingsTool === "shape"
    ) {
      updateZoneStyle({
        ...DEFAULT_ZONE_STYLE,
        zoneShapeKind: zoneStyle.zoneShapeKind,
      });
      return;
    }

    if (openSettingsTool === "text") {
      updateTextStyle(DEFAULT_TEXT_STYLE);
    }
  }

  const embedded = variant === "embedded";

  return (
    <div
      ref={toolbarRootRef}
      data-dromap-tour="tools"
      data-embedded={embedded}
      className={
        embedded
          ? "pointer-events-none relative flex h-full min-h-0 w-20 shrink-0 items-start overflow-visible bg-white sm:w-24"
          : "pointer-events-none absolute left-4 top-4 flex max-h-[calc(100vh-2rem)] items-start gap-3"
      }
      style={{
        zIndex: embedded
          ? openSettingsTool || importsOpen
            ? 2200
            : 40
          : openSettingsTool
            ? settingsPanelZIndex
            : 1000,
      }}
      onMouseDownCapture={() => {
        if (openSettingsTool) {
          bringSettingsPanelToFront();
        }
      }}
    >
      <div
        className={
          embedded
            ? "pointer-events-auto flex h-full min-h-0 w-20 shrink-0 flex-col gap-2 overflow-y-auto border-r border-slate-200 bg-white p-1.5 sm:w-24 sm:p-2"
            : "pointer-events-auto flex max-h-[calc(100vh-2rem)] w-24 flex-col gap-2 overflow-y-auto rounded-2xl border border-black/10 bg-white/95 p-2 shadow-lg backdrop-blur"
        }
      >
        <div data-dromap-mode-label="true" className="rounded-xl bg-neutral-900 px-2 py-2 text-center text-[10px] font-semibold leading-tight text-white">
          {EDITOR_MODE_LABELS[currentMode]}
        </div>

        {currentMode === "edit" && workspaceBounds && shortcuts.length > 0 ? (
          <div
            data-dromap-tool-shortcuts="true"
            role="group"
            aria-label="Raccourcis d’outils"
            className="flex flex-col gap-1 border-b border-neutral-200 pb-2"
          >
            <span className="text-center text-[9px] font-bold uppercase tracking-wide text-neutral-500">Raccourcis</span>
            {Array.from({ length: 4 }, (_, index) => {
              const shortcut = shortcuts[index];
              if (!shortcut) {
                return <span key={index} aria-hidden="true" className="mx-auto h-12 w-16 rounded-xl border border-dashed border-neutral-200 bg-neutral-50" />;
              }
              const active = activeShortcutKey === shortcut.key && activeTool === shortcut.tool;
              const settingsOpen = active && openSettingsTool === shortcut.tool &&
                pickerCategory === null && (shortcut.tool !== "marker" || markerSettingsStep === "style");
              const icon = shortcut.tool === "marker" && shortcut.symbol
                ? <MarkerSymbolPreview
                    symbol={shortcut.symbol}
                    color={shortcut.markerStyle?.color ?? markerStyle.color}
                    size={21}
                    weight={shortcut.markerStyle?.weight ?? markerStrokeWeight}
                    markerFilled={shortcut.markerStyle?.markerFilled ?? false}
                  />
                : ["line", "curved-line", "freehand", "trace-line"].includes(shortcut.tool)
                  ? getLineToolIcon(shortcut.tool as LineToolChoice)
                  : ["zone", "freehand-zone", "fill-zone", "shape"].includes(shortcut.tool)
                    ? getZoneToolIcon(shortcut.tool as ZoneToolChoice, shortcut.shapeKind ?? "rectangle")
                    : null;
              return (
                <div key={shortcut.key} className="flex w-full items-center justify-center gap-1">
                  <button
                    type="button"
                    data-dromap-tool-control="true"
                    data-dromap-tool-shortcut={shortcut.key}
                    aria-label={`Raccourci ${shortcut.label}`}
                    aria-pressed={active}
                    title={shortcut.label}
                    onClick={() => activateShortcut(shortcut)}
                    className={`flex h-12 w-11 flex-col items-center justify-center rounded-xl border px-1 shadow-sm transition ${active ? "border-blue-700 bg-blue-600 text-white" : "border-neutral-200 bg-white text-neutral-800 hover:border-blue-300 hover:bg-blue-50"}`}
                  >
                    <span className="flex h-7 items-center justify-center">{icon}</span>
                    <span className="max-w-full truncate text-[8px] font-bold leading-none">{shortcut.label}</span>
                  </button>
                  <button
                    type="button"
                    data-dromap-tool-control="true"
                    data-dromap-tool-shortcut-settings={shortcut.key}
                    aria-label={`Paramètres de ${shortcut.label}`}
                    aria-expanded={settingsOpen}
                    onClick={() => openShortcutSettings(shortcut)}
                    className={`flex h-12 w-5 items-center justify-center rounded-xl border shadow-sm transition ${settingsOpen ? "border-blue-700 bg-blue-700 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-blue-300 hover:bg-blue-50"}`}
                  >
                    <SettingsGlyph />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        {currentMode === "workspace-select" ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-2 py-3 text-center text-[10px] leading-tight text-neutral-600">
            Trace la zone directement sur la carte.
          </div>
        ) : null}

        {currentMode === "edit" && workspaceBounds ? (
          <div
            className="flex flex-col gap-2"
            role="toolbar"
            aria-label="Outils d’édition DroMap"
          >
            <ToolButtonRow
              label="Marqueur"
              displayLabel="Marqueur"
              picker="marker"
              icon={<MarkerPinGlyph />}
              onClick={() => openPicker("marker")}
            />

            <ToolButtonRow
              label="Traits"
              displayLabel="Traits"
              picker="line"
              icon={<ClassicLineGlyph />}
              onClick={() => openPicker("line")}
            />

            <ToolButtonRow
              label="Zones"
              displayLabel="Zones"
              picker="zone"
              icon={<PolygonGlyph />}
              onClick={() => openPicker("zone")}
            />

            <ToolButtonRow
              label="Texte"
              displayLabel="Texte"
              picker="text"
              active={activeTool === "text"}
              icon={
                <span className="inline-flex font-mono text-sm tracking-normal" aria-hidden="true">
                  T<span className={motionStyles.textSuffix}>exte</span>
                </span>
              }
              onClick={activateTextTool}
            />

            {embedded ? (
              <div ref={importsLauncherRef} data-dromap-tour="imports-launcher">
                <ToolButtonRow
                  label={
                    productRuntimeEnabled && !capabilities.canImportBuildings
                      ? "Imports cartographiques — certains imports nécessitent un accès premium"
                      : "Imports cartographiques"
                  }
                  displayLabel="Imports"
                  active={importsOpen}
                  picker="imports"
                  icon={<ImportsGlyph />}
                  onClick={toggleImportsPanel}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {showUtilityControls ? (
          <>
            <div className="border-t border-neutral-200 pt-2">
              <div className="mb-2 rounded-xl bg-neutral-50 px-2 py-2 text-center text-[10px] leading-tight text-neutral-500">
                {currentMode === "edit"
                  ? activeTool === "select"
                    ? "Sélection / modification"
                    : getActiveToolLabel(activeTool, zoneStyle.zoneShapeKind)
                  : "Zone"}
              </div>

            </div>

            <div className="border-t border-neutral-200 pt-2">
              <UndoRedoControls />
            </div>

            <div className="border-t border-neutral-200 pt-2">
              <SaveLoadControls />
            </div>
          </>
        ) : null}
      </div>

      {embedded && importsOpen ? (
        <div
          data-dromap-imports-panel="true"
          data-dromap-tour="imports-panel"
          data-dromap-tool-settings-panel="true"
          className="pointer-events-auto absolute left-20 w-[calc(100vw-5rem)] overflow-hidden rounded-r-2xl border border-l-0 border-slate-200 bg-white text-xs text-slate-700 shadow-lg sm:left-24 sm:w-72"
          style={{ top: importsPanelTop }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3">
            <div className="min-w-0">
              <strong className="block text-sm text-slate-950">
                Imports cartographiques
              </strong>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                Choisis les données à ajouter dans la zone de travail.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setImportsOpen(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              title="Fermer"
              aria-label="Fermer les imports cartographiques"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="space-y-2 p-3">
            <button
              type="button"
              data-dromap-tour="imports-buildings"
              onClick={openBuildingsImport}
              className={`${motionStyles.libraryChoice} flex w-full items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-left font-bold text-amber-950`}
              title={
                productRuntimeEnabled && !capabilities.canImportBuildings
                  ? "Importer des bâtiments — accès premium"
                  : "Importer les bâtiments de la zone"
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-800 shadow-sm">
                <span className={motionStyles.libraryIcon}><BuildingsGlyph /></span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">
                  Bâtiments
                  {productRuntimeEnabled && !capabilities.canImportBuildings
                    ? " 🔒"
                    : ""}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium leading-snug text-amber-800/80">
                  IGN en France, Overture Maps ailleurs.
                </span>
              </span>
            </button>

            <button
              type="button"
              data-dromap-tour="imports-routes"
              onClick={openRoutesImport}
              className={`${motionStyles.libraryChoice} flex w-full items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-left font-bold text-slate-900`}
              title={
                productRuntimeEnabled && !capabilities.canImportBuildings
                  ? "Importer des routes — accès premium"
                  : "Importer les routes de la zone"
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 shadow-sm">
                <span className={motionStyles.libraryIcon}><RoadGlyph /></span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">
                  Routes
                  {productRuntimeEnabled && !capabilities.canImportBuildings
                    ? " 🔒"
                    : ""}
                </span>
                <span className="mt-0.5 block text-[10px] font-medium leading-snug text-slate-500">
                  Autoroutes, axes principaux, secondaires et petites routes.
                </span>
              </span>
            </button>

            <div
              data-dromap-tour="imports-cycle"
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left text-slate-500"
              title="Prochains imports cartographiques"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400">
                <CycleGlyph />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-500">À venir</span>
                <button
                  type="button"
                  onClick={() => {
                    setImportsOpen(false);
                    setContactOpen(true);
                  }}
                  className="mt-0.5 block text-[10px] font-semibold text-teal-700 underline decoration-teal-400 underline-offset-2 transition hover:text-teal-900"
                >
                  Suggestions ?
                </button>
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {openSettingsTool ? (
        <div
          ref={settingsPanelRef}
          data-dromap-tool-settings-panel="true"
          onScrollCapture={(event) => {
            if (!markerLibraryOpen || !(event.target instanceof HTMLElement)) return;
            const { target } = event;
            if (target === settingsPanelRef.current) markerLibraryScroll.current.panel = target.scrollTop;
            if (target === markerLibraryScrollRef.current) markerLibraryScroll.current.symbols = target.scrollTop;
            if (target === customMarkerListRef.current) markerLibraryScroll.current.custom = target.scrollTop;
          }}
          className={
            embedded
              ? `${settingsMotionClass} pointer-events-auto absolute left-20 top-0 h-full min-h-0 ${settingsPanelWidth} overflow-y-auto border-r border-slate-200 bg-white p-3 text-xs text-neutral-700 shadow-lg sm:left-24`
              : `${settingsMotionClass} pointer-events-auto ${settingsPanelWidth} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-black/10 bg-white/95 p-3 text-xs text-neutral-700 shadow-lg backdrop-blur`
          }
        >
          <div className={`sticky top-0 z-30 -mx-3 -mt-3 mb-3 flex items-center justify-between gap-2 border-b px-3 py-3 ${drawingLibraryOpen ? "border-neutral-300 bg-neutral-50" : "border-neutral-200 bg-white/95 shadow-sm backdrop-blur"}`}>
            <div>
              <strong className="block text-sm text-neutral-900">
                {getSettingsTitle(openSettingsTool)}
              </strong>
              <span className="text-[11px] text-neutral-500">
                {drawingLibraryOpen
                  ? "Choisis un type dans la bibliothèque"
                  : markerLibraryOpen
                    ? "Choisis un pictogramme"
                    : "Paramètres avant la pose"}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {canResetCurrentSettings ? (
                <button
                  type="button"
                  data-dromap-tool-control="true"
                  onClick={resetCurrentSettings}
                  className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1.5 text-xs font-semibold text-teal-800"
                  title="Réinitialiser les paramètres de cet outil"
                >
                  <span aria-hidden="true">↻</span>
                  Réinitialiser
                </button>
              ) : null}

              <button
                type="button"
                data-dromap-tool-control="true"
                onClick={() => {
                  setOpenSettingsTool(null);
                  setPickerCategory(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-red-50 hover:text-red-700"
              >
                Fermer
                {canResetCurrentSettings ? <span aria-hidden="true">×</span> : null}
              </button>
            </div>
          </div>

          {openSettingsTool === "marker" ? (
            markerSettingsStep === "symbols" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                    Rechercher un marqueur
                  </span>
                  <input
                    type="search"
                    value={markerSymbolSearch}
                    onChange={(event) => setMarkerSymbolSearch(event.target.value)}
                    placeholder="Ville, gare, port, bataille, énergie, risque..."
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <details
                  className="group rounded-xl border border-neutral-200 bg-white"
                  open={markerThemesOpen}
                  onToggle={(event) => setMarkerThemesOpen(event.currentTarget.open)}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-600 marker:content-none">
                    <span>Rechercher par thème</span>
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] tabular-nums text-neutral-500">
                        {DROMAP_MARKER_SYMBOL_CATEGORIES.length}
                      </span>
                      <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 p-2">
                    {DROMAP_MARKER_SYMBOL_CATEGORIES.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => scrollToMarkerCategory(category.id)}
                        className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px] font-medium text-neutral-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {category.label}
                      </button>
                    ))}
                  </div>
                </details>

                {!markerCatalog ? (
                  <p role="status" className="text-[11px] text-neutral-500">Chargement des symboles…</p>
                ) : markerSearchResult.fallback ? (
                  <p className="text-[11px] text-neutral-500">
                    Aucun résultat exact. {markerSymbolCount} suggestion{markerSymbolCount > 1 ? "s" : ""} proche{markerSymbolCount > 1 ? "s" : ""}.
                  </p>
                ) : null}

                <div
                  ref={markerLibraryScrollRef}
                  className="max-h-[56vh] space-y-4 overflow-y-auto pr-1"
                >

                  {markerSymbolGroups.map(({ category, options }) => {
                    return (
                      <section
                        key={category.id}
                        id={getMarkerCategoryElementId(category.id)}
                        className="scroll-mt-3 space-y-2"
                      >
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          {category.label}
                        </h3>

                        <div className="grid grid-cols-4 gap-2">
                          {options.map((option) => {
                            const isSelected =
                              selectedMarkerIsBuiltin &&
                              selectedMarkerSymbolId === option.id;

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setMarkerBuiltinSymbol(option.id);
                                  updateMarkerStyle({
                                    markerSize: clampMarkerSizeForSymbol(
                                      markerStyle.markerSize,
                                      { type: "builtin", id: option.id },
                                    ),
                                    ...(markerSymbolSupportsFill(option.id)
                                      ? { markerFilled: true }
                                      : {}),
                                  });
                                  setActiveTool("marker");
                                  rememberShortcut("marker", { type: "builtin", id: option.id });
                                  setMarkerSettingsStep("style");
                                  scrollMarkerSettingsToTop();
                                }}
                                className={[
                                  motionStyles.libraryChoice,
                                  "flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center",
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 text-blue-700"
                                    : "border-neutral-200 bg-white text-neutral-700",
                                ].join(" ")}
                                title={option.label}
                              >
                                <span className={motionStyles.libraryIcon}>
                                  <MarkerSymbolPreview
                                    symbol={{ type: "builtin", id: option.id }}
                                    color={markerStyle.color}
                                    opacity={1}
                                    size={30}
                                    weight={markerStrokeWeight}
                                    markerFilled={
                                      markerStyle.markerFilled === true &&
                                      markerSymbolSupportsFill(option.id)
                                    }
                                  />
                                </span>
                                <span className="line-clamp-2 text-[10px] leading-tight">
                                  {option.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                <div className="border-t border-neutral-200 pt-3">
                  <CustomMarkerLibrary
                    selectedSymbol={markerSymbol}
                    listRef={customMarkerListRef}
                    onSelect={(symbol) => {
                      setMarkerSymbol(symbol);
                      updateMarkerStyle({
                        markerSize: clampMarkerSizeForSymbol(
                          markerStyle.markerSize,
                          symbol,
                        ),
                      });
                      setActiveTool("marker");
                      rememberShortcut("marker", symbol);
                      setMarkerSettingsStep("style");
                      scrollMarkerSettingsToTop();
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2">
                  <MarkerSymbolPreview
                    symbol={markerSymbol}
                    color={markerStyle.color}
                    opacity={1}
                    size={38}
                    weight={markerStrokeWeight}
                    markerFilled={markerFilledEnabled}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-neutral-900">
                      {getMarkerSymbolLabel({
                        properties: {
                          style: markerStyle,
                          symbol: markerSymbol,
                        },
                      })}
                    </div>
                  </div>
                </div>

                {selectedMarkerIsBuiltin ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>Couleur</span>
                    <ColorPicker
                      value={markerStyle.color}
                      onChange={(color) => updateMarkerStyle({ color })}
                      ariaLabel="Couleur du marqueur"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-[11px] leading-relaxed text-teal-900">
                    Les couleurs de ce marqueur personnalisé sont conservées telles qu’elles ont été dessinées ou importées.
                  </div>
                )}

                {selectedMarkerCanBeFilled ? (
                  <label className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-2 py-2">
                    <span>Remplissage</span>
                    <input
                      type="checkbox"
                      checked={markerStyle.markerFilled === true}
                      onChange={(event) =>
                        updateMarkerStyle({ markerFilled: event.target.checked })
                      }
                      className="h-4 w-4 cursor-pointer accent-blue-600"
                    />
                  </label>
                ) : null}

                <label className="block">
                  <div className="mb-1 flex justify-between">
                    <span>Opacité</span>
                    <span>{percentage(markerStyle.opacity)}</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={markerStyle.opacity}
                    onChange={(event) =>
                      updateMarkerStyle({
                        opacity: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label className="block">
                  <div className="mb-1 flex justify-between">
                    <span>Taille</span>
                    <span>{displayedMarkerSize}px</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2">
                    <input
                      className="w-full"
                      type="range"
                      min={markerSizeLimits.min}
                      max={markerSizeLimits.max}
                      step="0.5"
                      value={displayedMarkerSize}
                      onChange={(event) =>
                        updateMarkerStyle({
                          markerSize: Number(event.target.value),
                        })
                      }
                      aria-label="Taille du marqueur"
                    />
                    <input
                      type="number"
                      min={markerSizeLimits.min}
                      max={markerSizeLimits.max}
                      step="0.5"
                      value={displayedMarkerSize}
                      onChange={(event) => {
                        const markerSize = Number(event.target.value);
                        if (!Number.isFinite(markerSize)) return;
                        updateMarkerStyle({
                          markerSize: clampMarkerSizeForSymbol(
                            markerSize,
                            markerSymbol,
                          ),
                        });
                      }}
                      className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs font-semibold tabular-nums text-neutral-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                      aria-label="Taille exacte du marqueur"
                    />
                  </div>
                </label>

                {selectedMarkerHasStroke ? (
                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Épaisseur du trait</span>
                      <span>{markerStrokeWeight}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min={MIN_MARKER_STROKE_WIDTH}
                      max={MAX_MARKER_STROKE_WIDTH}
                      step="0.5"
                      value={markerStrokeWeight}
                      onChange={(event) =>
                        updateMarkerStyle({
                          weight: Number(event.target.value),
                        })
                      }
                    />
                    <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                      S’applique aux pictogrammes dessinés au trait.
                    </p>
                  </label>
                ) : null}
              </div>
            )
          ) : null}

          {pickerCategory === "line" ? (
            <div className={motionStyles.toolLibrary}>
              <div className={`${motionStyles.toolRow} ${motionStyles.lineToolRow}`}>
                {LINE_TOOL_CHOICES.map((choice) => (
                  <DrawingLibraryOption
                    key={choice.value}
                    label={choice.label}
                    icon={choice.icon}
                    description={choice.description}
                    unavailableReason={
                      choice.value === "trace-line" && !canUseTraceToolOnCurrentBasemap
                        ? "Affiche un fond blanc vectoriel avec des frontières ou un calque GeoJSON visible contenant des lignes ou des contours, comme un calque de routes importées."
                        : undefined
                    }
                    onClick={() => chooseLineTool(choice.value)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {lineSettingsOpen ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span>Couleur</span>
                <ColorPicker
                  value={lineStyle.color}
                  onChange={(color) => updateLineStyle({ color })}
                  ariaLabel="Couleur du trait"
                />
              </div>

              <label className="flex items-center justify-between gap-3">
                <span>Trait</span>
                <select
                  className="w-44 rounded-md border border-neutral-200 bg-white px-2 py-1"
                  value={lineStyle.dashStyle}
                  onChange={(event) =>
                    updateLineStyle({
                      dashStyle: event.target.value as DroMapFeatureDashStyle,
                    })
                  }
                >
                  {DROMAP_DASH_STYLES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {lineStyle.dashStyle === "dashed" ? (
                <label className="block rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="mb-1 flex justify-between">
                    <span>Longueur des tirets</span>
                    <span>{lineStyle.dashLength}px</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min={MIN_DASH_LENGTH}
                    max={MAX_DASH_LENGTH}
                    step="1"
                    value={lineStyle.dashLength}
                    onChange={(event) =>
                      updateLineStyle({ dashLength: Number(event.target.value) })
                    }
                  />
                </label>
              ) : null}

              {lineStyle.dashStyle === "dashed" || lineStyle.dashStyle === "dotted" ? (
                <label className="block rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="mb-1 flex justify-between">
                    <span>{lineStyle.dashStyle === "dotted" ? "Espacement des pointillés" : "Espacement des tirets"}</span>
                    <span>{lineStyle.dashGap}px</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min={MIN_DASH_GAP}
                    max={MAX_DASH_GAP}
                    step="1"
                    value={lineStyle.dashGap}
                    onChange={(event) =>
                      updateLineStyle({ dashGap: Number(event.target.value) })
                    }
                  />
                </label>
              ) : null}

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 px-2 py-2">
                <label className="flex items-center justify-between gap-2">
                  <span>Flèche début</span>
                  <input
                    type="checkbox"
                    checked={lineStyle.arrowStart}
                    onChange={(event) =>
                      updateLineStyle({ arrowStart: event.target.checked })
                    }
                    className="h-4 w-4 cursor-pointer rounded border-neutral-300"
                  />
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span>Flèche fin</span>
                  <input
                    type="checkbox"
                    checked={lineStyle.arrowEnd}
                    onChange={(event) =>
                      updateLineStyle({ arrowEnd: event.target.checked })
                    }
                    className="h-4 w-4 cursor-pointer rounded border-neutral-300"
                  />
                </label>
              </div>

              <label className="block">
                <div className="mb-1 flex justify-between">
                  <span>Épaisseur</span>
                  <span>{lineStyle.weight}px</span>
                </div>
                <input
                  className="w-full"
                  type="range"
                  min="1"
                  max="12"
                  step="0.5"
                  value={lineStyle.weight}
                  onChange={(event) =>
                    updateLineStyle({ weight: Number(event.target.value) })
                  }
                />
              </label>

              {openSettingsTool === "freehand" ? (
                <label className="block rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="mb-1 flex justify-between">
                    <span>Lissage</span>
                    <span>{lineStyle.freehandSmoothing ?? 0}%</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={lineStyle.freehandSmoothing ?? 0}
                    onChange={(event) =>
                      updateLineStyle({
                        freehandSmoothing: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ) : null}

              <label className="block">
                <div className="mb-1 flex justify-between">
                  <span>Opacité</span>
                  <span>{percentage(lineStyle.opacity)}</span>
                </div>
                <input
                  className="w-full"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={lineStyle.opacity}
                  onChange={(event) =>
                    updateLineStyle({
                      opacity: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          ) : null}

          {pickerCategory === "zone" ? (
            <div className={`${motionStyles.toolLibrary} space-y-3`}>
              <div className={motionStyles.toolRow}>
                {ZONE_TOOL_CHOICES.map((choice) => (
                  <DrawingLibraryOption
                    key={choice.value}
                    label={choice.label}
                    icon={choice.icon}
                    description={choice.description}
                    unavailableReason={
                      choice.value === "fill-zone" && !canUseFillToolOnCurrentBasemap
                        ? "Affiche un fond blanc vectoriel avec des frontières ou un calque GeoJSON visible contenant des polygones."
                        : undefined
                    }
                    onClick={() => chooseZoneTool(choice.value)}
                  />
                ))}
              </div>

              <div>
                <h3 className="mb-1 text-[11px] font-semibold text-neutral-600">Formes rapides</h3>
                <div className={motionStyles.toolRow}>
                  {DROMAP_QUICK_SHAPES.map((option) => (
                    <DrawingLibraryOption
                      key={option.value}
                      label={option.label}
                      icon={<QuickShapeGlyph shapeKind={option.value} />}
                      description="Clique pour poser le premier point, puis clique à l’opposé pour dimensionner la forme."
                      onClick={() => chooseZoneTool("shape", option.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {zoneSettingsOpen ? (
            <div className="space-y-3">
              {openSettingsTool === "freehand-zone" ? (
                <label className="block rounded-lg bg-neutral-50 px-2 py-2">
                  <div className="mb-1 flex justify-between">
                    <span>Lissage</span>
                    <span>{zoneStyle.freehandSmoothing ?? 0}%</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={zoneStyle.freehandSmoothing ?? 0}
                    onChange={(event) =>
                      updateZoneStyle({
                        freehandSmoothing: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ) : null}

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 px-2 py-2">
                <label className="flex items-center justify-between gap-2">
                  <span>Contour</span>
                  <input
                    type="checkbox"
                    checked={zoneStrokeEnabled}
                    onChange={(event) =>
                      updateZoneStrokeEnabled(event.target.checked)
                    }
                    className="h-4 w-4 cursor-pointer rounded border-neutral-300"
                  />
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span>Fond</span>
                  <input
                    type="checkbox"
                    checked={zoneFillEnabled}
                    onChange={(event) =>
                      updateZoneFillEnabled(event.target.checked)
                    }
                    className="h-4 w-4 cursor-pointer rounded border-neutral-300"
                  />
                </label>
              </div>

              {zoneStrokeEnabled ? (
                <div className="flex items-center justify-between gap-3">
                  <span>Couleur contour</span>
                  <ColorPicker
                    value={zoneStyle.color}
                    onChange={(color) => updateZoneStyle({ color })}
                    ariaLabel="Couleur du contour"
                  />
                </div>
              ) : null}

              {zoneFillEnabled ? (
                <div className="flex items-center justify-between gap-3">
                  <span>Couleur fond</span>
                  <ColorPicker
                    value={zoneStyle.fillColor}
                    onChange={(fillColor) => updateZoneStyle({ fillColor })}
                    ariaLabel="Couleur du fond"
                  />
                </div>
              ) : null}

              {zoneStrokeEnabled ? (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span>Trait</span>
                    <select
                      className="w-44 rounded-md border border-neutral-200 bg-white px-2 py-1"
                      value={zoneStyle.dashStyle}
                      onChange={(event) =>
                        updateZoneStyle({
                          dashStyle: event.target.value as DroMapFeatureDashStyle,
                        })
                      }
                    >
                      {DROMAP_DASH_STYLES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {zoneStyle.dashStyle === "dashed" ? (
                    <label className="block rounded-lg bg-neutral-50 px-2 py-2">
                      <div className="mb-1 flex justify-between">
                        <span>Longueur des tirets</span>
                        <span>{zoneStyle.dashLength}px</span>
                      </div>
                      <input
                        className="w-full"
                        type="range"
                        min={MIN_DASH_LENGTH}
                        max={MAX_DASH_LENGTH}
                        step="1"
                        value={zoneStyle.dashLength}
                        onChange={(event) =>
                          updateZoneStyle({ dashLength: Number(event.target.value) })
                        }
                      />
                    </label>
                  ) : null}

                  {zoneStyle.dashStyle === "dashed" || zoneStyle.dashStyle === "dotted" ? (
                    <label className="block rounded-lg bg-neutral-50 px-2 py-2">
                      <div className="mb-1 flex justify-between">
                        <span>{zoneStyle.dashStyle === "dotted" ? "Espacement des pointillés" : "Espacement des tirets"}</span>
                        <span>{zoneStyle.dashGap}px</span>
                      </div>
                      <input
                        className="w-full"
                        type="range"
                        min={MIN_DASH_GAP}
                        max={MAX_DASH_GAP}
                        step="1"
                        value={zoneStyle.dashGap}
                        onChange={(event) =>
                          updateZoneStyle({ dashGap: Number(event.target.value) })
                        }
                      />
                    </label>
                  ) : null}

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Épaisseur contour</span>
                      <span>{zoneStyle.weight}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min="0.25"
                      max="12"
                      step="0.25"
                      value={zoneStyle.weight}
                      onChange={(event) =>
                        updateZoneStyle({ weight: Number(event.target.value) })
                      }
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Opacité du contour</span>
                      <span>{percentage(zoneStyle.opacity)}</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={zoneStyle.opacity}
                      onChange={(event) =>
                        updateZoneStyle({
                          opacity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              {zoneFillEnabled ? (
                <label className="block">
                  <div className="mb-1 flex justify-between">
                    <span>Opacité fond</span>
                    <span>{percentage(zoneStyle.fillOpacity)}</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={zoneStyle.fillOpacity}
                    onChange={(event) =>
                      updateZoneStyle({
                        fillOpacity: Number(event.target.value),
                      })
                    }
                  />
                </label>
              ) : null}

              <label className="flex items-center justify-between gap-3">
                <span>Hachures</span>
                <select
                  className="w-44 rounded-md border border-neutral-200 bg-white px-2 py-1"
                  value={zoneStyle.zoneHatchingStyle}
                  onChange={(event) =>
                    updateZoneStyle({
                      zoneHatchingStyle: event.target
                        .value as DroMapZoneHatchingStyle,
                    })
                  }
                >
                  {DROMAP_ZONE_HATCHING_STYLES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {zoneStyle.zoneHatchingStyle !== "none" ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span>Couleur hachures</span>
                    <ColorPicker
                      value={zoneStyle.zoneHatchingColor}
                      onChange={(zoneHatchingColor) => updateZoneStyle({ zoneHatchingColor })}
                      ariaLabel="Couleur des hachures"
                    />
                  </div>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Épaisseur hachures</span>
                      <span>{zoneStyle.zoneHatchingWeight}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min={MIN_ZONE_HATCHING_WEIGHT}
                      max={MAX_ZONE_HATCHING_WEIGHT}
                      step="0.5"
                      value={zoneStyle.zoneHatchingWeight}
                      onChange={(event) =>
                        updateZoneStyle({
                          zoneHatchingWeight: Number(event.target.value),
                        })
                      }
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Resserrement</span>
                      <span>{zoneStyle.zoneHatchingSpacing}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min={MIN_ZONE_HATCHING_SPACING}
                      max={MAX_ZONE_HATCHING_SPACING}
                      step="0.5"
                      value={zoneStyle.zoneHatchingSpacing}
                      onChange={(event) =>
                        updateZoneStyle({
                          zoneHatchingSpacing: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              <label className="flex items-center justify-between gap-3">
                <span>Points</span>
                <input
                  type="checkbox"
                  checked={zoneStyle.zoneDotsEnabled}
                  onChange={(event) =>
                    updateZoneStyle({
                      zoneDotsEnabled: event.target.checked,
                    })
                  }
                />
              </label>

              {zoneStyle.zoneDotsEnabled ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span>Couleur points</span>
                    <ColorPicker
                      value={zoneStyle.zoneDotsColor}
                      onChange={(zoneDotsColor) => updateZoneStyle({ zoneDotsColor })}
                      ariaLabel="Couleur des points"
                    />
                  </div>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Rayon points</span>
                      <span>{zoneStyle.zoneDotsRadius}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min={MIN_ZONE_DOTS_RADIUS}
                      max={MAX_ZONE_DOTS_RADIUS}
                      step="0.5"
                      value={zoneStyle.zoneDotsRadius}
                      onChange={(event) =>
                        updateZoneStyle({
                          zoneDotsRadius: Number(event.target.value),
                        })
                      }
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Espacement points</span>
                      <span>{zoneStyle.zoneDotsSpacing}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min={MIN_ZONE_DOTS_SPACING}
                      max={MAX_ZONE_DOTS_SPACING}
                      step="0.5"
                      value={zoneStyle.zoneDotsSpacing}
                      onChange={(event) =>
                        updateZoneStyle({
                          zoneDotsSpacing: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          {(lineSettingsOpen || zoneSettingsOpen) && drawingHelp ? (
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
              {drawingHelp}
            </p>
          ) : null}

          {openSettingsTool === "text" ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span>Couleur</span>
                <ColorPicker
                  value={textStyle.color}
                  onChange={(color) => updateTextStyle({ color })}
                  ariaLabel="Couleur du texte"
                />
              </div>

              <label className="block">
                <div className="mb-1 flex justify-between">
                  <span>Opacité</span>
                  <span>{percentage(textStyle.opacity)}</span>
                </div>
                <input
                  className="w-full"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={textStyle.opacity}
                  onChange={(event) =>
                    updateTextStyle({
                      opacity: Number(event.target.value),
                    })
                  }
                />
              </label>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-semibold text-blue-950">Police</span>
                  <span className="tabular-nums font-bold text-blue-900">
                    {textStyle.fontSize}px
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <select
                    value={textStyle.fontSize}
                    onChange={(event) =>
                      updateTextStyle({
                        fontSize: Math.min(
                          MAX_TEXT_FONT_SIZE,
                          Math.max(MIN_TEXT_FONT_SIZE, Number(event.target.value)),
                        ),
                      })
                    }
                    className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    aria-label="Taille prédéfinie des nouveaux textes"
                  >
                    {!(TEXT_FONT_SIZE_OPTIONS as readonly number[]).includes(
                      textStyle.fontSize,
                    ) ? (
                      <option value={textStyle.fontSize}>
                        {textStyle.fontSize} px
                      </option>
                    ) : null}
                    {TEXT_FONT_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>{size} px</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={MIN_TEXT_FONT_SIZE}
                    max={MAX_TEXT_FONT_SIZE}
                    step="0.5"
                    value={textStyle.fontSize}
                    onChange={(event) => {
                      const raw = Number(event.target.value);
                      if (!Number.isFinite(raw)) return;
                      updateTextStyle({
                        fontSize: Math.min(
                          MAX_TEXT_FONT_SIZE,
                          Math.max(MIN_TEXT_FONT_SIZE, raw),
                        ),
                      });
                    }}
                    className="rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold tabular-nums text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    aria-label="Taille exacte des nouveaux textes"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateTextStyle({ textBold: !textStyle.textBold })}
                    className={[
                      "rounded-md border px-2 py-1.5 text-xs font-extrabold transition",
                      textStyle.textBold
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-blue-200 bg-white text-blue-900 hover:bg-blue-100",
                    ].join(" ")}
                  >
                    Gras
                  </button>
                  <button
                    type="button"
                    onClick={() => updateTextStyle({ textItalic: !textStyle.textItalic })}
                    className={[
                      "rounded-md border px-2 py-1.5 text-xs font-semibold italic transition",
                      textStyle.textItalic
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-blue-200 bg-white text-blue-900 hover:bg-blue-100",
                    ].join(" ")}
                  >
                    Italique
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2">
                <label className="flex items-center justify-between gap-2">
                  <span>Fond</span>
                  <input
                    type="checkbox"
                    checked={textStyle.textBackgroundEnabled}
                    onChange={(event) =>
                      updateTextStyle({
                        textBackgroundEnabled: event.target.checked,
                      })
                    }
                    className="h-4 w-4 cursor-pointer rounded border-slate-300"
                  />
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span>Cadre</span>
                  <input
                    type="checkbox"
                    checked={textStyle.textBorderEnabled}
                    onChange={(event) =>
                      updateTextStyle({
                        textBorderEnabled: event.target.checked,
                      })
                    }
                    className="h-4 w-4 cursor-pointer rounded border-slate-300"
                  />
                </label>

                <label className="flex items-center justify-between gap-2">
                  <span>Contour blanc</span>
                  <input
                    type="checkbox"
                    checked={textStyle.textOutlineEnabled}
                    onChange={(event) =>
                      updateTextStyle({
                        textOutlineEnabled: event.target.checked,
                        textOutlineColor: "#ffffff",
                      })
                    }
                    className="h-4 w-4 cursor-pointer rounded border-slate-300"
                  />
                </label>
              </div>

              {textStyle.textOutlineEnabled ? (
                <label className="block">
                  <div className="mb-1 flex justify-between">
                    <span>Épaisseur contour blanc</span>
                    <span>{textStyle.textOutlineWidth}px</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min="0"
                    max="6"
                    step="0.25"
                    value={textStyle.textOutlineWidth}
                    onChange={(event) =>
                      updateTextStyle({
                        textOutlineWidth: Number(event.target.value),
                        textOutlineColor: "#ffffff",
                      })
                    }
                  />
                </label>
              ) : null}

              {textStyle.textBackgroundEnabled ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span>Couleur fond</span>
                    <ColorPicker
                      value={textStyle.textBackgroundColor}
                      onChange={(textBackgroundColor) => updateTextStyle({ textBackgroundColor })}
                      ariaLabel="Couleur du fond du texte"
                    />
                  </div>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Opacité fond</span>
                      <span>{percentage(textStyle.textBackgroundOpacity)}</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={textStyle.textBackgroundOpacity}
                      onChange={(event) =>
                        updateTextStyle({
                          textBackgroundOpacity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}

              {textStyle.textBorderEnabled ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span>Couleur cadre</span>
                    <ColorPicker
                      value={textStyle.textBorderColor}
                      onChange={(textBorderColor) => updateTextStyle({ textBorderColor })}
                      ariaLabel="Couleur du cadre du texte"
                    />
                  </div>

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Épaisseur cadre</span>
                      <span>{textStyle.textBorderWidth}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min={MIN_TEXT_BORDER_WIDTH}
                      max={MAX_TEXT_BORDER_WIDTH}
                      step="0.5"
                      value={textStyle.textBorderWidth}
                      onChange={(event) =>
                        updateTextStyle({
                          textBorderWidth: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <DromapContactDialog
        open={contactOpen}
        pathname={pathname}
        initialCategory="suggestion"
        onClose={() => setContactOpen(false)}
      />
    </div>
  );
}
