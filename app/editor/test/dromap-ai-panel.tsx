"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";

import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

import { buildDroMapAiProjectContext } from "./dromap-ai-context";
import {
  canUndoLastDroMapAiPlan,
  cancelDroMapAiPreview,
  commitDroMapAiPreview,
  executeDroMapAiPlan,
  hasActiveDroMapAiPreview,
  undoLastDroMapAiPlan,
  type DroMapAiExecutionResult,
} from "./dromap-ai-executor";
import type {
  DroMapAiApiResponse,
  DroMapAiCommand,
  DroMapAiPlan,
  DroMapAiWorkspaceMode,
} from "./dromap-ai-types";


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
      return `Importer ${scope} (${command.buildingMode === "dromap" ? "objets individuels" : "calque léger"})`;
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


const DROMAP_AI_CHAT_STORAGE_KEY = "dromap-ai-conversation-v1";
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

function readConversation() {
  if (typeof window === "undefined") return [] as DroMapAiChatMessage[];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(DROMAP_AI_CHAT_STORAGE_KEY) ?? "[]",
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

function writeConversation(messages: DroMapAiChatMessage[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DROMAP_AI_CHAT_STORAGE_KEY,
    JSON.stringify(messages.slice(-MAX_CHAT_MESSAGES)),
  );
}

export function DroMapAiPanel() {
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const modifyWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.modifyWorkspaceZone,
  );
  const requestControllerRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<DroMapAiChatMessage[]>([]);

  const [hasMounted, setHasMounted] = useState(false);
  const workspaceValidated =
    hasMounted && currentMode === "edit" && workspaceBounds !== null;

  const [isOpen, setIsOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] =
    useState<DroMapAiWorkspaceMode | null>(null);
  const [pendingManualWorkspace, setPendingManualWorkspace] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<DroMapAiPlan | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [grounded, setGrounded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRevisingStep, setIsRevisingStep] = useState(false);
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [stepInstruction, setStepInstruction] = useState("");
  const [executionResult, setExecutionResult] =
    useState<DroMapAiExecutionResult | null>(null);
  const [previewResult, setPreviewResult] =
    useState<DroMapAiExecutionResult | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [messages, setMessages] = useState<DroMapAiChatMessage[]>([]);

  const modeReady =
    workspaceMode === "automatic" ||
    (workspaceMode === "manual" && workspaceValidated);
  const canGenerate =
    modeReady &&
    prompt.trim().length >= 2 &&
    !isGenerating &&
    !isApplying &&
    !isRevisingStep;
  const canApply = Boolean(
    modeReady &&
      plan &&
      plan.commands.length > 0 &&
      !isApplying &&
      !isGenerating &&
      !isRevisingStep,
  );
  const commandCountLabel = useMemo(() => {
    const count = plan?.commands.length ?? 0;
    return `${count} action${count > 1 ? "s" : ""}`;
  }, [plan]);

  useEffect(() => {
    if (hasActiveDroMapAiPreview()) {
      cancelDroMapAiPreview();
    }
    setHasMounted(true);
    setUndoAvailable(canUndoLastDroMapAiPlan());
    const storedMessages = readConversation();
    messagesRef.current = storedMessages;
    setMessages(storedMessages);
    window.localStorage.removeItem(LEGACY_HISTORY_STORAGE_KEY);

    return () => {
      if (hasActiveDroMapAiPreview()) {
        cancelDroMapAiPreview();
      }
    };
  }, []);

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
    if (workspaceMode !== "manual" || workspaceValidated) return;
    if (hasActiveDroMapAiPreview()) {
      cancelDroMapAiPreview();
      setPreviewResult(null);
    }
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setPlan(null);
    setExecutionResult(null);
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
    writeConversation(limited);
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

  function openAssistant() {
    if (!hasMounted) return;
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
    setModel(null);
    setGrounded(false);
    setError(null);
    setExecutionResult(null);
    setEditingCommandId(null);
    setStepInstruction("");
    setIsGenerating(false);
    setIsApplying(false);
    setIsRevisingStep(false);
  }

  function chooseManualMode() {
    cancelPreview();
    setWorkspaceMode("manual");
    setPlan(null);
    setExecutionResult(null);
    setError(null);
    setEditingCommandId(null);

    if (workspaceValidated) {
      appendMessage(
        "system",
        "Mode manuel sélectionné. La zone validée restera strictement inchangée.",
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
    setExecutionResult(null);
    setError(null);
    setEditingCommandId(null);
    appendMessage(
      "system",
      "Mode automatique sélectionné. DroMap calculera la zone après avoir placé les éléments géographiques.",
    );
  }

  async function generatePlan() {
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
    if (!canGenerate) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestPrompt = prompt.trim();

    appendMessage("user", requestPrompt);
    setPrompt("");
    setError(null);
    setExecutionResult(null);
    setEditingCommandId(null);
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
            : "Impossible de préparer la carte.",
        );
      }

      setPlan(payload.plan);
      setModel(payload.model);
      setGrounded(payload.grounded);
      appendMessage(
        "assistant",
        `${payload.plan.summary}\n\n${payload.plan.commands.length} étape${payload.plan.commands.length > 1 ? "s" : ""} proposée${payload.plan.commands.length > 1 ? "s" : ""}. Tu peux appliquer le plan, voir le rendu ou modifier une étape précise.`,
      );
    } catch (caughtError) {
      if (caughtError instanceof Error && caughtError.name === "AbortError") {
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Erreur inconnue pendant la préparation.";
      setPlan(null);
      setModel(null);
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
        `Plan appliqué : ${result.appliedCommandCount} action${result.appliedCommandCount > 1 ? "s" : ""}, ${result.createdFeatureIds.length} objet${result.createdFeatureIds.length > 1 ? "s" : ""} et ${result.createdGeoJsonLayerIds.length} calque${result.createdGeoJsonLayerIds.length > 1 ? "s" : ""} GeoJSON créés.${warningText}`,
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
      `Rendu validé : ${result.appliedCommandCount} action${result.appliedCommandCount > 1 ? "s" : ""}, ${result.createdFeatureIds.length} objet${result.createdFeatureIds.length > 1 ? "s" : ""} et ${result.createdGeoJsonLayerIds.length} calque${result.createdGeoJsonLayerIds.length > 1 ? "s" : ""} GeoJSON créés.${warningText}`,
    );
  }

  async function revisePlanStep(command: DroMapAiCommand, index: number) {
    if (previewResult) {
      cancelPreview({ reopenAssistant: true });
    }
    if (!workspaceMode || !plan || isRevisingStep) return;
    const instruction = stepInstruction.trim();
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
      if (!response.ok || !("plan" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Impossible de modifier cette étape.",
        );
      }

      setPlan(payload.plan);
      setModel(payload.model);
      setGrounded(payload.grounded);
      setEditingCommandId(null);
      setStepInstruction("");
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
    setExecutionResult(null);
    setError(null);
    setModel(null);
    setGrounded(false);
    setEditingCommandId(null);
    setStepInstruction("");
  }

  const closedPositionClass =
    "fixed left-4 top-[4.5rem] z-[1300] md:left-[8.5rem] lg:left-[43rem] lg:top-4";
  const openedPositionClass = "fixed right-4 top-4 z-[15000]";

  return (
    <>
      {previewResult ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[25000] flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-2 rounded-2xl border border-violet-300 bg-white/97 px-4 py-3 shadow-2xl backdrop-blur">
            <div className="mr-2 min-w-[14rem] flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-violet-700">
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
              className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-violet-700"
            >
              Valider ce rendu
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={`pointer-events-none text-sm ${isOpen ? openedPositionClass : closedPositionClass}`}
      >
      {!isOpen ? (
        previewResult ? null : (
        <button
          type="button"
          onClick={openAssistant}
          title="Ouvrir l'assistant IA DroMap"
          className="pointer-events-auto flex items-center gap-2 rounded-xl border border-violet-200 bg-white/95 px-3 py-2 font-bold text-violet-800 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-400 hover:bg-white hover:shadow-2xl"
          aria-label="Ouvrir l'assistant IA DroMap"
        >
          <span aria-hidden="true">✦</span>
          Assistant IA
        </button>
        )
      ) : (
        <section className="pointer-events-auto flex h-[calc(100vh-2rem)] w-[64rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white/98 shadow-2xl backdrop-blur">
          <header className="flex items-start justify-between gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2 font-black text-slate-900">
                <span aria-hidden="true" className="text-violet-600">
                  ✦
                </span>
                Assistant cartographique DroMap
              </div>
              <p className="mt-0.5 text-xs text-slate-600">
                Discussion, plan détaillé, modification étape par étape et aperçu du rendu.
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
                  className="w-full rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left transition hover:border-violet-400 hover:bg-violet-100"
                >
                  <span className="font-black text-violet-950">
                    Sélection automatique par l'IA
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-violet-900">
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
                    <div className="rounded-xl border border-dashed border-violet-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
                      Décris la carte à créer ou la modification souhaitée. Les messages de cette discussion resteront visibles ici.
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
                              ? "bg-violet-600 text-white"
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
                      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
                        Recherche éventuelle des données et préparation du plan…
                      </div>
                    </div>
                  ) : null}
                  {isRevisingStep ? (
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
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
                    className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      Ctrl+Entrée pour envoyer
                    </span>
                    <button
                      type="button"
                      onClick={() => void generatePlan()}
                      disabled={!canGenerate}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isGenerating ? "Préparation…" : "Envoyer"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col bg-white">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                  <div>
                    <p className="text-xs font-black text-slate-900">Plan de la carte</p>
                    <p className="text-[11px] text-slate-500">
                      Chaque étape peut être corrigée séparément avant application.
                    </p>
                  </div>
                  {plan ? (
                    <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-bold text-violet-800">
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
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                      Le plan détaillé apparaîtra ici après ta première demande.
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
                            {model ? (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {model}
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

                      <ol className="space-y-2">
                        {plan.commands.map((command, index) => {
                          const isEditing = editingCommandId === command.id;
                          return (
                            <li
                              key={`${command.id}-${index}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                            >
                              <div className="flex gap-2">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-900">
                                        {commandTitle(command)}
                                      </p>
                                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                                        {command.explanation}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCommandId(isEditing ? null : command.id);
                                        setStepInstruction("");
                                        setError(null);
                                      }}
                                      disabled={Boolean(executionResult) || isRevisingStep}
                                      className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
                                      title={
                                        executionResult
                                          ? "Annule d'abord l'action IA pour modifier le plan appliqué."
                                          : "Modifier uniquement cette étape"
                                      }
                                    >
                                      {isEditing ? "Fermer" : "Modifier"}
                                    </button>
                                  </div>

                                  {isEditing ? (
                                    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/70 p-2">
                                      <label className="block">
                                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-indigo-800">
                                          Modification de cette étape uniquement
                                        </span>
                                        <textarea
                                          value={stepInstruction}
                                          onChange={(event) =>
                                            setStepInstruction(event.target.value)
                                          }
                                          rows={3}
                                          placeholder="Ex. Réduis ces marqueurs à 35 px et utilise un pictogramme d'université."
                                          className="w-full resize-y rounded-lg border border-indigo-200 bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                                        />
                                      </label>
                                      <div className="mt-2 flex justify-end">
                                        <button
                                          type="button"
                                          onClick={() => void revisePlanStep(command, index)}
                                          disabled={
                                            stepInstruction.trim().length < 2 ||
                                            isRevisingStep
                                          }
                                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {isRevisingStep
                                            ? "Modification…"
                                            : "Modifier cette étape"}
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
                                  className="font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
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

                  {executionResult ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      <p className="font-bold">
                        Carte modifiée : {executionResult.appliedCommandCount} action
                        {executionResult.appliedCommandCount > 1 ? "s" : ""} appliquée
                        {executionResult.appliedCommandCount > 1 ? "s" : ""}.
                      </p>
                    </div>
                  ) : null}
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
                  {plan ? (
                    <button
                      type="button"
                      onClick={resetPlan}
                      disabled={isApplying || isGenerating || isRevisingStep}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      Refaire le plan
                    </button>
                  ) : null}
                  {plan ? (
                    <button
                      type="button"
                      onClick={() => void viewRender()}
                      disabled={!canApply || Boolean(executionResult) || Boolean(previewResult)}
                      className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Affiche temporairement le plan sur la carte, sans ouvrir l'export et sans le valider"
                    >
                      {isApplying ? "Préparation…" : "Voir le rendu"}
                    </button>
                  ) : null}
                  {plan ? (
                    <button
                      type="button"
                      onClick={() => void applyCurrentPlan()}
                      disabled={!canApply || Boolean(executionResult)}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isApplying ? "Application…" : `Appliquer ${commandCountLabel}`}
                    </button>
                  ) : null}
                </footer>
              </div>
            </div>
          )}
        </section>
      )}
      </div>
    </>
  );
}
