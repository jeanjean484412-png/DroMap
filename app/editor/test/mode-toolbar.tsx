"use client";

import { useEffect, useMemo, useState } from "react";

import { EDITOR_MODE_LABELS } from "@/lib/dromap/editor-mode";
import type {
  DroMapFeatureDashStyle,
  DroMapMarkerBuiltinSymbol,
} from "@/lib/dromap/feature";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import {
  type EditorTestActiveTool,
  useEditorTestToolStore,
} from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { useEditorTestDrawingOptionsStore } from "@/stores/editor-test-drawing-options";

import {
  DROMAP_DASH_STYLES,
  MAX_MARKER_SIZE,
  MIN_MARKER_SIZE,
} from "./feature-style";
import { DROMAP_BUILTIN_MARKER_SYMBOLS } from "./marker-symbol";
import { WorkspaceActions } from "./workspace-actions";
import { UndoRedoControls } from "./undo-redo-controls";
import { SaveLoadControls } from "./save-load-controls";

const MIN_TEXT_FONT_SIZE = 10;
const MAX_TEXT_FONT_SIZE = 72;

type ToolConfig = {
  value: EditorTestActiveTool;
  label: string;
  icon: string;
  hint: string;
  hasSettings: boolean;
};

const EDIT_TOOLS: ToolConfig[] = [
  {
    value: "select",
    label: "Sélection",
    icon: "↖",
    hint: "Sélectionner les objets existants.",
    hasSettings: false,
  },
  {
    value: "edit",
    label: "Modifier",
    icon: "✥",
    hint: "Déplacer un objet ou modifier sa forme avec ses poignées.",
    hasSettings: false,
  },
  {
    value: "marker",
    label: "Marqueur",
    icon: "●",
    hint: "Cliquez sur la carte pour poser des marqueurs.",
    hasSettings: true,
  },
  {
    value: "line",
    label: "Ligne",
    icon: "━",
    hint: "Tracez une ligne droite ou brisée sur la carte.",
    hasSettings: true,
  },
  {
    value: "freehand",
    label: "Dessin libre",
    icon: "✎",
    hint: "Cliquez-glissez pour dessiner un trait libre.",
    hasSettings: true,
  },
  {
    value: "zone",
    label: "Zone",
    icon: "▰",
    hint: "Dessinez une zone sur la carte.",
    hasSettings: true,
  },
  {
    value: "text",
    label: "Texte",
    icon: "T",
    hint: "Cliquez sur la carte pour placer du texte.",
    hasSettings: true,
  },
];

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getToolLabel(tool: EditorTestActiveTool) {
  return EDIT_TOOLS.find((item) => item.value === tool)?.label ?? "Outil";
}

export default function ModeToolbar() {
  const [openSettingsTool, setOpenSettingsTool] =
    useState<EditorTestActiveTool | null>(null);

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
  const lineStyle = useEditorTestDrawingOptionsStore((state) => state.lineStyle);
  const zoneStyle = useEditorTestDrawingOptionsStore((state) => state.zoneStyle);
  const textStyle = useEditorTestDrawingOptionsStore((state) => state.textStyle);

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

  const activeToolConfig = useMemo(
    () => EDIT_TOOLS.find((tool) => tool.value === activeTool) ?? EDIT_TOOLS[0],
    [activeTool],
  );

  const openedToolLabel = openSettingsTool
    ? getToolLabel(openSettingsTool)
    : "Outil";

  useEffect(() => {
    if (currentMode !== "edit") {
      resetActiveTool();
      setOpenSettingsTool(null);
    }
  }, [currentMode, resetActiveTool]);

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
            {EDIT_TOOLS.map((tool) => {
              const isActive = activeTool === tool.value;
              const isSettingsOpen = openSettingsTool === tool.value;

              return (
                <div key={tool.value} className="flex justify-center gap-1">
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setActiveTool(tool.value);

                      if (!tool.hasSettings) {
                        setOpenSettingsTool(null);
                        return;
                      }

                      if (
                        openSettingsTool !== null &&
                        openSettingsTool !== tool.value
                      ) {
                        setOpenSettingsTool(null);
                      }
                    }}
                    className={[
                      "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
                      isActive
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50",
                    ].join(" ")}
                    title={tool.label}
                  >
                    {tool.icon}
                  </button>

                  {tool.hasSettings ? (
                    <button
                      type="button"
                      aria-label={`Paramètres ${tool.label}`}
                      onClick={() => {
                        setActiveTool(tool.value);
                        setOpenSettingsTool((current) =>
                          current === tool.value ? null : tool.value,
                        );
                      }}
                      className={[
                        "flex h-11 w-5 items-center justify-center rounded-lg border text-[10px] font-bold shadow-sm transition",
                        isSettingsOpen
                          ? "border-blue-700 bg-blue-700 text-white"
                          : isActive
                            ? "border-blue-500 bg-blue-500 text-white hover:bg-blue-700"
                            : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900",
                      ].join(" ")}
                      title={`Ouvrir les paramètres ${tool.label}`}
                    >
                      ▸
                    </button>
                  ) : (
                    <span className="block h-11 w-5" />
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="border-t border-neutral-200 pt-2">
          <div className="mb-2 rounded-xl bg-neutral-50 px-2 py-2 text-center text-[10px] leading-tight text-neutral-500">
            {currentMode === "edit" ? activeToolConfig.label : "Zone"}
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
        <div className="pointer-events-auto w-72 rounded-2xl border border-black/10 bg-white/95 p-3 text-xs text-neutral-700 shadow-xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <strong className="block text-sm text-neutral-900">
                Paramètres
              </strong>
              <span className="text-[11px] text-neutral-500">
                {openSettingsTool === "freehand" ? "Style de ligne avant dessin libre" : `${openedToolLabel} avant pose`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setOpenSettingsTool(null)}
              className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              Fermer
            </button>
          </div>

          {openSettingsTool === "marker" ? (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span>Forme</span>
                <select
                  className="w-44 rounded-md border border-neutral-200 bg-white px-2 py-1"
                  value={
                    markerSymbol.type === "builtin"
                      ? markerSymbol.id
                      : "circle"
                  }
                  onChange={(event) =>
                    setMarkerBuiltinSymbol(
                      event.target.value as DroMapMarkerBuiltinSymbol,
                    )
                  }
                >
                  {DROMAP_BUILTIN_MARKER_SYMBOLS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

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
            </div>
          ) : null}

          {openSettingsTool === "line" || openSettingsTool === "freehand" ? (
            <div className="space-y-3">
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

          {openSettingsTool === "zone" ? (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span>Contour</span>
                <input
                  type="color"
                  value={zoneStyle.color}
                  onChange={(event) =>
                    updateZoneStyle({ color: event.target.value })
                  }
                  className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <span>Fond</span>
                <input
                  type="color"
                  value={zoneStyle.fillColor}
                  onChange={(event) =>
                    updateZoneStyle({ fillColor: event.target.value })
                  }
                  className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0"
                />
              </label>

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
                  <span>Opacité contour</span>
                  <span>{percentage(zoneStyle.opacity)}</span>
                </div>
                <input
                  className="w-full"
                  type="range"
                  min="0.1"
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

              <label className="block">
                <div className="mb-1 flex justify-between">
                  <span>Opacité fond</span>
                  <span>{percentage(zoneStyle.fillOpacity)}</span>
                </div>
                <input
                  className="w-full"
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={zoneStyle.fillOpacity}
                  onChange={(event) =>
                    updateZoneStyle({
                      fillOpacity: Number(event.target.value),
                    })
                  }
                />
              </label>
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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}