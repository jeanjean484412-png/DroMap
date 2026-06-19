"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { EDITOR_MODE_LABELS } from "@/lib/dromap/editor-mode";
import type {
  DroMapFeatureDashStyle,
  DroMapMarkerBuiltinSymbol,
  DroMapZoneHatchingStyle,
  DroMapZoneShapeKind,
} from "@/lib/dromap/feature";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import {
  type EditorTestActiveTool,
  useEditorTestToolStore,
} from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestDrawingOptionsStore } from "@/stores/editor-test-drawing-options";
import {
  getGeoJsonLayerLoadedDisplayData,
  useEditorTestGeoJsonLayersStore,
} from "@/stores/editor-test-geojson-layers";

import {
  DROMAP_DASH_STYLES,
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
} from "./feature-style";
import {
  DROMAP_BUILTIN_MARKER_SYMBOLS,
  DROMAP_MARKER_SYMBOL_CATEGORIES,
  getMarkerSymbolHtml,
  markerSymbolSupportsFill,
  markerSymbolSupportsStrokeWeight,
} from "./marker-symbol";
import { MAX_TEXT_BORDER_WIDTH, MIN_TEXT_BORDER_WIDTH } from "./text-rendering";
import { WorkspaceActions } from "./workspace-actions";
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

const MIN_TEXT_FONT_SIZE = 10;
const MAX_TEXT_FONT_SIZE = 72;
const MIN_MARKER_STROKE_WIDTH = 3;
const MAX_MARKER_STROKE_WIDTH = 13;
const DEFAULT_MARKER_STROKE_WIDTH = 7;

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
  textRotation: 0,
  textBackgroundEnabled: false,
  textBackgroundColor: "#ffffff",
  textBackgroundOpacity: 0.85,
  textBorderEnabled: false,
  textBorderColor: "#111827",
  textBorderWidth: 2,
};

type LineToolChoice = Extract<
  EditorTestActiveTool,
  "line" | "freehand" | "trace-line"
>;
type ZoneToolChoice = Extract<
  EditorTestActiveTool,
  "zone" | "freehand-zone" | "fill-zone" | "shape"
>;
type MarkerSettingsStep = "symbols" | "style";

type ToolButtonRowProps = {
  label: string;
  active: boolean;
  settingsOpen?: boolean;
  hasSettings?: boolean;
  icon: ReactNode;
  settingsLabel?: string;
  onClick: () => void;
  onSettingsClick?: () => void;
};


type MarkerToolButtonRowProps = {
  active: boolean;
  symbolsOpen: boolean;
  styleOpen: boolean;
  icon: ReactNode;
  onClick: () => void;
  onSymbolsClick: () => void;
  onStyleClick: () => void;
};
const LINE_TOOL_CHOICES: {
  value: LineToolChoice;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "line",
    label: "Trait classique",
    description: "Ligne droite ou brisée par clics.",
    icon: <span className="text-lg font-black">━</span>,
  },
  {
    value: "freehand",
    label: "Dessin libre",
    description: "Trait dessiné en maintenant la souris.",
    icon: (
      <span className="flex items-center gap-0.5 text-base font-black">
        <span>✎</span>
        <span>━</span>
      </span>
    ),
  },
  {
    value: "trace-line",
    label: "Suivi de trait",
    description: "Suit une frontière vectorielle du fond.",
    icon: <span className="text-lg font-black">⤳</span>,
  },
];

const ZONE_TOOL_CHOICES: {
  value: ZoneToolChoice;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: "zone",
    label: "Zone classique",
    description: "Polygone posé point par point.",
    icon: <span className="text-lg font-black">▰</span>,
  },
  {
    value: "freehand-zone",
    label: "Zone libre",
    description: "Zone dessinée en maintenant la souris.",
    icon: (
      <span className="flex items-center gap-0.5 text-base font-black">
        <span>✎</span>
        <span>▱</span>
      </span>
    ),
  },
  {
    value: "fill-zone",
    label: "Remplissage",
    description: "Clique une région ou un département vectoriel du fond.",
    icon: <span className="text-lg font-black">▣</span>,
  },
  {
    value: "shape",
    label: "Forme rapide",
    description: "Rectangle, cercle ou ellipse en deux clics.",
    icon: <span className="text-lg font-black">◧</span>,
  },
];

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function normalizeMarkerSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type MarkerSymbolOption = (typeof DROMAP_BUILTIN_MARKER_SYMBOLS)[number];

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

function getMarkerSearchWords(normalizedQuery: string) {
  const rawWords = normalizedQuery.split(/\s+/).filter(Boolean);

  return rawWords.map((word) => {
    const expanded = new Set([word]);
    const synonyms = MARKER_SEARCH_SYNONYMS[word] ?? [];

    for (const synonym of synonyms) {
      for (const synonymWord of normalizeMarkerSearchText(synonym)
        .split(/\s+/)
        .filter(Boolean)) {
        expanded.add(synonymWord);
      }
    }

    return Array.from(expanded);
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

  const maxDistance = word.length >= 7 ? 2 : 1;

  return levenshteinDistance(word, token, maxDistance) <= maxDistance;
}

function getMarkerSearchHaystack(
  option: MarkerSymbolOption,
  categoryLabel: string,
) {
  const rawText = [
    option.label,
    categoryLabel,
    option.sourceIcon,
    option.id,
    ...option.keywords,
  ].join(" ");
  const normalizedText = normalizeMarkerSearchText(rawText);
  const tokens = normalizedText
    .split(/[\s-]+/)
    .filter((token) => token.length > 0);

  return { normalizedText, tokens };
}

function markerSymbolSearchScore(
  option: MarkerSymbolOption,
  categoryLabel: string,
  normalizedQuery: string,
) {
  if (!normalizedQuery) {
    return POPULAR_MARKER_SYMBOL_IDS.has(option.id) ? 20 : 1;
  }

  const { normalizedText, tokens } = getMarkerSearchHaystack(option, categoryLabel);
  const queryGroups = getMarkerSearchWords(normalizedQuery);
  let score = 0;

  for (const group of queryGroups) {
    let bestGroupScore = 0;

    for (const word of group) {
      if (normalizedText.includes(word)) {
        bestGroupScore = Math.max(bestGroupScore, 80 + word.length);
        continue;
      }

      if (tokens.some((token) => fuzzyWordMatches(word, token))) {
        bestGroupScore = Math.max(bestGroupScore, 35 + Math.min(word.length, 10));
      }
    }

    if (bestGroupScore <= 0) {
      return -1;
    }

    score += bestGroupScore;
  }

  const normalizedLabel = normalizeMarkerSearchText(option.label);
  const normalizedSourceIcon = normalizeMarkerSearchText(option.sourceIcon);

  if (normalizedLabel.includes(normalizedQuery)) score += 120;
  if (normalizedSourceIcon.includes(normalizedQuery)) score += 60;
  if (POPULAR_MARKER_SYMBOL_IDS.has(option.id)) score += 8;

  return score;
}

function getMarkerSymbolSearchGroups(normalizedQuery: string): {
  groups: MarkerSymbolSearchGroup[];
  count: number;
  fallback: boolean;
} {
  const scored = DROMAP_BUILTIN_MARKER_SYMBOLS.map((option, index) => {
    const category =
      DROMAP_MARKER_SYMBOL_CATEGORIES.find(
        (candidate) => candidate.id === option.categoryId,
      ) ?? DROMAP_MARKER_SYMBOL_CATEGORIES[0];

    return {
      option,
      category,
      index,
      score: markerSymbolSearchScore(option, category.label, normalizedQuery),
    };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const fallback = normalizedQuery.length > 0 && scored.length === 0;
  const rows = fallback
    ? DROMAP_BUILTIN_MARKER_SYMBOLS.map((option, index) => {
        const category =
          DROMAP_MARKER_SYMBOL_CATEGORIES.find(
            (candidate) => candidate.id === option.categoryId,
          ) ?? DROMAP_MARKER_SYMBOL_CATEGORIES[0];

        return {
          option,
          category,
          index,
          score: POPULAR_MARKER_SYMBOL_IDS.has(option.id) ? 10 : 1,
        };
      })
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, 96)
    : scored;

  const groups = DROMAP_MARKER_SYMBOL_CATEGORIES.map((category) => {
    const options = rows
      .filter((item) => item.category.id === category.id)
      .map((item) => item.option);

    return { category, options };
  }).filter((group) => group.options.length > 0);

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
  tool: EditorTestActiveTool,
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

function getSettingsTitle(openSettingsTool: EditorTestActiveTool) {
  if (openSettingsTool === "marker") return "Marqueur";
  if (
    openSettingsTool === "line" ||
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

function getSettingsSubtitle(openSettingsTool: EditorTestActiveTool) {
  if (openSettingsTool === "marker") {
    return "Choix du pictogramme ou paramètres avant pose";
  }

  if (
    openSettingsTool === "line" ||
    openSettingsTool === "freehand" ||
    openSettingsTool === "trace-line"
  ) {
    return "Choix du type de trait et paramètres";
  }

  if (
    openSettingsTool === "zone" ||
    openSettingsTool === "freehand-zone" ||
    openSettingsTool === "fill-zone" ||
    openSettingsTool === "shape"
  ) {
    return "Choix du type de zone et paramètres";
  }

  if (openSettingsTool === "text") {
    return "Style du texte avant pose";
  }

  return "";
}

function getLineToolIcon(tool: LineToolChoice) {
  if (tool === "freehand") {
    return (
      <span className="flex items-center gap-0.5 text-base font-black">
        <span>✎</span>
        <span>━</span>
      </span>
    );
  }

  if (tool === "trace-line") {
    return <span className="text-lg font-black">⤳</span>;
  }

  return <span className="text-lg font-black">━</span>;
}

function getActiveLineToolLabel(tool: LineToolChoice) {
  if (tool === "freehand") {
    return "Dessin libre";
  }

  if (tool === "trace-line") {
    return "Suivi de trait";
  }

  return "Trait classique";
}

function getZoneToolIcon(tool: ZoneToolChoice, shapeKind: DroMapZoneShapeKind) {
  if (tool === "freehand-zone") {
    return (
      <span className="flex items-center gap-0.5 text-base font-black">
        <span>✎</span>
        <span>▱</span>
      </span>
    );
  }

  if (tool === "fill-zone") {
    return <span className="text-lg font-black">▣</span>;
  }

  if (tool === "shape") {
    if (shapeKind === "circle") return <span className="text-lg font-black">○</span>;
    if (shapeKind === "ellipse") return <span className="text-lg font-black">⬭</span>;
    return <span className="text-lg font-black">▭</span>;
  }

  return <span className="text-lg font-black">▰</span>;
}

function ToolButtonRow({
  label,
  active,
  settingsOpen = false,
  hasSettings = false,
  icon,
  settingsLabel,
  onClick,
  onSettingsClick,
}: ToolButtonRowProps) {
  return (
    <div className="flex justify-center gap-1">
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={[
          "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
          active
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50",
        ].join(" ")}
        title={label}
      >
        {icon}
      </button>

      {hasSettings ? (
        <button
          type="button"
          aria-label={settingsLabel ?? `Paramètres ${label}`}
          onClick={onSettingsClick}
          className={[
            "flex h-11 w-5 items-center justify-center rounded-lg border text-[10px] font-bold shadow-sm transition",
            settingsOpen
              ? "border-blue-700 bg-blue-700 text-white"
              : active
                ? "border-blue-500 bg-blue-500 text-white hover:bg-blue-700"
                : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900",
          ].join(" ")}
          title={settingsLabel ?? `Ouvrir les paramètres ${label}`}
        >
          ▸
        </button>
      ) : (
        <span className="block h-11 w-5" />
      )}
    </div>
  );
}

function MarkerToolButtonRow({
  active,
  symbolsOpen,
  styleOpen,
  icon,
  onClick,
  onSymbolsClick,
  onStyleClick,
}: MarkerToolButtonRowProps) {
  function smallButtonClass(isOpen: boolean) {
    return [
      "flex h-5 w-5 items-center justify-center rounded-md border text-[10px] font-bold leading-none shadow-sm transition",
      isOpen
        ? "border-blue-700 bg-blue-700 text-white"
        : active
          ? "border-blue-500 bg-blue-500 text-white hover:bg-blue-700"
          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900",
    ].join(" " );
  }

  return (
    <div className="flex justify-center gap-1">
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={[
          "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
          active
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50",
        ].join(" " )}
        title="Marqueur"
      >
        {icon}
      </button>

      <div className="flex h-11 w-5 flex-col gap-1">
        <button
          type="button"
          aria-label="Choisir le type de marqueur"
          onClick={onSymbolsClick}
          className={smallButtonClass(symbolsOpen)}
          title="Choisir le type de marqueur"
        >
          ▸
        </button>

        <button
          type="button"
          aria-label="Paramètres du marqueur"
          onClick={onStyleClick}
          className={smallButtonClass(styleOpen)}
          title="Paramètres du marqueur"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

type MarkerSymbolPreviewProps = {
  symbolId: DroMapMarkerBuiltinSymbol;
  color: string;
  opacity?: number;
  size: number;
  weight?: number;
  markerFilled?: boolean;
};

function MarkerSymbolPreview({
  symbolId,
  color,
  opacity = 1,
  size,
  weight,
  markerFilled = false,
}: MarkerSymbolPreviewProps) {
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
            symbol: {
              type: "builtin",
              id: symbolId,
            },
          },
        },
        { size },
      ),
    [color, markerFilled, opacity, size, symbolId, weight],
  );

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none inline-flex items-center justify-center leading-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default function ModeToolbar() {
  const [openSettingsTool, setOpenSettingsTool] =
    useState<EditorTestActiveTool | null>(null);
  const [markerSettingsStep, setMarkerSettingsStep] =
    useState<MarkerSettingsStep>("symbols");
  const [markerSymbolSearch, setMarkerSymbolSearch] = useState("");
  const [lineToolChoice, setLineToolChoice] = useState<LineToolChoice>("line");
  const [zoneToolChoice, setZoneToolChoice] = useState<ZoneToolChoice>("zone");

  const currentMode = useEditorTestModeStore((state) => state.currentMode);

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  const activeTool = useEditorTestToolStore((state) => state.activeTool);
  const setActiveTool = useEditorTestToolStore((state) => state.setActiveTool);
  const resetActiveTool = useEditorTestToolStore(
    (state) => state.resetActiveTool,
  );

  const markerStyle = useEditorTestDrawingOptionsStore(
    (state) => state.markerStyle,
  );
  const markerSymbol = useEditorTestDrawingOptionsStore(
    (state) => state.markerSymbol,
  );
  const lineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.lineStyle,
  );
  const zoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.zoneStyle,
  );
  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const activeBasemap = getDromapBasemapConfig(basemapId);
  const geoJsonLayers = useEditorTestGeoJsonLayersStore(
    (state) => state.geoJsonLayers,
  );
  const hasVisibleGeoJsonFillPolygons = useMemo(
    () =>
      geoJsonLayers.some(
        (layer) =>
          layer.visible !== false &&
          layer.opacity > 0 &&
          getGeoJsonLayerLoadedDisplayData(layer, workspaceBounds).features.some(
            (feature) =>
              feature.geometry.type === "Polygon" ||
              feature.geometry.type === "MultiPolygon",
          ),
      ),
    [geoJsonLayers, workspaceBounds],
  );
  const canUseFillToolOnCurrentBasemap =
    activeBasemap.kind !== "tile" || hasVisibleGeoJsonFillPolygons;
  const textStyle = useEditorTestDrawingOptionsStore(
    (state) => state.textStyle,
  );

  const updateMarkerStyle = useEditorTestDrawingOptionsStore(
    (state) => state.updateMarkerStyle,
  );
  const setMarkerBuiltinSymbol = useEditorTestDrawingOptionsStore(
    (state) => state.setMarkerBuiltinSymbol,
  );
  const updateLineStyle = useEditorTestDrawingOptionsStore(
    (state) => state.updateLineStyle,
  );
  const updateZoneStyle = useEditorTestDrawingOptionsStore(
    (state) => state.updateZoneStyle,
  );
  const updateTextStyle = useEditorTestDrawingOptionsStore(
    (state) => state.updateTextStyle,
  );

  const selectedMarkerSymbolId: DroMapMarkerBuiltinSymbol =
    markerSymbol.type === "builtin" ? markerSymbol.id : "circle";
  const markerStrokeWeight = markerStyle.weight ?? DEFAULT_MARKER_STROKE_WIDTH;
  const selectedMarkerHasStroke = markerSymbolSupportsStrokeWeight(
    selectedMarkerSymbolId,
  );
  const selectedMarkerCanBeFilled = markerSymbolSupportsFill(
    selectedMarkerSymbolId,
  );
  const markerFilledEnabled =
    selectedMarkerCanBeFilled && markerStyle.markerFilled === true;
  const zoneStrokeEnabled = zoneStyle.zoneStrokeEnabled !== false;
  const zoneFillEnabled = zoneStyle.zoneFillEnabled === true;

  const markerSearchResult = useMemo(
    () => getMarkerSymbolSearchGroups(normalizeMarkerSearchText(markerSymbolSearch)),
    [markerSymbolSearch],
  );
  const markerSymbolGroups = markerSearchResult.groups;
  const markerSymbolCount = markerSearchResult.count;

  const lineSettingsOpen =
    openSettingsTool === "line" ||
    openSettingsTool === "freehand" ||
    openSettingsTool === "trace-line";
  const zoneSettingsOpen =
    openSettingsTool === "zone" ||
    openSettingsTool === "freehand-zone" ||
    openSettingsTool === "fill-zone" ||
    openSettingsTool === "shape";

  const settingsPanelWidth =
    openSettingsTool === "marker" && markerSettingsStep === "symbols"
      ? "w-[30rem]"
      : "w-72";

  const canResetCurrentSettings =
    openSettingsTool !== null &&
    (openSettingsTool !== "marker" || markerSettingsStep === "style");

  useEffect(() => {
    if (currentMode !== "edit") {
      resetActiveTool();
      setOpenSettingsTool(null);
      setMarkerSettingsStep("symbols");
    }
  }, [currentMode, resetActiveTool]);

  useEffect(() => {
    if (
      activeTool === "line" ||
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
    if (zoneToolChoice !== "fill-zone") {
      return;
    }

    if (!canUseFillToolOnCurrentBasemap) {
      setZoneToolChoice("zone");
      if (activeTool === "fill-zone") {
        resetActiveTool();
      }
      if (openSettingsTool === "fill-zone") {
        setOpenSettingsTool("zone");
      }
      return;
    }

    if (!zoneStrokeEnabled && !zoneFillEnabled) {
      updateZoneStyle({ zoneStrokeEnabled: true });
    }
  }, [
    activeTool,
    canUseFillToolOnCurrentBasemap,
    hasVisibleGeoJsonFillPolygons,
    openSettingsTool,
    resetActiveTool,
    updateZoneStyle,
    zoneFillEnabled,
    zoneStrokeEnabled,
    zoneToolChoice,
  ]);

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

  function selectSimpleTool(tool: EditorTestActiveTool) {
    if (activeTool === tool) {
      resetActiveTool();
    } else {
      setActiveTool(tool);
    }

    setOpenSettingsTool(null);
  }

  function togglePlacementTool(tool: EditorTestActiveTool) {
    if (activeTool === tool) {
      resetActiveTool();
      setOpenSettingsTool(null);
      return false;
    }

    setActiveTool(tool);
    return true;
  }

  function openMarkerSymbolLibrary() {
    setActiveTool("marker");
    setOpenSettingsTool((current) => {
      if (current === "marker" && markerSettingsStep === "symbols") {
        return null;
      }

      return "marker";
    });
    setMarkerSettingsStep("symbols");
  }

  function openMarkerStyleSettings() {
    setActiveTool("marker");
    setOpenSettingsTool((current) => {
      if (current === "marker" && markerSettingsStep === "style") {
        return null;
      }

      return "marker";
    });
    setMarkerSettingsStep("style");
  }

  function scrollToMarkerCategory(categoryId: string) {
    setMarkerSymbolSearch("");

    window.setTimeout(() => {
      document
        .getElementById(getMarkerCategoryElementId(categoryId))
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  }

  function openLineSettings() {
    setActiveTool(lineToolChoice);
    setOpenSettingsTool((current) =>
      current === "line" ||
      current === "freehand" ||
      current === "trace-line"
        ? null
        : lineToolChoice,
    );
  }

  function openZoneSettings() {
    const nextZoneTool =
      zoneToolChoice === "fill-zone" && !canUseFillToolOnCurrentBasemap
        ? "zone"
        : zoneToolChoice;

    if (nextZoneTool !== zoneToolChoice) {
      setZoneToolChoice(nextZoneTool);
    }

    setActiveTool(nextZoneTool);
    setOpenSettingsTool((current) =>
      current === "zone" ||
      current === "freehand-zone" ||
      current === "fill-zone" ||
      current === "shape"
        ? null
        : nextZoneTool,
    );
  }

  function chooseLineTool(tool: LineToolChoice) {
    setLineToolChoice(tool);
    setActiveTool(tool);
    setOpenSettingsTool(tool);
  }

  function chooseZoneTool(tool: ZoneToolChoice) {
    if (tool === "fill-zone" && !canUseFillToolOnCurrentBasemap) {
      setZoneToolChoice("zone");
      if (activeTool === "fill-zone") {
        resetActiveTool();
      }
      setOpenSettingsTool("zone");
      return;
    }

    setZoneToolChoice(tool);
    setActiveTool(tool);
    setOpenSettingsTool(tool);
  }

  function resetCurrentSettings() {
    if (openSettingsTool === "marker") {
      updateMarkerStyle(DEFAULT_MARKER_STYLE);
      return;
    }

    if (
    openSettingsTool === "line" ||
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

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-[1000] flex max-h-[calc(100vh-2rem)] items-start gap-3">
      <div className="pointer-events-auto flex max-h-[calc(100vh-2rem)] w-24 flex-col gap-2 overflow-y-auto rounded-2xl border border-black/10 bg-white/95 p-2 shadow-xl backdrop-blur">
        <div className="rounded-xl bg-neutral-900 px-2 py-2 text-center text-[10px] font-semibold leading-tight text-white">
          {EDITOR_MODE_LABELS[currentMode]}
        </div>

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
              label="Modifier"
              active={activeTool === "edit"}
              icon="✥"
              onClick={() => selectSimpleTool("edit")}
            />

            <MarkerToolButtonRow
              active={activeTool === "marker"}
              symbolsOpen={
                openSettingsTool === "marker" && markerSettingsStep === "symbols"
              }
              styleOpen={
                openSettingsTool === "marker" && markerSettingsStep === "style"
              }
              icon={
                <MarkerSymbolPreview
                  symbolId={selectedMarkerSymbolId}
                  color={markerStyle.color}
                  opacity={1}
                  size={26}
                  weight={markerStrokeWeight}
                  markerFilled={markerFilledEnabled}
                />
              }
              onClick={() => {
                const activated = togglePlacementTool("marker");

                if (activated && openSettingsTool !== "marker") {
                  setOpenSettingsTool(null);
                }
              }}
              onSymbolsClick={openMarkerSymbolLibrary}
              onStyleClick={openMarkerStyleSettings}
            />

            <ToolButtonRow
              label={getActiveLineToolLabel(lineToolChoice)}
              active={
                activeTool === "line" ||
                activeTool === "freehand" ||
                activeTool === "trace-line"
              }
              settingsOpen={lineSettingsOpen}
              hasSettings
              icon={getLineToolIcon(lineToolChoice)}
              settingsLabel="Choisir le type de trait et régler son style"
              onClick={() => {
                const activated = togglePlacementTool(lineToolChoice);

                if (activated && !lineSettingsOpen) {
                  setOpenSettingsTool(null);
                }
              }}
              onSettingsClick={openLineSettings}
            />

            <ToolButtonRow
              label={getActiveToolLabel(zoneToolChoice, zoneStyle.zoneShapeKind)}
              active={
                activeTool === "zone" ||
                activeTool === "freehand-zone" ||
                activeTool === "fill-zone" ||
                activeTool === "shape"
              }
              settingsOpen={zoneSettingsOpen}
              hasSettings
              icon={getZoneToolIcon(zoneToolChoice, zoneStyle.zoneShapeKind)}
              settingsLabel="Choisir le type de zone et régler son style"
              onClick={() => {
                const toolToActivate =
                  zoneToolChoice === "fill-zone" && !canUseFillToolOnCurrentBasemap
                    ? "zone"
                    : zoneToolChoice;

                if (toolToActivate !== zoneToolChoice) {
                  setZoneToolChoice(toolToActivate);
                }

                const activated = togglePlacementTool(toolToActivate);

                if (activated && !zoneSettingsOpen) {
                  setOpenSettingsTool(null);
                }
              }}
              onSettingsClick={openZoneSettings}
            />

            <ToolButtonRow
              label="Texte"
              active={activeTool === "text"}
              settingsOpen={openSettingsTool === "text"}
              hasSettings
              icon="T"
              settingsLabel="Paramètres Texte"
              onClick={() => {
                const activated = togglePlacementTool("text");

                if (activated && openSettingsTool !== "text") {
                  setOpenSettingsTool(null);
                }
              }}
              onSettingsClick={() => {
                setActiveTool("text");
                setOpenSettingsTool((current) =>
                  current === "text" ? null : "text",
                );
              }}
            />
          </div>
        ) : null}

        <div className="border-t border-neutral-200 pt-2">
          <div className="mb-2 rounded-xl bg-neutral-50 px-2 py-2 text-center text-[10px] leading-tight text-neutral-500">
            {currentMode === "edit"
              ? getActiveToolLabel(activeTool, zoneStyle.zoneShapeKind)
              : "Zone"}
          </div>

          <WorkspaceActions />
        </div>

        <div className="border-t border-neutral-200 pt-2">
          <UndoRedoControls />
        </div>

        <div className="border-t border-neutral-200 pt-2">
          <SaveLoadControls />
        </div>
      </div>

      {openSettingsTool ? (
        <div
          className={`pointer-events-auto ${settingsPanelWidth} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-black/10 bg-white/95 p-3 text-xs text-neutral-700 shadow-xl backdrop-blur`}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <strong className="block text-sm text-neutral-900">
                {getSettingsTitle(openSettingsTool)}
              </strong>
              <span className="text-[11px] text-neutral-500">
                {getSettingsSubtitle(openSettingsTool)}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {canResetCurrentSettings ? (
                <button
                  type="button"
                  onClick={resetCurrentSettings}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
                  title="Réinitialiser les paramètres de cet outil"
                >
                  Réinitialiser
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setOpenSettingsTool(null)}
                className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                Fermer
              </button>
            </div>
          </div>

          {openSettingsTool === "marker" ? (
            markerSettingsStep === "symbols" ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-neutral-50 px-2 py-2 text-[11px] leading-snug text-neutral-600">
                  Choisis le marqueur à poser. Le bouton de la toolbar prendra ensuite cette image.
                </div>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-neutral-600">
                    Rechercher un marqueur
                  </span>
                  <input
                    type="search"
                    value={markerSymbolSearch}
                    onChange={(event) => setMarkerSymbolSearch(event.target.value)}
                    placeholder="Ville, port, bataille, énergie, risque..."
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <div className="space-y-1 rounded-xl border border-neutral-200 bg-white p-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Thèmes
                  </div>
                  <div className="flex flex-wrap gap-1.5">
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
                </div>

                <div className="text-[11px] text-neutral-500">
                  {markerSearchResult.fallback ? (
                    <>
                      Aucun résultat exact : {markerSymbolCount} suggestion{markerSymbolCount > 1 ? "s" : ""} proche{markerSymbolCount > 1 ? "s" : ""}
                    </>
                  ) : (
                    <>
                      {markerSymbolCount} marqueur{markerSymbolCount > 1 ? "s" : ""}
                      {markerSymbolSearch.trim() ? " trouvé(s)" : " disponibles"}
                    </>
                  )}
                </div>

                <div className="max-h-[56vh] space-y-4 overflow-y-auto pr-1">

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
                            const isSelected = selectedMarkerSymbolId === option.id;

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  setMarkerBuiltinSymbol(option.id);
                                  if (markerSymbolSupportsFill(option.id)) {
                                    updateMarkerStyle({ markerFilled: true });
                                  }
                                  setActiveTool("marker");
                                  setMarkerSettingsStep("style");
                                }}
                                className={[
                                  "flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center transition",
                                  isSelected
                                    ? "border-blue-500 bg-blue-50 text-blue-700"
                                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
                                ].join(" ")}
                                title={option.label}
                              >
                                <MarkerSymbolPreview
                                  symbolId={option.id}
                                  color={markerStyle.color}
                                  opacity={1}
                                  size={30}
                                  weight={markerStrokeWeight}
                                  markerFilled={
                                    markerStyle.markerFilled === true &&
                                    markerSymbolSupportsFill(option.id)
                                  }
                                />
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
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2">
                  <MarkerSymbolPreview
                    symbolId={selectedMarkerSymbolId}
                    color={markerStyle.color}
                    opacity={1}
                    size={38}
                    weight={markerStrokeWeight}
                    markerFilled={markerFilledEnabled}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-neutral-900">
                      {
                        DROMAP_BUILTIN_MARKER_SYMBOLS.find(
                          (option) => option.id === selectedMarkerSymbolId,
                        )?.label
                      }
                    </div>
                    <button
                      type="button"
                      onClick={() => setMarkerSettingsStep("symbols")}
                      className="mt-1 rounded-md px-0 text-[11px] font-medium text-blue-600 hover:text-blue-800"
                    >
                      ← Revenir au choix du marqueur
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3">
                  <span>Couleur</span>
                  <input
                    type="color"
                    value={markerStyle.color}
                    onChange={(event) =>
                      updateMarkerStyle({ color: event.target.value })
                    }
                    className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>

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
                    <span>{markerStyle.markerSize}px</span>
                  </div>
                  <input
                    className="w-full"
                    type="range"
                    min={MIN_MARKER_SIZE}
                    max={MAX_MARKER_SIZE}
                    step="1"
                    value={markerStyle.markerSize}
                    onChange={(event) =>
                      updateMarkerStyle({
                        markerSize: Number(event.target.value),
                      })
                    }
                  />
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
                      step="1"
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

          {lineSettingsOpen ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-neutral-50 p-2">
                {LINE_TOOL_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => chooseLineTool(choice.value)}
                    className={[
                      "flex min-h-[5rem] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition",
                      lineToolChoice === choice.value
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    {choice.icon}
                    <span className="text-[11px] font-semibold">
                      {choice.label}
                    </span>
                    <span className="text-[10px] leading-snug text-neutral-500">
                      {choice.description}
                    </span>
                  </button>
                ))}
              </div>

              <label className="flex items-center justify-between gap-3">
                <span>Couleur</span>
                <input
                  type="color"
                  value={lineStyle.color}
                  onChange={(event) =>
                    updateLineStyle({ color: event.target.value })
                  }
                  className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>

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
                  step="1"
                  value={lineStyle.weight}
                  onChange={(event) =>
                    updateLineStyle({ weight: Number(event.target.value) })
                  }
                />
              </label>

              {lineToolChoice === "freehand" ? (
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
                    step="1"
                    value={lineStyle.freehandSmoothing ?? 0}
                    onChange={(event) =>
                      updateLineStyle({
                        freehandSmoothing: Number(event.target.value),
                      })
                    }
                  />
                  <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                    0% garde le trait brut. 100% nettoie très fortement les
                    tremblements du dessin libre.
                  </p>
                </label>
              ) : null}

              {lineToolChoice === "trace-line" ? (
                <p className="rounded-lg bg-blue-50 px-2 py-2 text-[11px] leading-snug text-blue-700">
                  Maintiens la souris près d’une frontière vectorielle visible :
                  le trait s’accroche à cette ligne et la suit jusqu’au relâchement.
                  Fonctionne sur les fonds blancs vectoriels, pays, régions et départements.
                </p>
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

          {zoneSettingsOpen ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-neutral-50 p-2">
                {ZONE_TOOL_CHOICES.map((choice) => {
                  const fillDisabled =
                    choice.value === "fill-zone" && !canUseFillToolOnCurrentBasemap;

                  return (
                    <button
                      key={choice.value}
                      type="button"
                      disabled={fillDisabled}
                      title={
                        fillDisabled
                          ? "Le remplissage est indisponible sur ce fond classique tant qu’aucune zone GeoJSON visible n’est disponible. Utilise un fond blanc/vectoriel ou affiche un calque GeoJSON polygonal."
                          : undefined
                      }
                      onClick={() => chooseZoneTool(choice.value)}
                      className={[
                        "flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition",
                        fillDisabled
                          ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 opacity-70"
                          : zoneToolChoice === choice.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                      ].join(" ")}
                    >
                      {choice.icon}
                      <span className="text-[11px] font-semibold">
                        {choice.label}
                      </span>
                      <span className="text-[10px] leading-snug text-neutral-500">
                        {fillDisabled
                          ? "Indisponible sur les fonds classiques."
                          : choice.description}
                      </span>
                    </button>
                  );
                })}
              </div>

              {zoneToolChoice === "shape" ? (
                <>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold text-neutral-600">
                      Type de forme
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {DROMAP_QUICK_SHAPES.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            updateZoneStyle({
                              zoneShapeKind: option.value as DroMapZoneShapeKind,
                            })
                          }
                          className={[
                            "flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition",
                            zoneStyle.zoneShapeKind === option.value
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
                          ].join(" ")}
                        >
                          <span className="text-lg font-black">
                            {option.value === "circle"
                              ? "○"
                              : option.value === "ellipse"
                                ? "⬭"
                                : "▭"}
                          </span>
                          <span className="text-[11px] font-semibold">
                            {option.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="rounded-lg bg-blue-50 px-2 py-2 text-[11px] leading-snug text-blue-700">
                    Pose : premier clic pour le premier point, deuxième clic pour le point opposé. Modification : utilise les poignées bleues sur la carte. Le cercle n’a pas de rotation.
                  </p>
                </>
              ) : null}

              {zoneToolChoice === "fill-zone" ? (
                <div className="space-y-2 rounded-lg bg-blue-50 px-2 py-2 text-[11px] leading-snug text-blue-700">
                  <p>
                    Clique une région, un département, un pays ou une subdivision visible sur les fonds vectoriels. La zone créée reprend les paramètres visibles actuels.
                  </p>
                  <p>
                    Garde au moins un fond ou un contour pour éviter une zone invisible.
                  </p>
                </div>
              ) : null}


              {zoneToolChoice === "freehand-zone" ? (
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
                    step="1"
                    value={zoneStyle.freehandSmoothing ?? 0}
                    onChange={(event) =>
                      updateZoneStyle({
                        freehandSmoothing: Number(event.target.value),
                      })
                    }
                  />
                  <p className="mt-1 text-[10px] leading-snug text-neutral-500">
                    0% garde le contour brut. 100% nettoie très fortement les
                    tremblements de la zone libre.
                  </p>
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
                <label className="flex items-center justify-between gap-3">
                  <span>Couleur contour</span>
                  <input
                    type="color"
                    value={zoneStyle.color}
                    onChange={(event) =>
                      updateZoneStyle({ color: event.target.value })
                    }
                    className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              ) : null}

              {zoneFillEnabled ? (
                <label className="flex items-center justify-between gap-3">
                  <span>Couleur fond</span>
                  <input
                    type="color"
                    value={zoneStyle.fillColor}
                    onChange={(event) =>
                      updateZoneStyle({ fillColor: event.target.value })
                    }
                    className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
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

                  <label className="block">
                    <div className="mb-1 flex justify-between">
                      <span>Épaisseur contour</span>
                      <span>{zoneStyle.weight}px</span>
                    </div>
                    <input
                      className="w-full"
                      type="range"
                      min="1"
                      max="12"
                      step="1"
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
                  <label className="flex items-center justify-between gap-3">
                    <span>Couleur hachures</span>
                    <input
                      type="color"
                      value={zoneStyle.zoneHatchingColor}
                      onChange={(event) =>
                        updateZoneStyle({
                          zoneHatchingColor: event.target.value,
                        })
                      }
                      className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

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
                      step="1"
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
                      step="1"
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
                  <label className="flex items-center justify-between gap-3">
                    <span>Couleur points</span>
                    <input
                      type="color"
                      value={zoneStyle.zoneDotsColor}
                      onChange={(event) =>
                        updateZoneStyle({
                          zoneDotsColor: event.target.value,
                        })
                      }
                      className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

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
                      step="1"
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

          {openSettingsTool === "text" ? (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span>Couleur</span>
                <input
                  type="color"
                  value={textStyle.color}
                  onChange={(event) =>
                    updateTextStyle({ color: event.target.value })
                  }
                  className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>

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

              <label className="block">
                <div className="mb-1 flex justify-between">
                  <span>Taille</span>
                  <span>{textStyle.fontSize}px</span>
                </div>
                <input
                  className="w-full"
                  type="range"
                  min={MIN_TEXT_FONT_SIZE}
                  max={MAX_TEXT_FONT_SIZE}
                  step="1"
                  value={textStyle.fontSize}
                  onChange={(event) =>
                    updateTextStyle({
                      fontSize: Number(event.target.value),
                    })
                  }
                />
              </label>

              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2">
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
              </div>

              {textStyle.textBackgroundEnabled ? (
                <>
                  <label className="flex items-center justify-between gap-3">
                    <span>Couleur fond</span>
                    <input
                      type="color"
                      value={textStyle.textBackgroundColor}
                      onChange={(event) =>
                        updateTextStyle({
                          textBackgroundColor: event.target.value,
                        })
                      }
                      className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

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
                  <label className="flex items-center justify-between gap-3">
                    <span>Couleur cadre</span>
                    <input
                      type="color"
                      value={textStyle.textBorderColor}
                      onChange={(event) =>
                        updateTextStyle({
                          textBorderColor: event.target.value,
                        })
                      }
                      className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>

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
                      step="1"
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
    </div>
  );
}
