"use client";

import { DromapAiAssistantIcon } from "@/components/dromap-product/ai-assistant-icon";

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { useEditorModeStore } from "@/stores/editor-mode";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { useEditorToolStore } from "@/stores/editor-tool";
import { useDromapProductRuntime } from "@/components/dromap-product/product-runtime";
import { useDromapProductStore } from "@/stores/dromap-product";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";

import { buildDroMapAiProjectContext } from "./dromap-ai-context";
import {
  canUndoLastDroMapAiPlan,
  cancelDroMapAiPreview,
  commitDroMapAiPreview,
  executeDroMapAiPlan,
  establishDroMapAiWorkspaceAroundFeatures,
  hasActiveDroMapAiPreview,
  importDroMapAiSelectedBuildings,
  importDroMapAiSelectedRoutes,
  prepareDroMapAiAutomaticWorkspaceProposal,
  prepareDroMapAiAutomaticRouteWorkspaceProposal,
  prepareDroMapAiBuildingSelection,
  prepareDroMapAiRouteSelection,
  restoreDroMapAiWorkspaceZoneLock,
  stageDroMapAiWorkspaceProposalForReview,
  undoLastDroMapAiPlan,
  type DroMapAiAutomaticWorkspaceProposal,
  type DroMapAiBuildingSelectionImportResult,
  type DroMapAiBuildingSelectionPreparation,
  type DroMapAiRouteSelectionImportResult,
  type DroMapAiRouteSelectionPreparation,
  type DroMapAiExecutionResult,
} from "./dromap-ai-executor";
import type { BuildingSelectionFeature } from "./building-selection-modal";
import type { RouteSelectionFeature } from "./route-selection-modal";
import type {
  DroMapAiApiResponse,
  DroMapAiBounds,
  DroMapAiCommand,
  DroMapAiPlan,
  DroMapAiPrePlanQuestion,
  DroMapAiWorkspaceMode,
} from "./dromap-ai-types";

const BuildingSelectionModal = dynamic(
  () =>
    import("./building-selection-modal").then(
      (module) => module.BuildingSelectionModal,
    ),
  { ssr: false },
);

const RouteSelectionModal = dynamic(
  () =>
    import("./route-selection-modal").then(
      (module) => module.RouteSelectionModal,
    ),
  { ssr: false },
);

function isSilentAutomaticCompositionCommand(command: DroMapAiCommand) {
  return (
    (command.type === "configure_scale" && command.id === "echelle-ia") ||
    (command.type === "configure_north_arrow" && command.id === "nord-ia")
  );
}


type ApiErrorPayload = {
  error?: string;
};

function commandTitle(command: DroMapAiCommand) {
  switch (command.type) {
    case "set_workspace_by_place":
      return `Créer la zone autour de ${command.place ?? "un lieu"}`;
    case "set_workspace_bounds":
      return "Définir précisément la zone de travail";
    case "select_world":
      return "Sélectionner le monde entier";
    case "fit_view":
      return "Recadrer la vue";
    case "set_basemap":
      return `Choisir le fond ${command.basemapId ?? "cartographique"}`;
    case "set_country_neighbors":
      return "Configurer le contexte des pays voisins";
    case "create_layer":
      return `Créer le calque ${command.layerName ?? "Calque IA"}`;
    case "set_active_layer":
      return "Choisir le calque actif";
    case "configure_layer":
      return `Configurer le calque ${command.layerName ?? command.layerRef ?? "ciblé"}`;
    case "reorder_layer":
      return "Réordonner un calque DroMap";
    case "delete_layer":
      return "Supprimer un calque DroMap";
    case "import_geojson_catalog":
      return `Importer le jeu GeoJSON ${command.geoJsonCatalogId ?? "du catalogue"}`;
    case "import_geojson_url":
      return "Importer un GeoJSON depuis une source distante";
    case "create_geojson_layer":
      return `Créer le calque GeoJSON ${command.layerName ?? "Données IA"}`;
    case "configure_geojson_layer":
      return "Configurer un calque GeoJSON";
    case "reorder_geojson_layer":
      return "Réordonner un calque GeoJSON";
    case "delete_geojson_layer":
      return "Supprimer un calque GeoJSON";
    case "convert_geojson_to_dromap":
      return "Transformer le GeoJSON en objets DroMap";
    case "convert_dromap_to_geojson":
      return "Reconvertir le calque DroMap en GeoJSON léger";
    case "import_buildings": {
      const targetCount =
        command.buildingQueries.length ||
        (command.buildingSelectionMode === "named" ? command.places.length : 0);
      const scope =
        command.buildingSelectionMode === "named" || targetCount > 0
          ? `${targetCount || "les"} bâtiment${targetCount > 1 ? "s" : ""} ciblé${targetCount > 1 ? "s" : ""}`
          : "tous les bâtiments de la zone";
      return `Délimiter la zone utile puis sélectionner ${scope} (${command.buildingMode === "dromap" ? "objets individuels" : "calque léger"})`;
    }
    case "import_routes": {
      const categoryCount = command.roadCategories.length;
      const scope = command.roadSelectionMode === "named" && command.roadQueries.length
        ? command.roadQueries.join(", ")
        : categoryCount
          ? `${categoryCount} niveau${categoryCount > 1 ? "x" : ""} de routes`
          : "les routes de la zone";
      return `Délimiter la zone utile puis sélectionner ${scope} (calque GeoJSON)`;
    }
    case "create_custom_marker_svg":
      return `Créer le marqueur personnalisé ${command.label ?? "IA"}`;
    case "delete_custom_marker":
      return "Retirer un marqueur de la bibliothèque";
    case "create_marker":
      return `Créer le marqueur ${command.label ?? command.place ?? "sans nom"}`;
    case "create_text":
      return `Ajouter le texte ${command.label ?? "sans nom"}`;
    case "create_line":
      return `Tracer ${command.lineVariant === "freehand" ? "un dessin libre" : command.style.arrowEnd || command.style.arrowStart ? "une flèche" : "une ligne"}${command.label ? ` : ${command.label}` : ""}`;
    case "create_zone":
      return `Créer ${command.zoneVariant === "freehand" ? "une zone libre" : "une zone"}${command.label ? ` : ${command.label}` : ""}`;
    case "create_shape":
      return `Créer une forme ${command.shapeKind ?? "géométrique"}`;
    case "fill_boundary":
      return `Remplir le contour ${command.label ?? command.place ?? "sélectionné"}`;
    case "create_proportional_markers":
      return `Créer ${command.seriesItems.length} figuré${command.seriesItems.length > 1 ? "s" : ""} proportionnel${command.seriesItems.length > 1 ? "s" : ""}`;
    case "create_proportional_flows":
      return `Créer ${command.seriesItems.length} flux proportionnel${command.seriesItems.length > 1 ? "s" : ""}`;
    case "create_choropleth":
      return `Créer une carte choroplèthe en ${command.classes.length} classe${command.classes.length > 1 ? "s" : ""}`;
    case "update_features":
      return "Modifier les objets ciblés";
    case "duplicate_features":
      return "Dupliquer les objets ciblés";
    case "reorder_features":
      return "Modifier l'ordre des objets ciblés";
    case "delete_features":
      return "Supprimer les objets ciblés";
    case "configure_legend":
      return `Configurer la légende${command.legendPosition ? ` (${command.legendPosition})` : ""}`;
    case "configure_map_title":
      return "Configurer le titre de la carte";
    case "align_legend_sizes_with_map":
      return "Aligner les tailles carte / légende";
    case "configure_basemap_render":
      return "Configurer les écritures et le détail du fond";
    case "add_manual_legend_entry":
      return `Ajouter à la légende : ${command.label ?? "élément"}`;
    case "update_manual_legend_entry":
      return "Modifier un élément manuel de légende";
    case "delete_manual_legend_entry":
      return "Supprimer un élément manuel de légende";
    case "configure_legend_group":
      return "Configurer un groupe de légende";
    case "configure_feature_legend":
      return "Organiser la légende liée aux objets";
    case "configure_scale":
      return "Configurer l'échelle";
    case "configure_north_arrow":
      return "Configurer la flèche du nord";
    case "configure_map_labels":
      return "Configurer les étiquettes cartographiques";
    case "select_feature":
      return "Sélectionner un objet";
    case "clear_selection":
      return "Effacer la sélection";
    case "open_export_preview":
      return "Ouvrir Préparer l'export";
    default: {
      const exhaustive: never = command.type;
      return exhaustive;
    }
  }
}

function formatFactValue(value: number | string | null, unit: string | null) {
  if (value === null) {
    return "Valeur non chiffrée";
  }

  const formatted =
    typeof value === "number" ? value.toLocaleString("fr-FR") : value;
  return unit ? `${formatted} ${unit}` : formatted;
}


const DROMAP_AI_CHAT_STORAGE_KEY_PREFIX = "dromap-ai-conversation-v2";
const LEGACY_CHAT_STORAGE_KEY = "dromap-ai-conversation-v1";
const LEGACY_HISTORY_STORAGE_KEY = "dromap-ai-request-history-v1";
const MAX_CHAT_MESSAGES = 100;

type DroMapAiChatRole = "user" | "assistant" | "system" | "error";

type DroMapAiChatMessage = {
  id: string;
  role: DroMapAiChatRole;
  text: string;
  createdAt: string;
};

function createClientId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getConversationStorageKey(projectId: string | null) {
  return `${DROMAP_AI_CHAT_STORAGE_KEY_PREFIX}:${projectId ?? "standalone"}`;
}

function readConversation(storageKey: string) {
  if (typeof window === "undefined") return [] as DroMapAiChatMessage[];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is DroMapAiChatMessage =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as DroMapAiChatMessage).id === "string" &&
          typeof (item as DroMapAiChatMessage).text === "string" &&
          ["user", "assistant", "system", "error"].includes(
            (item as DroMapAiChatMessage).role,
          ),
      )
      .slice(-MAX_CHAT_MESSAGES);
  } catch {
    return [];
  }
}

function writeConversation(
  storageKey: string,
  messages: DroMapAiChatMessage[],
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    storageKey,
    JSON.stringify(messages.slice(-MAX_CHAT_MESSAGES)),
  );
}

type StepAdjustmentOption = {
  id: string;
  label: string;
  instruction: string;
};

type StepAdjustmentQuestion = {
  id: string;
  label: string;
  options: StepAdjustmentOption[];
};

function getStepAdjustmentQuestions(
  command: DroMapAiCommand,
): StepAdjustmentQuestion[] {
  const questions: StepAdjustmentQuestion[] = [];

  if (
    ["create_marker", "create_custom_marker_svg", "create_proportional_markers"].includes(
      command.type,
    )
  ) {
    questions.push(
      {
        id: "marker-symbol",
        label: "Quel type de symbole privilégier ?",
        options: [
          {
            id: "builtin",
            label: "Pictogramme DroMap",
            instruction:
              "Privilégie un pictogramme intégré DroMap s’il représente correctement le sujet.",
          },
          {
            id: "custom",
            label: "Personnalisé si plus pertinent",
            instruction:
              "Crée un marqueur personnalisé SVG si cela représente mieux le sujet qu’un pictogramme intégré, et enregistre-le dans Mes marqueurs.",
          },
        ],
      },
      {
        id: "marker-label",
        label: "Étiquette sur la carte",
        options: [
          {
            id: "show",
            label: "Afficher",
            instruction: "Affiche clairement l’étiquette du marqueur sur la carte.",
          },
          {
            id: "inherit",
            label: "Automatique",
            instruction: "Laisse la visibilité de l’étiquette suivre le réglage général.",
          },
          {
            id: "hide",
            label: "Masquer",
            instruction: "Masque l’étiquette de ce marqueur sur la carte.",
          },
        ],
      },
      {
        id: "marker-emphasis",
        label: "Importance visuelle",
        options: [
          {
            id: "discreet",
            label: "Discrète",
            instruction: "Rends le figuré plutôt discret sans perdre sa lisibilité.",
          },
          {
            id: "balanced",
            label: "Équilibrée",
            instruction: "Utilise une importance visuelle équilibrée et cohérente avec le reste de la carte.",
          },
          {
            id: "strong",
            label: "Forte",
            instruction: "Donne au figuré une importance visuelle forte et clairement perceptible.",
          },
        ],
      },
    );
  }

  if (["create_line", "create_proportional_flows"].includes(command.type)) {
    questions.push(
      {
        id: "line-style",
        label: "Style du trait",
        options: [
          { id: "discreet", label: "Discret", instruction: "Utilise un trait discret et lisible." },
          { id: "strong", label: "Contrasté", instruction: "Utilise un trait plus contrasté et visuellement prioritaire." },
        ],
      },
      {
        id: "line-arrow",
        label: "Sens du mouvement",
        options: [
          { id: "arrow", label: "Avec flèche", instruction: "Montre clairement le sens avec une pointe de flèche." },
          { id: "plain", label: "Sans flèche", instruction: "Utilise un trait sans pointe de flèche." },
        ],
      },
    );
  }

  if (["create_zone", "create_shape", "fill_boundary", "create_choropleth"].includes(command.type)) {
    questions.push(
      {
        id: "zone-style",
        label: "Traitement visuel de la zone",
        options: [
          { id: "light", label: "Léger", instruction: "Utilise un remplissage léger et un contour discret." },
          { id: "balanced", label: "Équilibré", instruction: "Utilise un contraste équilibré entre remplissage et contour." },
          { id: "strong", label: "Marqué", instruction: "Renforce visuellement la zone sans nuire aux autres informations." },
        ],
      },
    );
  }

  if (["import_buildings", "import_routes", "import_geojson_catalog", "import_geojson_url", "create_geojson_layer"].includes(command.type)) {
    questions.push({
      id: "data-weight",
      label: "Priorité pour les données",
      options: [
        { id: "detail", label: "Précision", instruction: "Privilégie la précision et la fidélité des données." },
        { id: "speed", label: "Fluidité", instruction: "Privilégie un rendu plus léger et fluide lorsque le volume est important." },
      ],
    });
  }

  if (command.type === "import_routes") {
    questions.push(
      {
        id: "road-detail",
        label: "Niveau de routes",
        options: [
          { id: "motorways", label: "Autoroutes", instruction: "Limite l'import aux autoroutes principales." },
          { id: "main", label: "Grands axes", instruction: "Inclue les autoroutes et routes nationales/principales pertinentes." },
          { id: "secondary", label: "Avec secondaires", instruction: "Inclue aussi les départementales/secondaires ; adapte la zone pour rester compatible avec ce niveau de détail." },
          { id: "local", label: "Avec petites routes", instruction: "Inclue les petites routes uniquement sur une zone suffisamment petite pour rester exploitable." },
        ],
      },
      {
        id: "road-scope",
        label: "Sélection dans le réseau",
        options: [
          { id: "all", label: "Toutes les routes du niveau", instruction: "Présélectionne toutes les routes correspondant aux catégories retenues." },
          { id: "named", label: "Axes ciblés", instruction: "Présélectionne uniquement les axes nommés ou référencés dans la demande, tout en conservant les routes déjà importées comme sélection de départ." },
        ],
      },
    );
  }

  if (command.type === "import_buildings") {
    questions.push(
      {
        id: "building-scope",
        label: "Quel périmètre présélectionner ?",
        options: [
          {
            id: "strict",
            label: "Emprise stricte",
            instruction:
              "Resserre la zone de recherche et la présélection sur les bâtiments directement rattachés aux établissements demandés.",
          },
          {
            id: "campus",
            label: "Ensemble du campus / site",
            instruction:
              "Inclue dans la présélection les différents bâtiments du campus ou du site lorsqu'ils forment un ensemble cohérent.",
          },
          {
            id: "annexes",
            label: "Avec annexes proches",
            instruction:
              "Inclue aussi les annexes proches plausiblement rattachées au site ; l'utilisateur les vérifiera ensuite dans le sélecteur.",
          },
        ],
      },
      {
        id: "building-search-area",
        label: "Étendue de la zone de recherche",
        options: [
          {
            id: "tight",
            label: "Très ciblée",
            instruction:
              "Utilise une zone de recherche serrée autour des établissements demandés.",
          },
          {
            id: "context",
            label: "Avec un peu de contexte",
            instruction:
              "Garde une petite marge autour des établissements pour permettre à l'utilisateur de corriger facilement la sélection.",
          },
        ],
      },
    );
  }

  if (
    [
      "configure_legend",
      "configure_feature_legend",
      "configure_legend_group",
      "align_legend_sizes_with_map",
    ].includes(command.type)
  ) {
    questions.push(
      {
        id: "legend-position",
        label: "Où placer la légende ?",
        options: [
          { id: "right", label: "À droite", instruction: "Place la légende à droite de la carte." },
          { id: "map", label: "Sur la carte", instruction: "Place la légende directement sur la carte dans une zone peu occupée." },
          { id: "bottom", label: "En bas", instruction: "Place la légende sous la carte." },
          { id: "left", label: "À gauche", instruction: "Place la légende à gauche de la carte." },
        ],
      },
      {
        id: "legend-structure",
        label: "Organisation",
        options: [
          { id: "compact", label: "Compacte", instruction: "Rends la légende compacte, avec seulement les groupes utiles et des libellés courts mais complets." },
          { id: "detailed", label: "Détaillée", instruction: "Organise la légende avec des sous-titres explicites et une hiérarchie détaillée." },
        ],
      },
      {
        id: "legend-size",
        label: "Taille des figurés",
        options: [
          { id: "match", label: "Comme sur la carte", instruction: "Aligne les tailles des figurés de légende sur leurs objets correspondants sur la carte." },
          { id: "uniform", label: "Uniformes", instruction: "Conserve des tailles de figurés de légende uniformes et lisibles." },
        ],
      },
    );
  }

  if (command.type === "configure_map_title") {
    questions.push(
      {
        id: "title-position",
        label: "Position du titre",
        options: [
          { id: "top", label: "Haut-centre", instruction: "Place le titre en haut et centré." },
          { id: "free", label: "Position libre", instruction: "Choisis une position libre qui évite la légende, l’échelle et la flèche nord." },
        ],
      },
      {
        id: "title-emphasis",
        label: "Importance du titre",
        options: [
          { id: "discreet", label: "Discret", instruction: "Utilise un titre discret." },
          { id: "strong", label: "Principal", instruction: "Fais du titre un élément principal clairement lisible." },
        ],
      },
    );
  }

  if (command.type === "configure_scale") {
    questions.push({
      id: "scale-position",
      label: "Position de l’échelle",
      options: [
        { id: "bottom-left", label: "Bas gauche", instruction: "Place l’échelle en bas à gauche." },
        { id: "bottom-right", label: "Bas droite", instruction: "Place l’échelle en bas à droite." },
        { id: "top-left", label: "Haut gauche", instruction: "Place l’échelle en haut à gauche." },
      ],
    });
  }

  if (command.type === "configure_north_arrow") {
    questions.push({
      id: "north-position",
      label: "Position de la flèche nord",
      options: [
        { id: "top-right", label: "Haut droite", instruction: "Place la flèche nord en haut à droite." },
        { id: "top-left", label: "Haut gauche", instruction: "Place la flèche nord en haut à gauche." },
        { id: "bottom-right", label: "Bas droite", instruction: "Place la flèche nord en bas à droite." },
      ],
    });
  }

  if (["set_workspace_by_place", "set_workspace_bounds", "select_world"].includes(command.type)) {
    questions.push({
      id: "workspace-padding",
      label: "Cadrage de la zone",
      options: [
        { id: "tight", label: "Serré", instruction: "Définis une zone assez serrée autour du territoire utile." },
        { id: "context", label: "Avec contexte", instruction: "Ajoute une marge raisonnable autour du territoire principal pour donner du contexte." },
      ],
    });
  }

  if (!questions.length) {
    questions.push({
      id: "generic-priority",
      label: "Priorité de cette étape",
      options: [
        { id: "simple", label: "Simple", instruction: "Simplifie cette étape et garde uniquement ce qui est utile." },
        { id: "balanced", label: "Équilibrée", instruction: "Garde une solution équilibrée, lisible et cohérente avec le reste de la carte." },
        { id: "detailed", label: "Plus précise", instruction: "Rends cette étape plus précise et détaillée sans ajouter d’éléments inutiles." },
      ],
    });
  }

  return questions;
}

type DroMapAiPanelProps = {
  docked?: boolean;
};

type DroMapAiBuildingFlowSelection = {
  commandId: string;
  selectedCount: number;
  createdFeatureIds: string[];
  createdLayerNames: string[];
  groups: Array<{
    label: string;
    count: number;
  }>;
};

type DroMapAiBuildingFlowState = {
  originalPrompt: string;
  commands: DroMapAiCommand[];
  currentIndex: number;
  selections: DroMapAiBuildingFlowSelection[];
};

type DroMapAiAutomaticBuildingZoneReview = {
  proposal: DroMapAiAutomaticWorkspaceProposal;
  awaitingValidation: boolean;
  restoreZoneLock: boolean;
};

type DroMapAiRouteFlowSelection = {
  commandId: string;
  selectedCount: number;
  layerName: string | null;
  categories: DroMapAiRouteSelectionImportResult["categories"];
};

type DroMapAiRouteFlowState = {
  originalPrompt: string;
  commands: DroMapAiCommand[];
  currentIndex: number;
  selections: DroMapAiRouteFlowSelection[];
};

type DroMapAiAutomaticRouteZoneReview = {
  proposal: DroMapAiAutomaticWorkspaceProposal;
  awaitingValidation: boolean;
  restoreZoneLock: boolean;
};

export function DroMapAiPanel({ docked = false }: DroMapAiPanelProps = {}) {
  const {
    enabled: productRuntimeEnabled,
    projectId: productProjectId,
  } = useDromapProductRuntime();
  const setProjectAiConversation = useDromapProductStore(
    (state) => state.setProjectAiConversation,
  );
  const conversationStorageKey = useMemo(
    () => getConversationStorageKey(productProjectId),
    [productProjectId],
  );
  const currentMode = useEditorModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const clearWorkspaceBounds = useEditorWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const modifyWorkspaceZone = useEditorWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );
  const requestControllerRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<DroMapAiChatMessage[]>([]);
  const currentTaskPromptRef = useRef("");

  const [hasMounted, setHasMounted] = useState(false);
  const workspaceValidated =
    hasMounted && currentMode === "edit" && workspaceBounds !== null;

  const [isOpen, setIsOpen] = useState(false);
  const [panelZIndex, setPanelZIndex] = useState(getInitialFloatingPanelZIndex());
  const [workspaceMode, setWorkspaceMode] =
    useState<DroMapAiWorkspaceMode | null>(null);
  const [pendingManualWorkspace, setPendingManualWorkspace] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<DroMapAiPlan | null>(null);
  const [prePlanQuestions, setPrePlanQuestions] = useState<DroMapAiPrePlanQuestion[]>([]);
  const [prePlanAnswers, setPrePlanAnswers] = useState<Record<string, string[]>>({});
  const [grounded, setGrounded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRevisingStep, setIsRevisingStep] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [stepInstruction, setStepInstruction] = useState("");
  const [stepQuestionAnswers, setStepQuestionAnswers] = useState<
    Record<string, Record<string, string>>
  >({});
  const [executionResult, setExecutionResult] =
    useState<DroMapAiExecutionResult | null>(null);
  const [previewResult, setPreviewResult] =
    useState<DroMapAiExecutionResult | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [messages, setMessages] = useState<DroMapAiChatMessage[]>([]);
  const [buildingFlow, setBuildingFlow] =
    useState<DroMapAiBuildingFlowState | null>(null);
  const [buildingPreparation, setBuildingPreparation] =
    useState<DroMapAiBuildingSelectionPreparation | null>(null);
  const [isPreparingBuildings, setIsPreparingBuildings] = useState(false);
  const [automaticBuildingZoneReview, setAutomaticBuildingZoneReview] =
    useState<DroMapAiAutomaticBuildingZoneReview | null>(null);
  const validatedAutomaticBuildingBoundsRef = useRef<DroMapAiBounds | null>(null);
  const [isAiSuspendedForBuildingSelection, setIsAiSuspendedForBuildingSelection] =
    useState(false);
  const [routeFlow, setRouteFlow] = useState<DroMapAiRouteFlowState | null>(null);
  const [routePreparation, setRoutePreparation] =
    useState<DroMapAiRouteSelectionPreparation | null>(null);
  const [isPreparingRoutes, setIsPreparingRoutes] = useState(false);
  const [automaticRouteZoneReview, setAutomaticRouteZoneReview] =
    useState<DroMapAiAutomaticRouteZoneReview | null>(null);
  const validatedAutomaticRouteBoundsRef = useRef<DroMapAiBounds | null>(null);
  const [isAiSuspendedForRouteSelection, setIsAiSuspendedForRouteSelection] =
    useState(false);

  const modeReady =
    workspaceMode === "automatic" ||
    (workspaceMode === "manual" && workspaceValidated);
  const canGenerate =
    modeReady &&
    prompt.trim().length >= 2 &&
    !isGenerating &&
    !isApplying &&
    !isRevisingStep;
  const isAiWorking =
    isGenerating || isApplying || isRevisingStep || isPreparingBuildings || isPreparingRoutes;
  const aiWorkingLabel = isApplying
    ? "Application sur la carte…"
    : isRevisingStep
      ? "Ajustement de l’étape…"
      : "L’IA prépare sa réponse…";
  const buildingCommandsInPlan = useMemo(
    () => plan?.commands.filter((command) => command.type === "import_buildings") ?? [],
    [plan],
  );
  const routeCommandsInPlan = useMemo(
    () => plan?.commands.filter((command) => command.type === "import_routes") ?? [],
    [plan],
  );
  const visiblePlanCommandEntries = useMemo(
    () =>
      (plan?.commands ?? [])
        .map((command, index) => ({ command, index }))
        .filter(({ command }) => !isSilentAutomaticCompositionCommand(command)),
    [plan],
  );
  const isBuildingSelectionPlan = buildingCommandsInPlan.length > 0;
  const isRouteSelectionPlan = routeCommandsInPlan.length > 0;
  const isAutomaticBuildingZonePending = Boolean(
    isBuildingSelectionPlan &&
      workspaceMode === "automatic" &&
      automaticBuildingZoneReview?.awaitingValidation,
  );
  const isAutomaticRouteZonePending = Boolean(
    isRouteSelectionPlan &&
      workspaceMode === "automatic" &&
      automaticRouteZoneReview?.awaitingValidation,
  );
  const showAutomaticZoneOnlyGuidance = Boolean(
    (isAutomaticBuildingZonePending && automaticBuildingZoneReview) ||
      (isAutomaticRouteZonePending && automaticRouteZoneReview),
  );
  const automaticSelectionKind = isAutomaticRouteZonePending ? "routes" : "bâtiments";
  const showBuildingSelectionLoading = Boolean(
    isAiSuspendedForBuildingSelection &&
      isPreparingBuildings &&
      !buildingPreparation,
  );
  const showRouteSelectionLoading = Boolean(
    isAiSuspendedForRouteSelection && isPreparingRoutes && !routePreparation,
  );
  const canApply = Boolean(
    modeReady &&
      plan &&
      plan.commands.length > 0 &&
      !isBuildingSelectionPlan &&
      !isRouteSelectionPlan &&
      !isApplying &&
      !isGenerating &&
      !isRevisingStep &&
      !isPreparingBuildings &&
      !isPreparingRoutes,
  );
  const commandCountLabel = useMemo(() => {
    const count = visiblePlanCommandEntries.length;
    return `${count} action${count > 1 ? "s" : ""}`;
  }, [visiblePlanCommandEntries]);

  useEffect(() => {
    const closeWhenPlaceSearchOpens = () => {
      setIsOpen(false);
    };

    window.addEventListener("dromap:open-place-search", closeWhenPlaceSearchOpens);
    return () => {
      window.removeEventListener("dromap:open-place-search", closeWhenPlaceSearchOpens);
    };
  }, []);

  useEffect(() => {
    if (hasActiveDroMapAiPreview()) {
      cancelDroMapAiPreview();
    }
    setHasMounted(true);
    setUndoAvailable(canUndoLastDroMapAiPlan());
    window.localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);

    return () => {
      if (hasActiveDroMapAiPreview()) {
        cancelDroMapAiPreview();
      }
    };
  }, []);

  useEffect(() => {
    const localMessages = readConversation(conversationStorageKey);
    const project = productProjectId
      ? useDromapProductStore
          .getState()
          .projects.find((item) => item.id === productProjectId)
      : null;
    const projectMessages = Array.isArray(project?.aiConversation)
      ? (project.aiConversation as DroMapAiChatMessage[])
      : [];
    // Le projet est la source persistante. Le stockage navigateur reste un cache et
    // permet de migrer les discussions créées par la version précédente du panneau.
    const storedMessages =
      projectMessages.length > 0 ? projectMessages.slice(-MAX_CHAT_MESSAGES) : localMessages;
    messagesRef.current = storedMessages;
    setMessages(storedMessages);
    if (productProjectId && projectMessages.length === 0 && localMessages.length > 0) {
      setProjectAiConversation(productProjectId, localMessages);
    }
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});
    setExecutionResult(null);
    setEditingCommandId(null);
    setStepInstruction("");
    setStepQuestionAnswers({});
    setBuildingFlow(null);
    setBuildingPreparation(null);
    setIsPreparingBuildings(false);
    setIsAiSuspendedForBuildingSelection(false);
    setRouteFlow(null);
    setRoutePreparation(null);
    setIsPreparingRoutes(false);
    setIsAiSuspendedForRouteSelection(false);
    setAutomaticRouteZoneReview((current) => {
      if (current?.restoreZoneLock) {
        restoreDroMapAiWorkspaceZoneLock(true);
      }
      return null;
    });
    validatedAutomaticRouteBoundsRef.current = null;
    setAutomaticBuildingZoneReview((current) => {
      if (current?.restoreZoneLock) {
        restoreDroMapAiWorkspaceZoneLock(true);
      }
      return null;
    });
    validatedAutomaticBuildingBoundsRef.current = null;
    currentTaskPromptRef.current = "";
    setError(null);
  }, [conversationStorageKey, productProjectId, setProjectAiConversation]);

  useEffect(() => {
    if (!pendingManualWorkspace || !workspaceValidated) return;
    setPendingManualWorkspace(false);
    setWorkspaceMode("manual");
    setIsOpen(true);
    setError(null);
    appendMessage(
      "system",
      "Zone manuelle validée. Tu peux maintenant décrire la carte à créer ou la modification à effectuer.",
    );
  }, [pendingManualWorkspace, workspaceValidated]);

  useEffect(() => {
    if (
      !automaticBuildingZoneReview?.awaitingValidation ||
      workspaceMode !== "automatic" ||
      !workspaceValidated ||
      !workspaceBounds ||
      !buildingFlow
    ) {
      return;
    }

    const validatedBounds: DroMapAiBounds = {
      south: workspaceBounds.southWest.lat,
      west: workspaceBounds.southWest.lng,
      north: workspaceBounds.northEast.lat,
      east: workspaceBounds.northEast.lng,
    };
    // À partir de la validation, la zone réellement choisie par l'utilisateur
    // devient la seule emprise autorisée pour la recherche des bâtiments.
    // Elle peut être différente de la proposition initiale de l'IA.
    validatedAutomaticBuildingBoundsRef.current = validatedBounds;

    restoreDroMapAiWorkspaceZoneLock(
      automaticBuildingZoneReview.restoreZoneLock,
    );
    setAutomaticBuildingZoneReview({
      ...automaticBuildingZoneReview,
      awaitingValidation: false,
      restoreZoneLock: false,
    });
    setIsOpen(false);
    setError(null);

    void openCurrentBuildingSelection(validatedBounds);
  }, [
    automaticBuildingZoneReview,
    buildingFlow,
    workspaceMode,
    workspaceValidated,
    workspaceBounds,
  ]);

  useEffect(() => {
    if (
      !automaticRouteZoneReview?.awaitingValidation ||
      workspaceMode !== "automatic" ||
      !workspaceValidated ||
      !workspaceBounds ||
      !routeFlow
    ) {
      return;
    }

    const validatedBounds: DroMapAiBounds = {
      south: workspaceBounds.southWest.lat,
      west: workspaceBounds.southWest.lng,
      north: workspaceBounds.northEast.lat,
      east: workspaceBounds.northEast.lng,
    };
    // Comme pour les bâtiments, la zone effectivement validée par l'utilisateur
    // devient autoritaire. L'IA ne revient jamais à sa proposition précédente.
    validatedAutomaticRouteBoundsRef.current = validatedBounds;
    restoreDroMapAiWorkspaceZoneLock(automaticRouteZoneReview.restoreZoneLock);
    setAutomaticRouteZoneReview({
      ...automaticRouteZoneReview,
      awaitingValidation: false,
      restoreZoneLock: false,
    });
    setIsOpen(false);
    setError(null);
    void openCurrentRouteSelection(validatedBounds);
  }, [
    automaticRouteZoneReview,
    routeFlow,
    workspaceMode,
    workspaceValidated,
    workspaceBounds,
  ]);

  useEffect(() => {
    if (workspaceMode !== "manual" || workspaceValidated) return;
    if (hasActiveDroMapAiPreview()) {
      cancelDroMapAiPreview();
      setPreviewResult(null);
    }
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});
    setExecutionResult(null);
    setBuildingFlow(null);
    setBuildingPreparation(null);
    setIsPreparingBuildings(false);
    setRouteFlow(null);
    setRoutePreparation(null);
    setIsPreparingRoutes(false);
    setIsGenerating(false);
    setIsApplying(false);
    setIsRevisingStep(false);
  }, [workspaceMode, workspaceValidated]);

  useEffect(() => {
    const element = chatScrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, isGenerating, isRevisingStep]);

  function persistMessages(nextMessages: DroMapAiChatMessage[]) {
    const limited = nextMessages.slice(-MAX_CHAT_MESSAGES);
    messagesRef.current = limited;
    setMessages(limited);
    // Cache immédiat pour résister à un rechargement brutal du navigateur.
    writeConversation(conversationStorageKey, limited);
    // Quand le panneau appartient à un vrai projet, la discussion est également
    // enregistrée dans le projet lui-même et suit sa synchronisation distante.
    if (productProjectId) {
      setProjectAiConversation(productProjectId, limited);
    }
  }

  function appendMessage(role: DroMapAiChatRole, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    persistMessages([
      ...messagesRef.current,
      {
        id: createClientId("dromap-ai-message"),
        role,
        text: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function getConversationForApi() {
    return messagesRef.current
      .filter(
        (message): message is DroMapAiChatMessage & { role: "user" | "assistant" } =>
          message.role === "user" || message.role === "assistant",
      )
      .slice(-24)
      .map((message) => ({ role: message.role, text: message.text }));
  }

  function openAssistant() {
    if (!hasMounted) return;
    window.dispatchEvent(new Event("dromap:open-ai-assistant"));
    setPanelZIndex(bringFloatingPanelToFront());
    setIsOpen(true);
    setError(null);
  }

  function closeAssistant() {
    setIsOpen(false);
  }

  function cancelPreview(options: { reopenAssistant?: boolean; announce?: boolean } = {}) {
    const cancelled = cancelDroMapAiPreview();
    setPreviewResult(null);
    if (options.reopenAssistant) {
      setIsOpen(true);
    }
    if (cancelled && options.announce) {
      appendMessage(
        "system",
        "L’aperçu temporaire a été retiré. La carte est revenue exactement à son état précédent.",
      );
    }
    return cancelled;
  }

  function startNewConversation() {
    cancelPreview();
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    persistMessages([]);
    setWorkspaceMode(null);
    setPrompt("");
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});
    setGrounded(false);
    setError(null);
    setExecutionResult(null);
    setEditingCommandId(null);
    setStepInstruction("");
    setStepQuestionAnswers({});
    setBuildingFlow(null);
    setBuildingPreparation(null);
    setIsPreparingBuildings(false);
    setIsAiSuspendedForBuildingSelection(false);
    if (automaticBuildingZoneReview?.restoreZoneLock) {
      restoreDroMapAiWorkspaceZoneLock(true);
    }
    setAutomaticBuildingZoneReview(null);
    setRouteFlow(null);
    setRoutePreparation(null);
    setIsPreparingRoutes(false);
    setIsAiSuspendedForRouteSelection(false);
    if (automaticRouteZoneReview?.restoreZoneLock) {
      restoreDroMapAiWorkspaceZoneLock(true);
    }
    setAutomaticRouteZoneReview(null);
    validatedAutomaticRouteBoundsRef.current = null;
    currentTaskPromptRef.current = "";
    setIsGenerating(false);
    setIsApplying(false);
    setIsRevisingStep(false);
  }

  function chooseManualMode() {
    cancelPreview();
    setWorkspaceMode("manual");
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});
    setExecutionResult(null);
    setBuildingFlow(null);
    setBuildingPreparation(null);
    setIsAiSuspendedForBuildingSelection(false);
    if (automaticBuildingZoneReview?.restoreZoneLock) {
      restoreDroMapAiWorkspaceZoneLock(true);
    }
    setAutomaticBuildingZoneReview(null);
    setRouteFlow(null);
    setRoutePreparation(null);
    setIsPreparingRoutes(false);
    setIsAiSuspendedForRouteSelection(false);
    if (automaticRouteZoneReview?.restoreZoneLock) {
      restoreDroMapAiWorkspaceZoneLock(true);
    }
    setAutomaticRouteZoneReview(null);
    validatedAutomaticRouteBoundsRef.current = null;
    setError(null);
    setEditingCommandId(null);

    if (workspaceValidated) {
      appendMessage(
        "system",
        "Mode manuel sélectionné. La zone validée est fixe : l’IA ne proposera aucune étape pour la modifier.",
      );
      return;
    }

    setPendingManualWorkspace(true);
    setIsOpen(false);
    modifyWorkspaceZone();
  }

  function chooseAutomaticMode() {
    cancelPreview();
    if (workspaceBounds) {
      clearWorkspaceBounds();
    }
    setPendingManualWorkspace(false);
    setWorkspaceMode("automatic");
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});
    setExecutionResult(null);
    setBuildingFlow(null);
    setBuildingPreparation(null);
    setIsAiSuspendedForBuildingSelection(false);
    if (automaticBuildingZoneReview?.restoreZoneLock) {
      restoreDroMapAiWorkspaceZoneLock(true);
    }
    setAutomaticBuildingZoneReview(null);
    setRouteFlow(null);
    setRoutePreparation(null);
    setIsPreparingRoutes(false);
    setIsAiSuspendedForRouteSelection(false);
    if (automaticRouteZoneReview?.restoreZoneLock) {
      restoreDroMapAiWorkspaceZoneLock(true);
    }
    setAutomaticRouteZoneReview(null);
    validatedAutomaticRouteBoundsRef.current = null;
    setError(null);
    setEditingCommandId(null);
    appendMessage(
      "system",
      "Mode automatique sélectionné. L’IA peut définir directement une zone pertinente ou laisser DroMap la calculer autour des éléments créés.",
    );
  }

  async function generatePlan(overridePrompt?: string) {
    if (previewResult) {
      cancelPreview();
    }
    if (!workspaceMode) {
      setError("Choisis d'abord le mode de sélection de la zone.");
      return;
    }
    if (workspaceMode === "manual" && !workspaceValidated) {
      setError("Sélectionne puis valide la zone de travail manuelle.");
      return;
    }

    const requestPrompt = (overridePrompt ?? prompt).trim();
    if (requestPrompt.length < 2 || isGenerating || isApplying || isRevisingStep) {
      return;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const conversation = getConversationForApi();

    if (overridePrompt === undefined) {
      currentTaskPromptRef.current = requestPrompt;
      setBuildingFlow(null);
      setBuildingPreparation(null);
      setRouteFlow(null);
      setRoutePreparation(null);
      if (automaticBuildingZoneReview?.restoreZoneLock) {
        restoreDroMapAiWorkspaceZoneLock(true);
      }
      setAutomaticBuildingZoneReview(null);
      if (automaticRouteZoneReview?.restoreZoneLock) {
        restoreDroMapAiWorkspaceZoneLock(true);
      }
      setAutomaticRouteZoneReview(null);
      validatedAutomaticRouteBoundsRef.current = null;
    }

    appendMessage("user", requestPrompt);
    if (overridePrompt === undefined) {
      setPrompt("");
    }
    setError(null);
    setExecutionResult(null);
    setEditingCommandId(null);
    setStepQuestionAnswers({});
    setIsGenerating(true);

    try {
      const response = await fetch("/api/dromap/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          prompt: requestPrompt,
          context: buildDroMapAiProjectContext(),
          workspaceMode,
          conversation,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as
        | DroMapAiApiResponse
        | ApiErrorPayload;

      if (!response.ok || !("plan" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Impossible de traiter la demande.",
        );
      }

      setGrounded(payload.grounded);
      if (payload.plan) {
        setPlan(payload.plan);
        setPrePlanQuestions([]);
        setPrePlanAnswers({});
        const routeCommands = payload.plan.commands.filter(
          (command) => command.type === "import_routes",
        );
        const buildingCommands = payload.plan.commands.filter(
          (command) => command.type === "import_buildings",
        );
        if (routeCommands.length) {
          const nextRouteFlow: DroMapAiRouteFlowState = {
            originalPrompt: currentTaskPromptRef.current || requestPrompt,
            commands: routeCommands,
            currentIndex: 0,
            selections: [],
          };
          setRouteFlow(nextRouteFlow);
          setRoutePreparation(null);
          validatedAutomaticRouteBoundsRef.current = null;
          setBuildingFlow(null);
          setBuildingPreparation(null);

          if (workspaceMode === "automatic") {
            const proposal = await prepareDroMapAiAutomaticRouteWorkspaceProposal(routeCommands);
            if (!proposal) {
              throw new Error(
                "DroMap n’a pas pu proposer une zone de travail pour la phase Routes. Précise la ville, la région ou le secteur concerné.",
              );
            }
            const staged = stageDroMapAiWorkspaceProposalForReview(proposal);
            setAutomaticRouteZoneReview({
              proposal,
              awaitingValidation: true,
              restoreZoneLock: staged.restoreZoneLock,
            });
            setIsAiSuspendedForRouteSelection(false);
            setIsOpen(false);
            appendMessage(
              "assistant",
              "Étape 1 — Sélection de la zone en cours. Ajuste la zone si nécessaire puis valide-la avec ✓. Ensuite j’analyserai les routes.",
            );
          } else {
            setAutomaticRouteZoneReview(null);
            appendMessage(
              "assistant",
              `${payload.assistantMessage || payload.plan.summary}

Vérifie maintenant les routes à conserver. Les routes déjà importées seront présélectionnées.`,
            );
          }
        } else if (buildingCommands.length) {
          const nextBuildingFlow: DroMapAiBuildingFlowState = {
            originalPrompt: currentTaskPromptRef.current || requestPrompt,
            commands: buildingCommands,
            currentIndex: 0,
            selections: [],
          };
          setBuildingFlow(nextBuildingFlow);
          setBuildingPreparation(null);
          validatedAutomaticBuildingBoundsRef.current = null;
          setRouteFlow(null);
          setRoutePreparation(null);

          if (workspaceMode === "automatic") {
            const proposal = await prepareDroMapAiAutomaticWorkspaceProposal(
              buildingCommands,
            );
            if (!proposal) {
              throw new Error(
                "DroMap n’a pas pu proposer une zone de travail pour la phase Bâtiments. Précise le secteur ou les établissements concernés.",
              );
            }
            const staged = stageDroMapAiWorkspaceProposalForReview(proposal);
            setAutomaticBuildingZoneReview({
              proposal,
              awaitingValidation: true,
              restoreZoneLock: staged.restoreZoneLock,
            });
            setIsAiSuspendedForBuildingSelection(false);
            setIsOpen(false);
            appendMessage(
              "assistant",
              "Étape 1 — Sélection de la zone en cours. Ajuste la zone si nécessaire puis valide-la avec ✓.",
            );
          } else {
            setAutomaticBuildingZoneReview(null);
            appendMessage(
              "assistant",
              `${payload.assistantMessage || payload.plan.summary}

Vérifie maintenant les bâtiments à importer.`,
            );
          }
        } else {
          setBuildingFlow(null);
          setBuildingPreparation(null);
          setAutomaticBuildingZoneReview(null);
          setRouteFlow(null);
          setRoutePreparation(null);
          setAutomaticRouteZoneReview(null);
          appendMessage(
            "assistant",
            `${payload.assistantMessage || payload.plan.summary}

${payload.plan.commands.filter((command) => !isSilentAutomaticCompositionCommand(command)).length} étape${payload.plan.commands.filter((command) => !isSilentAutomaticCompositionCommand(command)).length > 1 ? "s" : ""} proposée${payload.plan.commands.filter((command) => !isSilentAutomaticCompositionCommand(command)).length > 1 ? "s" : ""}. Tu peux appliquer le plan, voir le rendu, supprimer une étape ou l’ajuster.`,
          );
        }
      } else {
        if ((payload.questions ?? []).length > 0) {
          setPlan(null);
        }
        setPrePlanQuestions(payload.questions ?? []);
        setPrePlanAnswers({});
        appendMessage("assistant", payload.assistantMessage);
      }
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") {
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Erreur inconnue pendant la demande.";
      setPlan(null);
      setPrePlanQuestions([]);
      setPrePlanAnswers({});
      setBuildingFlow(null);
      setBuildingPreparation(null);
      setRouteFlow(null);
      setRoutePreparation(null);
      setGrounded(false);
      setError(message);
      appendMessage("error", message);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  function togglePrePlanAnswer(
    question: DroMapAiPrePlanQuestion,
    optionId: string,
  ) {
    setPrePlanAnswers((current) => {
      const existing = current[question.id] ?? [];
      if (!question.multiple) {
        return {
          ...current,
          [question.id]: existing[0] === optionId ? [] : [optionId],
        };
      }
      return {
        ...current,
        [question.id]: existing.includes(optionId)
          ? existing.filter((id) => id !== optionId)
          : [...existing, optionId],
      };
    });
  }

  function submitPrePlanAnswers(skip = false) {
    if (!prePlanQuestions.length || isGenerating) return;
    const lines = prePlanQuestions.flatMap((question) => {
      if (skip) return [];
      const selectedIds = prePlanAnswers[question.id] ?? [];
      const labels = question.options
        .filter((option) => selectedIds.includes(option.id))
        .map((option) => option.label);
      return labels.length ? [`- ${question.label} : ${labels.join(", ")}`] : [];
    });
    const requestPrompt = skip
      ? "Je préfère ne pas préciser davantage. Réponds brièvement puis propose maintenant le meilleur plan DroMap possible avec les choix automatiques pertinents."
      : `Voici mes choix pour préciser la demande :\n${lines.length ? lines.join("\n") : "- Aucun choix supplémentaire."}\n\nRéponds brièvement puis propose maintenant le plan DroMap détaillé. Ne repose pas les mêmes questions sauf ambiguïté réellement bloquante.`;
    void generatePlan(requestPrompt);
  }

  async function requestRouteContinuation(
    flow: DroMapAiRouteFlowState,
  ) {
    if (!workspaceMode || isGenerating) return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});

    try {
      const response = await fetch("/api/dromap/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          prompt: flow.originalPrompt,
          context: buildDroMapAiProjectContext(),
          workspaceMode,
          conversation: getConversationForApi(),
          routeContinuation: {
            originalPrompt: flow.originalPrompt,
            selections: flow.selections,
          },
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as
        | DroMapAiApiResponse
        | ApiErrorPayload;
      if (!response.ok || !("plan" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Impossible de préparer la suite du plan après la sélection des routes.",
        );
      }

      setGrounded(payload.grounded);
      setRouteFlow(null);
      setRoutePreparation(null);
      setIsAiSuspendedForRouteSelection(false);

      if (payload.plan) {
        setPlan(payload.plan);
        const buildingCommands = payload.plan.commands.filter(
          (command) => command.type === "import_buildings",
        );
        if (buildingCommands.length) {
          const nextBuildingFlow: DroMapAiBuildingFlowState = {
            originalPrompt: flow.originalPrompt,
            commands: buildingCommands,
            currentIndex: 0,
            selections: [],
          };
          setBuildingFlow(nextBuildingFlow);
          setBuildingPreparation(null);
          appendMessage(
            "assistant",
            `${payload.assistantMessage || payload.plan.summary}

Routes validées. La demande nécessite aussi des bâtiments : vérifie maintenant leurs emprises dans le sélecteur.`,
          );
          const currentBounds = useEditorWorkspaceStore.getState().workspaceBounds;
          await prepareAndShowBuildingSelection(
            nextBuildingFlow,
            currentBounds
              ? {
                  south: currentBounds.southWest.lat,
                  west: currentBounds.southWest.lng,
                  north: currentBounds.northEast.lat,
                  east: currentBounds.northEast.lng,
                }
              : null,
          );
          return;
        }
        appendMessage(
          "assistant",
          `${payload.assistantMessage || payload.plan.summary}

Routes validées. Voici la suite du plan.`,
        );
      } else {
        setPlan(null);
        setPrePlanQuestions(payload.questions ?? []);
        appendMessage("assistant", payload.assistantMessage);
      }
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") return;
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu préparer la suite du plan après les routes.";
      setError(message);
      appendMessage("error", message);
      setIsAiSuspendedForRouteSelection(false);
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  async function requestBuildingContinuation(
    flow: DroMapAiBuildingFlowState,
  ) {
    if (!workspaceMode || isGenerating) return;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsGenerating(true);
    setError(null);
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});

    try {
      const response = await fetch("/api/dromap/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          prompt: flow.originalPrompt,
          context: buildDroMapAiProjectContext(),
          workspaceMode,
          conversation: getConversationForApi(),
          buildingContinuation: {
            originalPrompt: flow.originalPrompt,
            selections: flow.selections.map(
              ({ createdFeatureIds: _createdFeatureIds, ...selection }) =>
                selection,
            ),
          },
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as
        | DroMapAiApiResponse
        | ApiErrorPayload;
      if (!response.ok || !("plan" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Impossible de préparer la suite du plan après la sélection des bâtiments.",
        );
      }

      setGrounded(payload.grounded);
      setBuildingFlow(null);
      setBuildingPreparation(null);
      if (payload.plan) {
        setPlan(payload.plan);
        appendMessage(
          "assistant",
          `${payload.assistantMessage || payload.plan.summary}\n\nBâtiments validés. Voici la suite du plan.`,
        );
      } else {
        setPlan(null);
        setPrePlanQuestions(payload.questions ?? []);
        appendMessage("assistant", payload.assistantMessage);
      }
      setIsAiSuspendedForBuildingSelection(false);
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") {
        return;
      }
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu préparer la suite du plan.";
      setError(message);
      appendMessage("error", message);
      setIsAiSuspendedForBuildingSelection(false);
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  async function prepareAndShowBuildingSelection(
    flow: DroMapAiBuildingFlowState,
    searchBoundsOverride?: DroMapAiBounds | null,
  ) {
    const command = flow.commands[flow.currentIndex];
    if (!command) return;

    // Le sélecteur Bâtiments doit être l'unique interface au premier plan :
    // l'Assistant IA disparaît complètement jusqu'à validation ou annulation.
    setIsAiSuspendedForBuildingSelection(true);
    setIsOpen(false);
    useEditorToolStore.getState().resetActiveTool();
    setIsPreparingBuildings(true);
    setError(null);

    try {
      const preparation = await prepareDroMapAiBuildingSelection(
        command,
        searchBoundsOverride ??
          (workspaceMode === "automatic"
            ? validatedAutomaticBuildingBoundsRef.current
            : null),
      );
      setBuildingPreparation(preparation);
      if (preparation.warnings.length) {
        appendMessage(
          "system",
          preparation.warnings.map((warning) => `• ${warning}`).join("\n"),
        );
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu préparer le sélecteur de bâtiments.";
      setError(message);
      appendMessage("error", message);
      setIsAiSuspendedForBuildingSelection(false);
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    } finally {
      setIsPreparingBuildings(false);
    }
  }

  async function openCurrentBuildingSelection(
    searchBoundsOverride?: DroMapAiBounds | null,
  ) {
    if (!buildingFlow || isPreparingBuildings) return;
    await prepareAndShowBuildingSelection(buildingFlow, searchBoundsOverride);
  }

  async function confirmCurrentBuildingSelection(
    selectedFeatures: BuildingSelectionFeature[],
  ) {
    if (!buildingFlow || !buildingPreparation) return;
    const command = buildingFlow.commands[buildingFlow.currentIndex];
    if (!command) return;
    setIsPreparingBuildings(true);
    setError(null);
    try {
      const result: DroMapAiBuildingSelectionImportResult =
        importDroMapAiSelectedBuildings(
          command,
          buildingPreparation,
          selectedFeatures,
        );
      const selection: DroMapAiBuildingFlowSelection = {
        commandId: command.id,
        selectedCount: result.selectedCount,
        createdFeatureIds: result.createdFeatureIds,
        createdLayerNames: result.createdLayerNames,
        groups: result.groupSummaries,
      };
      const selections = [...buildingFlow.selections, selection];
      const nextIndex = buildingFlow.currentIndex + 1;
      setBuildingPreparation(null);
      appendMessage(
        "assistant",
        `${result.selectedCount.toLocaleString("fr-FR")} bâtiment${result.selectedCount > 1 ? "s" : ""} validé${result.selectedCount > 1 ? "s" : ""} et importé${result.selectedCount > 1 ? "s" : ""}.${result.groupSummaries.length ? ` Répartition : ${result.groupSummaries.map((group) => `${group.label} (${group.count})`).join(", ")}.` : ""}`,
      );

      if (nextIndex < buildingFlow.commands.length) {
        const nextFlow: DroMapAiBuildingFlowState = {
          ...buildingFlow,
          currentIndex: nextIndex,
          selections,
        };
        setBuildingFlow(nextFlow);
        // On reste hors de la fenêtre IA entre deux sélections de bâtiments.
        setIsPreparingBuildings(false);
        await prepareAndShowBuildingSelection(nextFlow);
      } else {
        const completedFlow: DroMapAiBuildingFlowState = {
          ...buildingFlow,
          currentIndex: nextIndex,
          selections,
        };
        if (workspaceMode === "automatic" && !workspaceBounds) {
          // Fallback historique uniquement : le nouveau flux automatique fait
          // normalement valider la zone AVANT l'ouverture du sélecteur.
          establishDroMapAiWorkspaceAroundFeatures(
            selections.flatMap((item) => item.createdFeatureIds),
          );
        }
        setBuildingFlow(completedFlow);
        await requestBuildingContinuation(completedFlow);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu importer les bâtiments sélectionnés.";
      setError(message);
      appendMessage("error", message);
    } finally {
      setIsPreparingBuildings(false);
    }
  }

  async function prepareAndShowRouteSelection(
    flow: DroMapAiRouteFlowState,
    searchBoundsOverride?: DroMapAiBounds | null,
  ) {
    const command = flow.commands[flow.currentIndex];
    if (!command) return;
    setIsAiSuspendedForRouteSelection(true);
    setIsOpen(false);
    useEditorToolStore.getState().resetActiveTool();
    setIsPreparingRoutes(true);
    setError(null);
    try {
      const preparation = await prepareDroMapAiRouteSelection(
        command,
        searchBoundsOverride ??
          (workspaceMode === "automatic"
            ? validatedAutomaticRouteBoundsRef.current
            : null),
      );
      setRoutePreparation(preparation);
      if (preparation.warnings.length) {
        appendMessage(
          "system",
          preparation.warnings.map((warning) => `• ${warning}`).join("\n"),
        );
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu préparer le sélecteur de routes.";
      setError(message);
      appendMessage("error", message);
      setIsAiSuspendedForRouteSelection(false);
      setPanelZIndex(bringFloatingPanelToFront());
      setIsOpen(true);
    } finally {
      setIsPreparingRoutes(false);
    }
  }

  async function openCurrentRouteSelection(
    searchBoundsOverride?: DroMapAiBounds | null,
  ) {
    if (!routeFlow || isPreparingRoutes) return;
    await prepareAndShowRouteSelection(routeFlow, searchBoundsOverride);
  }

  async function confirmCurrentRouteSelection(
    selectedFeatures: RouteSelectionFeature[],
  ) {
    if (!routeFlow || !routePreparation) return;
    const command = routeFlow.commands[routeFlow.currentIndex];
    if (!command) return;
    setIsPreparingRoutes(true);
    setError(null);
    try {
      const result = importDroMapAiSelectedRoutes(
        command,
        routePreparation,
        selectedFeatures,
      );
      const selection: DroMapAiRouteFlowSelection = {
        commandId: command.id,
        selectedCount: result.selectedCount,
        layerName: result.layerName,
        categories: result.categories,
      };
      const selections = [...routeFlow.selections, selection];
      const nextIndex = routeFlow.currentIndex + 1;
      setRoutePreparation(null);
      appendMessage(
        "assistant",
        result.removed
          ? "Toutes les routes ont été désélectionnées : le calque Routes a été retiré."
          : `${result.selectedCount.toLocaleString("fr-FR")} route${result.selectedCount > 1 ? "s" : ""} validée${result.selectedCount > 1 ? "s" : ""} dans ${result.layerName ?? "le calque Routes"}.`,
      );

      if (nextIndex < routeFlow.commands.length) {
        const nextFlow: DroMapAiRouteFlowState = {
          ...routeFlow,
          currentIndex: nextIndex,
          selections,
        };
        setRouteFlow(nextFlow);
        setIsPreparingRoutes(false);
        await prepareAndShowRouteSelection(nextFlow);
      } else {
        const completedFlow: DroMapAiRouteFlowState = {
          ...routeFlow,
          currentIndex: nextIndex,
          selections,
        };
        setRouteFlow(completedFlow);
        await requestRouteContinuation(completedFlow);
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu importer les routes sélectionnées.";
      setError(message);
      appendMessage("error", message);
    } finally {
      setIsPreparingRoutes(false);
    }
  }

  async function applyCurrentPlan() {
    if (!workspaceMode) return false;
    if (workspaceMode === "manual" && !workspaceValidated) {
      const message =
        "La zone manuelle n'est plus validée. Valide-la avant d'appliquer le plan.";
      setError(message);
      appendMessage("error", message);
      return false;
    }
    if (!plan || plan.commands.length === 0 || isApplying) return false;

    setError(null);
    setIsApplying(true);

    try {
      const result = await executeDroMapAiPlan(plan, { workspaceMode });
      setExecutionResult(result);
      setUndoAvailable(canUndoLastDroMapAiPlan());
      const warningText = result.warnings.length
        ? `\n\nAttention :\n${result.warnings.map((warning) => `• ${warning}`).join("\n")}`
        : "";
      appendMessage(
        "assistant",
        `Les modifications ont été appliquées à la carte.${warningText}`,
      );
      return true;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu appliquer ce plan.";
      setExecutionResult(null);
      setError(message);
      appendMessage("error", message);
      return false;
    } finally {
      setIsApplying(false);
    }
  }

  async function viewRender() {
    if (!workspaceMode || !plan || executionResult || previewResult || isApplying) {
      return;
    }
    if (workspaceMode === "manual" && !workspaceValidated) {
      const message =
        "La zone manuelle n'est plus validée. Valide-la avant d'afficher l'aperçu.";
      setError(message);
      appendMessage("error", message);
      return;
    }

    setError(null);
    setIsApplying(true);
    try {
      const result = await executeDroMapAiPlan(plan, {
        workspaceMode,
        executionMode: "preview",
      });
      setPreviewResult(result);
      setIsOpen(false);
      appendMessage(
        "system",
        "Aperçu temporaire affiché sur la carte. Rien n'est encore validé : tu peux revenir au plan, abandonner ou valider explicitement ce rendu.",
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "DroMap n'a pas pu préparer cet aperçu.";
      setError(message);
      appendMessage("error", message);
    } finally {
      setIsApplying(false);
    }
  }

  function returnToPlanFromPreview() {
    cancelPreview({ reopenAssistant: true, announce: true });
  }

  function abandonPreview() {
    cancelPreview({ reopenAssistant: true, announce: true });
  }

  function validatePreview() {
    const result = commitDroMapAiPreview();
    if (!result) {
      setPreviewResult(null);
      setIsOpen(true);
      setError("L'aperçu temporaire n'est plus disponible.");
      return;
    }

    setPreviewResult(null);
    setExecutionResult(result);
    setUndoAvailable(canUndoLastDroMapAiPlan());
    setIsOpen(true);
    const warningText = result.warnings.length
      ? `\n\nAttention :\n${result.warnings.map((warning) => `• ${warning}`).join("\n")}`
      : "";
    appendMessage(
      "assistant",
      `Les modifications de l’aperçu ont été conservées.${warningText}`,
    );
  }

  function setStepQuestionAnswer(
    commandId: string,
    questionId: string,
    optionId: string,
  ) {
    setStepQuestionAnswers((current) => ({
      ...current,
      [commandId]: {
        ...(current[commandId] ?? {}),
        [questionId]:
          current[commandId]?.[questionId] === optionId ? "" : optionId,
      },
    }));
  }

  function buildStepAdjustmentInstruction(command: DroMapAiCommand) {
    const answers = stepQuestionAnswers[command.id] ?? {};
    const selectedInstructions = getStepAdjustmentQuestions(command).flatMap(
      (question) => {
        const selectedId = answers[question.id];
        const option = question.options.find(
          (candidate) => candidate.id === selectedId,
        );
        return option ? [option.instruction] : [];
      },
    );
    const freeText = stepInstruction.trim();
    return [...selectedInstructions, ...(freeText ? [freeText] : [])].join(" ");
  }

  function removePlanStep(command: DroMapAiCommand, index: number) {
    if (executionResult || isApplying || isRevisingStep) return;
    if (previewResult) {
      cancelPreview({ reopenAssistant: true });
    }
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        commands: current.commands
          .filter((candidate) => candidate.id !== command.id)
          .map((candidate) => ({
            ...candidate,
            orderRefs: candidate.orderRefs.filter(
              (reference) => reference !== command.id,
            ),
          })),
      };
    });
    if (editingCommandId === command.id) {
      setEditingCommandId(null);
      setStepInstruction("");
    }
    setStepQuestionAnswers((current) => {
      const next = { ...current };
      delete next[command.id];
      return next;
    });
    if (command.type === "import_buildings") {
      setBuildingPreparation(null);
      setBuildingFlow((current) => {
        if (!current) return current;
        const commands = current.commands.filter(
          (candidate) => candidate.id !== command.id,
        );
        if (!commands.length) return null;
        return {
          ...current,
          commands,
          currentIndex: Math.min(current.currentIndex, commands.length - 1),
        };
      });
    }
    if (command.type === "import_routes") {
      setRoutePreparation(null);
      setRouteFlow((current) => {
        if (!current) return current;
        const commands = current.commands.filter(
          (candidate) => candidate.id !== command.id,
        );
        if (!commands.length) return null;
        return {
          ...current,
          commands,
          currentIndex: Math.min(current.currentIndex, commands.length - 1),
        };
      });
    }
    appendMessage(
      "system",
      `Étape ${index + 1} supprimée du plan : ${commandTitle(command)}.`,
    );
  }

  async function revisePlanStep(
    command: DroMapAiCommand,
    index: number,
    instructionOverride?: string,
  ) {
    if (previewResult) {
      cancelPreview({ reopenAssistant: true });
    }
    if (!workspaceMode || !plan || isRevisingStep) return;
    const instruction = (instructionOverride ?? stepInstruction).trim();
    if (!instruction) {
      setError("Indique la modification à apporter à cette étape.");
      return;
    }
    if (executionResult) {
      setError(
        "Le plan est déjà appliqué. Annule d'abord l'action IA avant de modifier une étape, afin d'éviter les doublons.",
      );
      return;
    }

    setError(null);
    setIsRevisingStep(true);
    const conversation = getConversationForApi();
    appendMessage(
      "user",
      `Modification de l'étape ${index + 1} — ${commandTitle(command)} : ${instruction}`,
    );

    try {
      const response = await fetch("/api/dromap/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          prompt: instruction,
          context: buildDroMapAiProjectContext(),
          workspaceMode,
          conversation,
          stepRevision: {
            plan,
            commandId: command.id,
            commandIndex: index,
            instruction,
          },
        }),
      });

      const payload = (await response.json()) as
        | DroMapAiApiResponse
        | ApiErrorPayload;
      if (!response.ok || !("plan" in payload) || !payload.plan) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Impossible de modifier cette étape.",
        );
      }

      setPlan(payload.plan);
      if (command.type === "import_buildings") {
        const revisedBuildingCommands = payload.plan.commands.filter(
          (candidate) => candidate.type === "import_buildings",
        );
        setBuildingFlow((current) =>
          current
            ? {
                ...current,
                commands: revisedBuildingCommands,
                currentIndex: Math.min(
                  current.currentIndex,
                  Math.max(0, revisedBuildingCommands.length - 1),
                ),
              }
            : current,
        );
        setBuildingPreparation(null);
      }
      if (command.type === "import_routes") {
        const revisedRouteCommands = payload.plan.commands.filter(
          (candidate) => candidate.type === "import_routes",
        );
        setRouteFlow((current) =>
          current
            ? {
                ...current,
                commands: revisedRouteCommands,
                currentIndex: Math.min(
                  current.currentIndex,
                  Math.max(0, revisedRouteCommands.length - 1),
                ),
              }
            : current,
        );
        setRoutePreparation(null);
      }
      setGrounded(payload.grounded);
      setEditingCommandId(null);
      setStepInstruction("");
      setStepQuestionAnswers((current) => ({
        ...current,
        [command.id]: {},
      }));
      appendMessage(
        "assistant",
        `Étape ${index + 1} modifiée sans toucher aux autres étapes : ${commandTitle(payload.plan.commands[index] ?? command)}.`,
      );
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible de modifier cette étape.";
      setError(message);
      appendMessage("error", message);
    } finally {
      setIsRevisingStep(false);
    }
  }

  function undoLastPlan() {
    if (previewResult) {
      cancelPreview();
    }
    if (!undoLastDroMapAiPlan()) return;
    setUndoAvailable(false);
    setExecutionResult(null);
    setError(null);
    appendMessage("system", "La dernière action de l'assistant a été annulée.");
  }

  function resetPlan() {
    cancelPreview();
    setPlan(null);
    setPrePlanQuestions([]);
    setPrePlanAnswers({});
    setExecutionResult(null);
    setError(null);
    setGrounded(false);
    setEditingCommandId(null);
    setStepInstruction("");
    setStepQuestionAnswers({});
    setBuildingFlow(null);
    setBuildingPreparation(null);
    setIsPreparingBuildings(false);
    setIsAiSuspendedForBuildingSelection(false);
    setRouteFlow(null);
    setRoutePreparation(null);
    setIsPreparingRoutes(false);
    setIsAiSuspendedForRouteSelection(false);
  }

  const closedPositionClass = productRuntimeEnabled
    ? docked
      ? "relative z-[1300]"
      : "fixed left-4 top-[4.5rem] z-[1300] md:left-[32rem] lg:left-[44rem]"
    : "fixed left-4 top-[4.5rem] z-[1300] md:left-[8.5rem] lg:left-[43rem] lg:top-4";
  const openedPositionClass = productRuntimeEnabled
    ? "fixed right-4 top-[4.5rem]"
    : "fixed right-4 top-4";

  if (isOpen && isAiWorking && !previewResult) {
    return (
      <div
        className={`pointer-events-none text-sm ${openedPositionClass}`}
        style={{ zIndex: panelZIndex }}
      >
        <section
          className={`pointer-events-auto flex w-[64rem] max-w-[calc(100vw-2rem)] items-center justify-center overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-lg ${
            productRuntimeEnabled
              ? "h-[calc(100vh-5.5rem)]"
              : "h-[calc(100vh-2rem)]"
          }`}
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <span
              className="h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600"
              aria-hidden="true"
            />
            <p className="text-sm font-black text-slate-900">{aiWorkingLabel}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      {previewResult ? (
        <div
          className={`pointer-events-none fixed inset-x-0 z-[94000] flex justify-center px-3 ${
            productRuntimeEnabled ? "top-[4.5rem]" : "top-3"
          }`}
        >
          <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-2xl border border-teal-300 bg-white px-4 py-3 shadow-lg">
            <div className="mr-2 min-w-[14rem] flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-teal-700">
                Aperçu IA temporaire — non validé
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                La carte montre le plan proposé. Aucun export n'est ouvert et rien n'est enregistré tant que tu ne valides pas.
              </p>
            </div>
            <button
              type="button"
              onClick={returnToPlanFromPreview}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Modifier le plan
            </button>
            <button
              type="button"
              onClick={abandonPreview}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100"
            >
              Abandonner
            </button>
            <button
              type="button"
              onClick={validatePreview}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-teal-700"
            >
              Valider ce rendu
            </button>
          </div>
        </div>
      ) : null}

      {showAutomaticZoneOnlyGuidance && (automaticBuildingZoneReview || automaticRouteZoneReview) ? (
        <div
          className={`pointer-events-none fixed inset-x-0 z-[93000] flex justify-center px-3 ${
            productRuntimeEnabled ? "top-[4.75rem]" : "top-3"
          }`}
        >
          <div className="max-w-2xl rounded-2xl border border-teal-300 bg-white px-4 py-3 shadow-lg">
            <p className="text-xs font-black uppercase tracking-wide text-teal-700">
              Étape 1 — Sélection de la zone en cours
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">
              Ajuste la zone si nécessaire, puis valide-la avec ✓.
            </p>
          </div>
        </div>
      ) : null}

      {showBuildingSelectionLoading ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[94000] flex items-center justify-center bg-white p-6"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-teal-200 bg-white px-6 py-5 text-center shadow-lg">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-teal-200 border-t-teal-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-black text-slate-900">Chargement des bâtiments…</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                DroMap analyse la zone et prépare les bâtiments. Patiente quelques instants.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showRouteSelectionLoading ? (
        <div
          className="pointer-events-auto fixed inset-0 z-[94000] flex items-center justify-center bg-white p-6"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-teal-200 bg-white px-6 py-5 text-center shadow-lg">
            <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-teal-200 border-t-teal-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-black text-slate-900">Chargement des routes…</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                DroMap analyse la zone et prépare les routes. Patiente quelques instants.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`pointer-events-none text-sm ${isOpen ? openedPositionClass : closedPositionClass}`}
        style={isOpen ? { zIndex: panelZIndex } : undefined}
        onMouseDown={() => {
          if (isOpen) setPanelZIndex(bringFloatingPanelToFront());
        }}
      >
      {!isOpen ? (
        previewResult || showAutomaticZoneOnlyGuidance || isAiSuspendedForBuildingSelection || isAiSuspendedForRouteSelection ? null : (
        <button
          type="button"
          onClick={openAssistant}
          title="Ouvrir l'assistant IA DroMap"
          className="pointer-events-auto flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 font-bold text-teal-800 shadow-lg transition hover:border-teal-400 hover:bg-white"
          aria-label="Ouvrir l'assistant IA DroMap"
        >
          <DromapAiAssistantIcon className="h-4 w-4" />
          Assistant IA
        </button>
        )
      ) : (
        <section
          className={`pointer-events-auto flex w-[64rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-lg ${
            productRuntimeEnabled
              ? "h-[calc(100vh-5.5rem)]"
              : "h-[calc(100vh-2rem)]"
          }`}
        >
          <header className="flex items-start justify-between gap-3 border-b border-teal-100 bg-teal-50 px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2 font-black text-slate-900">
                <DromapAiAssistantIcon className="h-4 w-4 text-teal-600" />
                Assistant cartographique DroMap
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Pose une question ou demande une modification de la carte.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startNewConversation}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                Nouvelle discussion
              </button>
              <button
                type="button"
                onClick={closeAssistant}
                className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label="Fermer l'assistant IA"
              >
                ×
              </button>
            </div>
          </header>

          {!workspaceMode ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-2xl space-y-4">
                <div>
                  <p className="text-base font-black text-slate-900">
                    Sélection de la zone
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    La zone manuelle offre le meilleur contrôle du cadrage final.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={chooseManualMode}
                  className="w-full rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-100"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-black text-emerald-950">
                      Sélection manuelle
                    </span>
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                      Recommandée
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-emerald-900">
                    Tu traces et valides la zone. Si elle existe déjà, la discussion s'ouvre immédiatement.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={chooseAutomaticMode}
                  className="w-full rounded-2xl border border-teal-200 bg-teal-50 p-4 text-left transition hover:border-teal-400 hover:bg-teal-100"
                >
                  <span className="font-black text-teal-950">
                    Sélection automatique par l'IA
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-teal-900">
                    La zone actuelle est retirée. DroMap place d'abord les éléments, puis calcule une zone avec une marge autour du résultat.
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="flex min-h-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div>
                    <p className="text-xs font-black text-slate-900">
                      Discussion · zone {workspaceMode === "manual" ? "manuelle" : "automatique"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {workspaceMode === "manual"
                        ? "La zone validée restera inchangée."
                        : "La zone sera calculée autour du résultat."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMode(null);
                      resetPlan();
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Changer de mode
                  </button>
                </div>

                <div
                  ref={chatScrollRef}
                  className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4"
                >
                  {messages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-teal-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
                      Décris ce que tu veux créer, modifier ou comprendre.
                    </div>
                  ) : null}
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    const isError = message.role === "error";
                    const isSystem = message.role === "system";
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                            isUser
                              ? "bg-teal-600 text-white"
                              : isError
                                ? "border border-red-200 bg-red-50 text-red-800"
                                : isSystem
                                  ? "border border-slate-200 bg-slate-100 text-slate-600"
                                  : "border border-slate-200 bg-white text-slate-800"
                          }`}
                        >
                          {message.text}
                        </div>
                      </div>
                    );
                  })}
                  {isGenerating ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
                        L’assistant réfléchit, répond et prépare un plan seulement si nécessaire…
                      </div>
                    </div>
                  ) : null}
                  {isRevisingStep ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
                        Modification de l'étape ciblée uniquement…
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-slate-200 bg-white p-3">
                  <textarea
                    value={prompt}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setPrompt(event.target.value)
                    }
                    onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                      if (
                        (event.ctrlKey || event.metaKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        void generatePlan();
                      }
                    }}
                    rows={4}
                    placeholder="Écris ta demande…"
                    className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      Ctrl+Entrée pour envoyer
                    </span>
                    <button
                      type="button"
                      onClick={() => void generatePlan()}
                      disabled={!canGenerate}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGenerating ? "Préparation…" : "Envoyer"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                  <div>
                    <p className="text-xs font-black text-slate-900">
                      {isAutomaticBuildingZonePending || isAutomaticRouteZonePending
                        ? "Étape 1 — Zone de travail"
                        : isRouteSelectionPlan
                          ? workspaceMode === "automatic"
                            ? "Étape 2 — Sélection des routes"
                            : "Phase 1 — Sélection des routes"
                          : isBuildingSelectionPlan
                            ? workspaceMode === "automatic"
                              ? "Étape 2 — Sélection des bâtiments"
                              : "Phase 1 — Sélection des bâtiments"
                            : "Plan de la carte"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isAutomaticBuildingZonePending || isAutomaticRouteZonePending
                        ? `Valide la zone proposée ou ajuste-la manuellement avant d'analyser les ${automaticSelectionKind}.`
                        : isRouteSelectionPlan
                          ? "Vérifie les axes utiles. Les routes déjà présentes sont présélectionnées ; toute désélection sera répercutée dans le calque GeoJSON."
                          : isBuildingSelectionPlan
                            ? "Vérifie les bonnes emprises. La suite du plan sera générée après validation des bâtiments."
                            : "Chaque étape peut être corrigée séparément avant application."}
                    </p>
                  </div>
                  {plan && !showAutomaticZoneOnlyGuidance ? (
                    <span className="rounded-full bg-teal-100 px-2 py-1 text-[11px] font-bold text-teal-800">
                      {commandCountLabel}
                    </span>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {error ? (
                    <div
                      className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                        error.startsWith("Alerte zone de travail")
                          ? "border-amber-300 bg-amber-50 text-amber-900"
                          : "border-red-200 bg-red-50 text-red-800"
                      }`}
                      role="alert"
                    >
                      {error}
                    </div>
                  ) : null}

                  {!plan ? (
                    prePlanQuestions.length > 0 ? (
                      <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
                        <div>
                          <p className="text-sm font-black text-teal-950">Préciser avant le plan</p>
                          <p className="mt-1 text-xs leading-relaxed text-teal-800">
                            Coche rapidement les choix utiles. L’assistant préparera ensuite le plan en tenant compte de tes réponses.
                          </p>
                        </div>
                        {prePlanQuestions.map((question) => {
                          const selected = prePlanAnswers[question.id] ?? [];
                          return (
                            <fieldset key={question.id} className="rounded-xl border border-teal-100 bg-white p-3">
                              <legend className="px-1 text-xs font-bold text-slate-900">
                                {question.label}
                              </legend>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {question.options.map((option) => {
                                  const checked = selected.includes(option.id);
                                  return (
                                    <label
                                      key={option.id}
                                      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                        checked
                                          ? "border-teal-500 bg-teal-50 text-teal-950"
                                          : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"
                                      }`}
                                    >
                                      <input
                                        type={question.multiple ? "checkbox" : "radio"}
                                        name={`dromap-ai-preplan-${question.id}`}
                                        checked={checked}
                                        onChange={() => togglePrePlanAnswer(question, option.id)}
                                        className="mt-0.5 h-4 w-4 accent-teal-600"
                                      />
                                      <span>{option.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              {question.multiple ? (
                                <p className="mt-2 text-[10px] text-slate-500">Plusieurs réponses possibles.</p>
                              ) : null}
                            </fieldset>
                          );
                        })}
                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => submitPrePlanAnswers(true)}
                            disabled={isGenerating}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Passer ces précisions
                          </button>
                          <button
                            type="button"
                            onClick={() => submitPrePlanAnswers(false)}
                            disabled={isGenerating}
                            className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-black text-white hover:bg-teal-700 disabled:opacity-50"
                          >
                            Préparer le plan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                        Pose une question ou décris une modification. L’assistant répondra directement et ne proposera un plan que si une action sur la carte est utile.
                      </div>
                    )
                  ) : showAutomaticZoneOnlyGuidance ? (
                    <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-teal-700">
                        Étape 1 — Sélection de la zone en cours
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700">
                        Valide ou ajuste d’abord la zone sur la carte. Le reste du plan sera affiché seulement après cette étape.
                      </p>
                    </div>
                  ) : executionResult ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-black text-white" aria-hidden="true">
                          ✓
                        </span>
                        <div>
                          <p className="text-sm font-black">Plan appliqué</p>
                          <p className="mt-1 text-xs leading-relaxed text-emerald-900">
                            Les modifications ont bien été appliquées à la carte. {executionResult.appliedCommandCount} action
                            {executionResult.appliedCommandCount > 1 ? "s" : ""} appliquée
                            {executionResult.appliedCommandCount > 1 ? "s" : ""}.
                          </p>
                          {executionResult.warnings.length > 0 ? (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                              <p className="text-xs font-bold">À vérifier</p>
                              <ul className="mt-1 space-y-1 text-xs">
                                {executionResult.warnings.map((warning, index) => (
                                  <li key={`${warning}-${index}`}>• {warning}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-slate-900">Plan proposé</p>
                          <div className="flex items-center gap-1.5">
                            {grounded ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                Données recherchées
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {plan.summary}
                        </p>
                      </div>

                      {plan.warnings.length > 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-bold text-amber-900">À vérifier</p>
                          <ul className="mt-1 space-y-1 text-xs text-amber-800">
                            {plan.warnings.map((warning, index) => (
                              <li key={`${warning}-${index}`}>• {warning}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {plan.facts.length > 0 ? (
                        <details className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                          <summary className="text-xs font-bold text-sky-950">
                            Données utilisées ({plan.facts.length})
                          </summary>
                          <div className="mt-2 space-y-2">
                            {plan.facts.map((fact, index) => (
                              <div
                                key={`${fact.subject}-${fact.metric}-${index}`}
                                className="rounded-lg border border-sky-100 bg-white/80 px-2.5 py-2 text-xs text-slate-700"
                              >
                                <p className="font-bold text-slate-900">
                                  {fact.subject} — {fact.metric}
                                </p>
                                <p>
                                  {formatFactValue(fact.value, fact.unit)}
                                  {fact.date ? ` · ${fact.date}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}

                      {(isAutomaticBuildingZonePending && automaticBuildingZoneReview) ||
                      (isAutomaticRouteZonePending && automaticRouteZoneReview) ? (
                        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-950">
                          <p className="font-black">Zone proposée</p>
                          <p className="mt-1 leading-relaxed">
                            Secteur : {(automaticRouteZoneReview ?? automaticBuildingZoneReview)?.proposal.label}.
                            La zone est déjà dessinée sur la carte. Valide-la avec le bouton ✓ de DroMap,
                            ou redessine le rectangle avant de valider.
                          </p>
                          <p className="mt-2 text-[11px] font-semibold text-teal-700">
                            {isAutomaticRouteZonePending
                              ? "Aucune route n’est encore chargée à cette étape."
                              : "Aucun bâtiment n’est encore chargé à cette étape."}
                          </p>
                        </div>
                      ) : (
                      <ol className="space-y-2">
                        {visiblePlanCommandEntries.map(({ command, index }, visibleIndex) => {
                          const isEditing = editingCommandId === command.id;
                          const questions = getStepAdjustmentQuestions(command);
                          const answers = stepQuestionAnswers[command.id] ?? {};
                          const preparedInstruction =
                            buildStepAdjustmentInstruction(command);
                          return (
                            <li
                              key={`${command.id}-${index}`}
                              className={`rounded-xl border bg-white px-3 py-2.5 transition ${
                                isEditing
                                  ? "border-teal-300 shadow-sm ring-2 ring-teal-50"
                                  : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <div className="flex gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                                  {visibleIndex + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCommandId(
                                          isEditing ? null : command.id,
                                        );
                                        setStepInstruction("");
                                        setError(null);
                                      }}
                                      disabled={Boolean(executionResult) || isRevisingStep}
                                      className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-not-allowed"
                                      title="Cliquer pour ajuster cette étape"
                                    >
                                      <p className="text-xs font-bold text-slate-900">
                                        {commandTitle(command)}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                                        {command.explanation}
                                      </p>
                                    </button>
                                    <div className="flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCommandId(
                                            isEditing ? null : command.id,
                                          );
                                          setStepInstruction("");
                                          setError(null);
                                        }}
                                        disabled={Boolean(executionResult) || isRevisingStep}
                                        className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        {isEditing ? "Fermer" : "Ajuster"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removePlanStep(command, index)}
                                        disabled={
                                          Boolean(executionResult) ||
                                          isApplying ||
                                          isRevisingStep
                                        }
                                        className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Supprimer cette étape du plan"
                                      >
                                        Supprimer
                                      </button>
                                    </div>
                                  </div>

                                  {isEditing ? (
                                    <div className="mt-3 space-y-3 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                                      <div>
                                        <p className="text-[11px] font-black text-teal-950">
                                          Ajuster cette étape
                                        </p>
                                        <p className="mt-0.5 text-[10px] leading-relaxed text-teal-700">
                                          Réponds seulement aux questions utiles. Les choix sont appliqués uniquement à cette étape.
                                        </p>
                                      </div>

                                      {questions.map((question) => (
                                        <fieldset key={question.id} className="space-y-1.5">
                                          <legend className="text-[10px] font-bold text-slate-700">
                                            {question.label}
                                          </legend>
                                          <div className="flex flex-wrap gap-1.5">
                                            {question.options.map((option) => {
                                              const selected =
                                                answers[question.id] === option.id;
                                              return (
                                                <button
                                                  key={option.id}
                                                  type="button"
                                                  aria-pressed={selected}
                                                  onClick={() =>
                                                    setStepQuestionAnswer(
                                                      command.id,
                                                      question.id,
                                                      option.id,
                                                    )
                                                  }
                                                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition ${
                                                    selected
                                                      ? "border-teal-600 bg-teal-600 text-white"
                                                      : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                                                  }`}
                                                >
                                                  {selected ? "✓ " : ""}
                                                  {option.label}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </fieldset>
                                      ))}

                                      <label className="block">
                                        <span className="mb-1 block text-[10px] font-bold text-slate-700">
                                          Précision libre — facultatif
                                        </span>
                                        <textarea
                                          value={stepInstruction}
                                          onChange={(event) =>
                                            setStepInstruction(event.target.value)
                                          }
                                          rows={2}
                                          placeholder="Ex. Utilise un rouge plus sombre et garde les noms visibles."
                                          className="w-full resize-y rounded-lg border border-teal-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                                        />
                                      </label>

                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] text-slate-500">
                                          Tu peux laisser les questions sans réponse.
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void revisePlanStep(
                                              command,
                                              index,
                                              preparedInstruction,
                                            )
                                          }
                                          disabled={
                                            preparedInstruction.trim().length < 2 ||
                                            isRevisingStep
                                          }
                                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {isRevisingStep
                                            ? "Modification…"
                                            : "Appliquer mes choix"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                      )}

                      {plan.sources.length > 0 ? (
                        <details className="rounded-xl border border-slate-200 bg-white p-3">
                          <summary className="text-xs font-bold text-slate-900">
                            Sources ({plan.sources.length})
                          </summary>
                          <ul className="mt-2 space-y-1.5 text-xs">
                            {plan.sources.map((source, index) => (
                              <li key={`${source.url}-${index}`}>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-teal-700 underline decoration-teal-300 underline-offset-2 hover:text-teal-900"
                                >
                                  {source.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </>
                  )}

                </div>

                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                  {undoAvailable ? (
                    <button
                      type="button"
                      onClick={undoLastPlan}
                      className="mr-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                    >
                      Annuler l'action IA
                    </button>
                  ) : null}
                  {plan && !executionResult ? (
                    <button
                      type="button"
                      onClick={resetPlan}
                      disabled={isApplying || isGenerating || isRevisingStep}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      Refaire le plan
                    </button>
                  ) : null}
                  {plan && !isBuildingSelectionPlan && !isRouteSelectionPlan ? (
                    <button
                      type="button"
                      onClick={() => void viewRender()}
                      disabled={!canApply || Boolean(executionResult) || Boolean(previewResult)}
                      className="rounded-lg border border-teal-300 bg-white px-3 py-2 text-xs font-black text-teal-700 shadow-sm transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Affiche temporairement le plan sur la carte, sans ouvrir l'export et sans le valider"
                    >
                      {isApplying ? "Préparation…" : "Voir le rendu"}
                    </button>
                  ) : null}
                  {plan && !isBuildingSelectionPlan && !isRouteSelectionPlan ? (
                    <button
                      type="button"
                      onClick={() => void applyCurrentPlan()}
                      disabled={!canApply || Boolean(executionResult)}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isApplying ? "Application…" : `Appliquer ${commandCountLabel}`}
                    </button>
                  ) : null}
                  {plan && (isAutomaticBuildingZonePending || isAutomaticRouteZonePending) ? (
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-teal-700"
                    >
                      Valider ou ajuster la zone
                    </button>
                  ) : null}
                  {plan && isRouteSelectionPlan && !isAutomaticRouteZonePending ? (
                    <button
                      type="button"
                      onClick={() => void openCurrentRouteSelection()}
                      disabled={
                        !routeFlow ||
                        isPreparingRoutes ||
                        isGenerating ||
                        isRevisingStep
                      }
                      className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPreparingRoutes
                        ? "Analyse des routes…"
                        : routeFlow && routeFlow.commands.length > 1
                          ? `Sélectionner les routes (${Math.min(routeFlow.currentIndex + 1, routeFlow.commands.length)}/${routeFlow.commands.length})`
                          : "Sélectionner les routes"}
                    </button>
                  ) : null}
                  {plan && isBuildingSelectionPlan && !isAutomaticBuildingZonePending ? (
                    <button
                      type="button"
                      onClick={() => void openCurrentBuildingSelection()}
                      disabled={
                        !buildingFlow ||
                        isPreparingBuildings ||
                        isGenerating ||
                        isRevisingStep
                      }
                      className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 shadow-md transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPreparingBuildings
                        ? "Préparation des bâtiments…"
                        : buildingFlow && buildingFlow.commands.length > 1
                          ? `Sélectionner les bâtiments (${Math.min(buildingFlow.currentIndex + 1, buildingFlow.commands.length)}/${buildingFlow.commands.length})`
                          : "Sélectionner les bâtiments"}
                    </button>
                  ) : null}
                </footer>
              </div>
            </div>
          )}
        </section>
      )}
      </div>
      {buildingPreparation && buildingFlow ? (
        <BuildingSelectionModal
          features={buildingPreparation.features as BuildingSelectionFeature[]}
          bounds={buildingPreparation.bounds}
          initialSelectedIds={buildingPreparation.suggestedFeatureIds}
          introText="L’IA a présélectionné en orange les bâtiments qu’elle juge plausibles. Vérifie cette sélection : tu peux ajouter ou retirer n’importe quel bâtiment avant de valider."
          areaLabel="Zone de recherche IA"
          onCancel={() => {
            setBuildingPreparation(null);
            setIsAiSuspendedForBuildingSelection(false);
            setPanelZIndex(bringFloatingPanelToFront());
            setIsOpen(true);
            appendMessage(
              "system",
              "Sélection des bâtiments interrompue. Rien de supplémentaire n’a été importé ; tu peux rouvrir le sélecteur quand tu veux.",
            );
          }}
          onConfirm={(selectedFeatures) => {
            void confirmCurrentBuildingSelection(selectedFeatures);
          }}
        />
      ) : null}
      {routePreparation && routeFlow ? (
        <RouteSelectionModal
          features={routePreparation.features as RouteSelectionFeature[]}
          bounds={routePreparation.bounds}
          initialSelectedIds={routePreparation.suggestedFeatureIds}
          allowEmptyConfirm={routePreparation.hadExistingRoadLayer}
          onCancel={() => {
            setRoutePreparation(null);
            setIsAiSuspendedForRouteSelection(false);
            setPanelZIndex(bringFloatingPanelToFront());
            setIsOpen(true);
            appendMessage(
              "system",
              "Sélection des routes interrompue. Le calque Routes existant n’a pas été modifié ; tu peux rouvrir le sélecteur quand tu veux.",
            );
          }}
          onConfirm={(selectedFeatures) => {
            void confirmCurrentRouteSelection(selectedFeatures);
          }}
        />
      ) : null}
    </>
  );
}
