"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  type DroMapCustomMarkerDefinition,
  type DroMapDrawnMarkerDashStyle,
  type DroMapDrawnMarkerElement,
  type DroMapDrawnMarkerHatchingStyle,
  type DroMapDrawnMarkerPoint,
} from "@/stores/editor-custom-markers";
import { ColorPicker } from "./color-picker";
import { CustomMarkerFabricCanvas } from "./custom-marker-fabric-canvas";
import { createDrawnMarkerDataUrl } from "./custom-marker-rendering";

type DesignerTool =
  | "select"
  | "line"
  | "arrow"
  | "freehand-line"
  | "freehand-zone"
  | "polygon"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "star"
  | "text";

type Point = DroMapDrawnMarkerPoint;

type LinePreset = {
  color: string;
  opacity: number;
  weight: number;
  dashStyle: DroMapDrawnMarkerDashStyle;
  arrowStart: boolean;
  arrowEnd: boolean;
  smoothing: number;
};

type ZonePreset = {
  strokeEnabled: boolean;
  color: string;
  opacity: number;
  weight: number;
  dashStyle: DroMapDrawnMarkerDashStyle;
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number;
  hatchingStyle: DroMapDrawnMarkerHatchingStyle;
  hatchingColor: string;
  hatchingWeight: number;
  hatchingSpacing: number;
  dotsEnabled: boolean;
  dotsColor: string;
  dotsRadius: number;
  dotsSpacing: number;
  smoothing: number;
};

type TextPreset = {
  color: string;
  opacity: number;
  fontSize: number;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
};

type CustomMarkerDesignerModalProps = {
  initialMarker?: DroMapCustomMarkerDefinition | null;
  onCancel: () => void;
  onSave: (input: {
    name: string;
    elements: DroMapDrawnMarkerElement[];
    dataUrl: string;
  }) => void;
};

const DEFAULT_LINE_PRESET: LinePreset = {
  color: "#111827",
  opacity: 1,
  weight: 2,
  dashStyle: "solid",
  arrowStart: false,
  arrowEnd: false,
  smoothing: 45,
};
const DEFAULT_ZONE_PRESET: ZonePreset = {
  strokeEnabled: true,
  color: "#111827",
  opacity: 1,
  weight: 2,
  dashStyle: "solid",
  fillEnabled: false,
  fillColor: "#2563eb",
  fillOpacity: 0.25,
  hatchingStyle: "none",
  hatchingColor: "#111827",
  hatchingWeight: 2,
  hatchingSpacing: 14,
  dotsEnabled: false,
  dotsColor: "#111827",
  dotsRadius: 2,
  dotsSpacing: 14,
  smoothing: 45,
};
const DEFAULT_TEXT_PRESET: TextPreset = {
  color: "#111827",
  opacity: 1,
  fontSize: 42,
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
  backgroundOpacity: 0.85,
  borderEnabled: false,
  borderColor: "#111827",
  borderWidth: 2,
};

const TOOL_GROUPS: Array<{
  label: string;
  tools: Array<{ id: DesignerTool; label: string; icon: string }>;
}> = [
  {
    label: "Sélection",
    tools: [{ id: "select", label: "Sélection", icon: "↖" }],
  },
  {
    label: "Traits",
    tools: [
      { id: "line", label: "Trait", icon: "╱" },
      { id: "arrow", label: "Flèche", icon: "→" },
      { id: "freehand-line", label: "Dessin libre", icon: "〰" },
    ],
  },
  {
    label: "Zones",
    tools: [
      { id: "polygon", label: "Zone", icon: "⬠" },
      { id: "freehand-zone", label: "Zone libre", icon: "⌁" },
      { id: "rectangle", label: "Rectangle", icon: "▭" },
      { id: "circle", label: "Cercle", icon: "○" },
      { id: "ellipse", label: "Ellipse", icon: "⬭" },
      { id: "triangle", label: "Triangle", icon: "△" },
      { id: "diamond", label: "Losange", icon: "◇" },
      { id: "star", label: "Étoile", icon: "☆" },
    ],
  },
  {
    label: "Texte",
    tools: [{ id: "text", label: "Texte", icon: "T" }],
  },
];

function cloneElement<T extends DroMapDrawnMarkerElement>(element: T): T {
  return JSON.parse(JSON.stringify(element)) as T;
}

function cloneElements(elements: DroMapDrawnMarkerElement[]) {
  return elements.map(cloneElement);
}

function elementsEqual(
  first: DroMapDrawnMarkerElement[],
  second: DroMapDrawnMarkerElement[],
) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function smoothPath(points: Point[], smoothing: number, closed: boolean) {
  if (points.length < 3 || smoothing <= 0)
    return points.map((point) => ({ ...point }));
  const passes = Math.max(1, Math.round((smoothing / 100) * 4));
  let current = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < passes; pass += 1) {
    const next: Point[] = [];
    if (!closed) next.push(current[0]);
    const limit = closed ? current.length : current.length - 1;
    for (let index = 0; index < limit; index += 1) {
      const first = current[index];
      const second = current[(index + 1) % current.length];
      next.push({
        x: first.x * 0.75 + second.x * 0.25,
        y: first.y * 0.75 + second.y * 0.25,
      });
      next.push({
        x: first.x * 0.25 + second.x * 0.75,
        y: first.y * 0.25 + second.y * 0.75,
      });
    }
    if (!closed) next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}


function ToolButton({
  tool,
  activeTool,
  onChoose,
}: {
  tool: { id: DesignerTool; label: string; icon: string };
  activeTool: DesignerTool;
  onChoose: (tool: DesignerTool) => void;
}) {
  const active = activeTool === tool.id;
  return (
    <button
      type="button"
      data-dromap-tool-control="true"
      aria-pressed={active}
      onClick={() => onChoose(tool.id)}
      className={[
        "flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 text-center shadow-sm transition",
        active
          ? "border-blue-700 bg-blue-600 text-white shadow-blue-200/70"
          : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60",
      ].join(" ")}
      title={tool.label}
    >
      <span className="flex h-7 items-center justify-center text-xl leading-none">
        {tool.icon}
      </span>
      <span className="max-w-full text-[9px] font-extrabold uppercase leading-none tracking-wide">
        {tool.label}
      </span>
    </button>
  );
}

function SettingSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-3 text-xs font-black text-slate-950">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <ColorPicker value={value} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="dromap-marker-setting-row block text-xs">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        <strong>
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-blue-600"
      />
    </label>
  );
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
      />
    </label>
  );
}

function DashRow({
  value,
  onChange,
}: {
  value: DroMapDrawnMarkerDashStyle;
  onChange: (value: DroMapDrawnMarkerDashStyle) => void;
}) {
  return (
    <label className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>Trait</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as DroMapDrawnMarkerDashStyle)
        }
        className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
      >
        <option value="solid">Plein</option>
        <option value="dashed">Tireté</option>
        <option value="dotted">Pointillé</option>
      </select>
    </label>
  );
}

function HatchingRow({
  value,
  onChange,
}: {
  value: DroMapDrawnMarkerHatchingStyle;
  onChange: (value: DroMapDrawnMarkerHatchingStyle) => void;
}) {
  return (
    <label className="dromap-marker-setting-row flex items-center justify-between gap-3 text-xs">
      <span>Hachures</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as DroMapDrawnMarkerHatchingStyle)
        }
        className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900"
      >
        <option value="none">Aucune</option>
        <option value="diagonal-right">Diagonale /</option>
        <option value="diagonal-left">Diagonale \</option>
        <option value="horizontal">Horizontale</option>
        <option value="vertical">Verticale</option>
      </select>
    </label>
  );
}

function toolTitle(tool: DesignerTool) {
  return (
    TOOL_GROUPS.flatMap((group) => group.tools).find((item) => item.id === tool)
      ?.label ?? "Outil"
  );
}

export function CustomMarkerDesignerModal({
  initialMarker,
  onCancel,
  onSave,
}: CustomMarkerDesignerModalProps) {
  const initialElements = useMemo(
    () => initialMarker?.elements?.map(cloneElement) ?? [],
    [initialMarker],
  );
  const [name, setName] = useState(
    initialMarker?.name ?? "Mon marqueur dessiné",
  );
  const [elements, setElements] =
    useState<DroMapDrawnMarkerElement[]>(initialElements);
  const elementsRef = useRef(elements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    initialElements[0]?.id ?? null,
  );
  const [activeTool, setActiveTool] = useState<DesignerTool>("select");
  const [linePreset, setLinePreset] = useState<LinePreset>(DEFAULT_LINE_PRESET);
  const [zonePreset, setZonePreset] = useState<ZonePreset>(DEFAULT_ZONE_PRESET);
  const [textPreset, setTextPreset] = useState<TextPreset>(DEFAULT_TEXT_PRESET);
  const historyRef = useRef<DroMapDrawnMarkerElement[][]>([
    cloneElements(initialElements),
  ]);
  const historyIndexRef = useRef(0);
  const lastCoalescedRef = useRef<{ key: string; time: number } | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const selectedElement = useMemo(
    () => elements.find((element) => element.id === selectedElementId) ?? null,
    [elements, selectedElementId],
  );
  const selectedShape =
    selectedElement?.type === "shape" ? selectedElement : null;
  const selectedLine =
    selectedElement?.type === "line" || selectedElement?.type === "arrow"
      ? selectedElement
      : null;
  const selectedPath =
    selectedElement?.type === "path" ? selectedElement : null;

  const canUndo = historyVersion >= 0 && historyIndexRef.current > 0;
  const canRedo =
    historyVersion >= 0 &&
    historyIndexRef.current < historyRef.current.length - 1;

  function setElementsWithoutHistory(next: DroMapDrawnMarkerElement[]) {
    elementsRef.current = next;
    setElements(next);
  }

  function commitElements(
    nextInput: DroMapDrawnMarkerElement[],
    coalesceKey?: string,
  ) {
    const next = cloneElements(nextInput);
    const current = elementsRef.current;
    if (elementsEqual(current, next)) return;

    const now = Date.now();
    const canCoalesce =
      coalesceKey &&
      lastCoalescedRef.current?.key === coalesceKey &&
      now - lastCoalescedRef.current.time < 550 &&
      historyIndexRef.current === historyRef.current.length - 1;

    if (canCoalesce) {
      historyRef.current[historyIndexRef.current] = cloneElements(next);
    } else {
      historyRef.current = historyRef.current.slice(
        0,
        historyIndexRef.current + 1,
      );
      historyRef.current.push(cloneElements(next));
      historyIndexRef.current += 1;
    }

    lastCoalescedRef.current = coalesceKey
      ? { key: coalesceKey, time: now }
      : null;
    setElementsWithoutHistory(next);
    setHistoryVersion((value) => value + 1);
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const next = cloneElements(historyRef.current[historyIndexRef.current]);
    setElementsWithoutHistory(next);
    setSelectedElementId((current) =>
      current && next.some((element) => element.id === current)
        ? current
        : null,
    );
    setHistoryVersion((value) => value + 1);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const next = cloneElements(historyRef.current[historyIndexRef.current]);
    setElementsWithoutHistory(next);
    setSelectedElementId((current) =>
      current && next.some((element) => element.id === current)
        ? current
        : null,
    );
    setHistoryVersion((value) => value + 1);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      const modifier = event.ctrlKey || event.metaKey;

      if (!isEditing && modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (!isEditing && modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (
        !isEditing &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedElementId
      ) {
        event.preventDefault();
        commitElements(
          elementsRef.current.filter(
            (element) => element.id !== selectedElementId,
          ),
        );
        setSelectedElementId(null);
        return;
      }
      if (!isEditing && event.key === "Escape") {
        event.preventDefault();
        if (activeTool !== "select") setActiveTool("select");
        else setSelectedElementId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function chooseTool(tool: DesignerTool) {
    setSelectedElementId(null);
    setActiveTool((current) =>
      current === tool && tool !== "select" ? "select" : tool,
    );
  }

  function updateSelectedCommitted(
    updater: (element: DroMapDrawnMarkerElement) => DroMapDrawnMarkerElement,
    key: string,
  ) {
    if (!selectedElementId) return;
    commitElements(
      elementsRef.current.map((element) =>
        element.id === selectedElementId ? updater(element) : element,
      ),
      `selected:${selectedElementId}:${key}`,
    );
  }

  function deleteSelectedElement() {
    if (!selectedElementId) return;
    commitElements(
      elementsRef.current.filter((element) => element.id !== selectedElementId),
    );
    setSelectedElementId(null);
  }

  function moveSelectedElement(direction: "front" | "back") {
    if (!selectedElementId) return;
    const index = elementsRef.current.findIndex(
      (element) => element.id === selectedElementId,
    );
    if (index < 0) return;
    const next = [...elementsRef.current];
    const [element] = next.splice(index, 1);
    if (direction === "front") next.push(element);
    else next.unshift(element);
    commitElements(next);
  }

  function renderLinePresetSettings() {
    return (
      <SettingSection title={`Paramètres — ${toolTitle(activeTool)}`}>
        <ColorRow
          label="Couleur"
          value={linePreset.color}
          onChange={(color) =>
            setLinePreset((current) => ({ ...current, color }))
          }
        />
        <DashRow
          value={linePreset.dashStyle}
          onChange={(dashStyle) =>
            setLinePreset((current) => ({ ...current, dashStyle }))
          }
        />
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
          <CheckRow
            label="Flèche début"
            checked={activeTool === "arrow" ? false : linePreset.arrowStart}
            onChange={(arrowStart) =>
              setLinePreset((current) => ({ ...current, arrowStart }))
            }
          />
          <CheckRow
            label="Flèche fin"
            checked={activeTool === "arrow" ? true : linePreset.arrowEnd}
            onChange={(arrowEnd) =>
              setLinePreset((current) => ({ ...current, arrowEnd }))
            }
          />
        </div>
        <RangeRow
          label="Épaisseur"
          value={linePreset.weight}
          min={1}
          max={24}
          suffix="px"
          onChange={(weight) =>
            setLinePreset((current) => ({ ...current, weight }))
          }
        />
        {activeTool === "freehand-line" ? (
          <RangeRow
            label="Lissage"
            value={linePreset.smoothing}
            min={0}
            max={100}
            suffix="%"
            onChange={(smoothing) =>
              setLinePreset((current) => ({ ...current, smoothing }))
            }
          />
        ) : null}
        <RangeRow
          label="Opacité"
          value={linePreset.opacity}
          min={0.1}
          max={1}
          step={0.05}
          suffix=""
          onChange={(opacity) =>
            setLinePreset((current) => ({ ...current, opacity }))
          }
        />
      </SettingSection>
    );
  }

  function renderZonePresetSettings() {
    return (
      <SettingSection title={`Paramètres — ${toolTitle(activeTool)}`}>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
          <CheckRow
            label="Contour"
            checked={zonePreset.strokeEnabled}
            onChange={(strokeEnabled) =>
              setZonePreset((current) => ({ ...current, strokeEnabled }))
            }
          />
          <CheckRow
            label="Fond"
            checked={zonePreset.fillEnabled}
            onChange={(fillEnabled) =>
              setZonePreset((current) => ({ ...current, fillEnabled }))
            }
          />
        </div>
        <ColorRow
          label="Couleur contour"
          value={zonePreset.color}
          onChange={(color) =>
            setZonePreset((current) => ({ ...current, color }))
          }
        />
        <ColorRow
          label="Couleur fond"
          value={zonePreset.fillColor}
          onChange={(fillColor) =>
            setZonePreset((current) => ({ ...current, fillColor }))
          }
        />
        <DashRow
          value={zonePreset.dashStyle}
          onChange={(dashStyle) =>
            setZonePreset((current) => ({ ...current, dashStyle }))
          }
        />
        <RangeRow
          label="Épaisseur contour"
          value={zonePreset.weight}
          min={1}
          max={24}
          suffix="px"
          onChange={(weight) =>
            setZonePreset((current) => ({ ...current, weight }))
          }
        />
        <RangeRow
          label="Opacité contour"
          value={zonePreset.opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(opacity) =>
            setZonePreset((current) => ({ ...current, opacity }))
          }
        />
        <RangeRow
          label="Opacité fond"
          value={zonePreset.fillOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(fillOpacity) =>
            setZonePreset((current) => ({ ...current, fillOpacity }))
          }
        />
        {activeTool === "freehand-zone" ? (
          <RangeRow
            label="Lissage"
            value={zonePreset.smoothing}
            min={0}
            max={100}
            suffix="%"
            onChange={(smoothing) =>
              setZonePreset((current) => ({ ...current, smoothing }))
            }
          />
        ) : null}
        <HatchingRow
          value={zonePreset.hatchingStyle}
          onChange={(hatchingStyle) =>
            setZonePreset((current) => ({ ...current, hatchingStyle }))
          }
        />
        {zonePreset.hatchingStyle !== "none" ? (
          <>
            <ColorRow
              label="Couleur hachures"
              value={zonePreset.hatchingColor}
              onChange={(hatchingColor) =>
                setZonePreset((current) => ({ ...current, hatchingColor }))
              }
            />
            <RangeRow
              label="Épaisseur hachures"
              value={zonePreset.hatchingWeight}
              min={0.5}
              max={12}
              step={0.5}
              suffix="px"
              onChange={(hatchingWeight) =>
                setZonePreset((current) => ({ ...current, hatchingWeight }))
              }
            />
            <RangeRow
              label="Resserrement"
              value={zonePreset.hatchingSpacing}
              min={3}
              max={60}
              suffix="px"
              onChange={(hatchingSpacing) =>
                setZonePreset((current) => ({ ...current, hatchingSpacing }))
              }
            />
          </>
        ) : null}
        <CheckRow
          label="Points"
          checked={zonePreset.dotsEnabled}
          onChange={(dotsEnabled) =>
            setZonePreset((current) => ({ ...current, dotsEnabled }))
          }
        />
        {zonePreset.dotsEnabled ? (
          <>
            <ColorRow
              label="Couleur points"
              value={zonePreset.dotsColor}
              onChange={(dotsColor) =>
                setZonePreset((current) => ({ ...current, dotsColor }))
              }
            />
            <RangeRow
              label="Rayon points"
              value={zonePreset.dotsRadius}
              min={0.5}
              max={10}
              step={0.5}
              suffix="px"
              onChange={(dotsRadius) =>
                setZonePreset((current) => ({ ...current, dotsRadius }))
              }
            />
            <RangeRow
              label="Espacement points"
              value={zonePreset.dotsSpacing}
              min={3}
              max={60}
              suffix="px"
              onChange={(dotsSpacing) =>
                setZonePreset((current) => ({ ...current, dotsSpacing }))
              }
            />
          </>
        ) : null}
      </SettingSection>
    );
  }

  function renderTextPresetSettings() {
    return (
      <SettingSection title="Paramètres — Texte">
        <ColorRow
          label="Couleur"
          value={textPreset.color}
          onChange={(color) =>
            setTextPreset((current) => ({ ...current, color }))
          }
        />
        <RangeRow
          label="Opacité"
          value={textPreset.opacity}
          min={0.1}
          max={1}
          step={0.05}
          onChange={(opacity) =>
            setTextPreset((current) => ({ ...current, opacity }))
          }
        />
        <RangeRow
          label="Taille"
          value={textPreset.fontSize}
          min={10}
          max={120}
          suffix="px"
          onChange={(fontSize) =>
            setTextPreset((current) => ({ ...current, fontSize }))
          }
        />
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
          <CheckRow
            label="Fond"
            checked={textPreset.backgroundEnabled}
            onChange={(backgroundEnabled) =>
              setTextPreset((current) => ({ ...current, backgroundEnabled }))
            }
          />
          <CheckRow
            label="Cadre"
            checked={textPreset.borderEnabled}
            onChange={(borderEnabled) =>
              setTextPreset((current) => ({ ...current, borderEnabled }))
            }
          />
        </div>
        {textPreset.backgroundEnabled ? (
          <>
            <ColorRow
              label="Couleur fond"
              value={textPreset.backgroundColor}
              onChange={(backgroundColor) =>
                setTextPreset((current) => ({ ...current, backgroundColor }))
              }
            />
            <RangeRow
              label="Opacité fond"
              value={textPreset.backgroundOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(backgroundOpacity) =>
                setTextPreset((current) => ({ ...current, backgroundOpacity }))
              }
            />
          </>
        ) : null}
        {textPreset.borderEnabled ? (
          <>
            <ColorRow
              label="Couleur cadre"
              value={textPreset.borderColor}
              onChange={(borderColor) =>
                setTextPreset((current) => ({ ...current, borderColor }))
              }
            />
            <RangeRow
              label="Épaisseur cadre"
              value={textPreset.borderWidth}
              min={1}
              max={12}
              suffix="px"
              onChange={(borderWidth) =>
                setTextPreset((current) => ({ ...current, borderWidth }))
              }
            />
          </>
        ) : null}
      </SettingSection>
    );
  }

  function renderSelectedSettings() {
    if (!selectedElement) return null;
    const patch = (
      updater: (element: DroMapDrawnMarkerElement) => DroMapDrawnMarkerElement,
      key: string,
    ) => updateSelectedCommitted(updater, key);

    return (
      <SettingSection title="Élément sélectionné">
        {selectedElement.type === "text" ? (
          <>
            <label className="dromap-marker-setting-row block text-xs">
              <span className="mb-1 block">Contenu</span>
              <textarea
                ref={textAreaRef}
                value={selectedElement.text}
                onChange={(event) =>
                  patch(
                    (element) =>
                      element.type === "text"
                        ? { ...element, text: event.target.value || "Texte" }
                        : element,
                    "text",
                  )
                }
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
              />
            </label>
            <ColorRow
              label="Couleur"
              value={selectedElement.color}
              onChange={(color) =>
                patch(
                  (element) =>
                    element.type === "text" ? { ...element, color } : element,
                  "color",
                )
              }
            />
            <RangeRow
              label="Opacité"
              value={selectedElement.opacity ?? 1}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(opacity) =>
                patch(
                  (element) =>
                    element.type === "text" ? { ...element, opacity } : element,
                  "opacity",
                )
              }
            />
            <RangeRow
              label="Taille"
              value={selectedElement.fontSize}
              min={10}
              max={120}
              suffix="px"
              onChange={(fontSize) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? { ...element, fontSize }
                      : element,
                  "font-size",
                )
              }
            />
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
              <CheckRow
                label="Fond"
                checked={selectedElement.backgroundEnabled === true}
                onChange={(backgroundEnabled) =>
                  patch(
                    (element) =>
                      element.type === "text"
                        ? { ...element, backgroundEnabled }
                        : element,
                    "background-enabled",
                  )
                }
              />
              <CheckRow
                label="Cadre"
                checked={selectedElement.borderEnabled === true}
                onChange={(borderEnabled) =>
                  patch(
                    (element) =>
                      element.type === "text"
                        ? { ...element, borderEnabled }
                        : element,
                    "border-enabled",
                  )
                }
              />
            </div>
            {selectedElement.backgroundEnabled ? (
              <>
                <ColorRow
                  label="Couleur fond"
                  value={selectedElement.backgroundColor ?? "#ffffff"}
                  onChange={(backgroundColor) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, backgroundColor }
                          : element,
                      "background-color",
                    )
                  }
                />
                <RangeRow
                  label="Opacité fond"
                  value={selectedElement.backgroundOpacity ?? 0.85}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(backgroundOpacity) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, backgroundOpacity }
                          : element,
                      "background-opacity",
                    )
                  }
                />
              </>
            ) : null}
            {selectedElement.borderEnabled ? (
              <>
                <ColorRow
                  label="Couleur cadre"
                  value={selectedElement.borderColor ?? "#111827"}
                  onChange={(borderColor) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, borderColor }
                          : element,
                      "border-color",
                    )
                  }
                />
                <RangeRow
                  label="Épaisseur cadre"
                  value={selectedElement.borderWidth ?? 2}
                  min={1}
                  max={12}
                  suffix="px"
                  onChange={(borderWidth) =>
                    patch(
                      (element) =>
                        element.type === "text"
                          ? { ...element, borderWidth }
                          : element,
                      "border-width",
                    )
                  }
                />
              </>
            ) : null}
          </>
        ) : (
          <>
            <ColorRow
              label="Couleur contour"
              value={selectedElement.strokeColor}
              onChange={(strokeColor) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, strokeColor },
                  "stroke-color",
                )
              }
            />
            <DashRow
              value={selectedElement.dashStyle ?? "solid"}
              onChange={(dashStyle) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, dashStyle },
                  "dash-style",
                )
              }
            />
            <RangeRow
              label="Épaisseur"
              value={selectedElement.strokeWidth}
              min={1}
              max={24}
              suffix="px"
              onChange={(strokeWidth) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, strokeWidth },
                  "stroke-width",
                )
              }
            />
            <RangeRow
              label="Opacité contour"
              value={selectedElement.strokeOpacity ?? 1}
              min={0.1}
              max={1}
              step={0.05}
              onChange={(strokeOpacity) =>
                patch(
                  (element) =>
                    element.type === "text"
                      ? element
                      : { ...element, strokeOpacity },
                  "stroke-opacity",
                )
              }
            />
            {selectedLine ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
                <CheckRow
                  label="Flèche début"
                  checked={selectedLine.arrowStart === true}
                  onChange={(arrowStart) =>
                    patch(
                      (element) =>
                        element.type === "line" || element.type === "arrow"
                          ? { ...element, arrowStart }
                          : element,
                      "arrow-start",
                    )
                  }
                />
                <CheckRow
                  label="Flèche fin"
                  checked={
                    selectedLine.arrowEnd === true ||
                    selectedLine.type === "arrow"
                  }
                  onChange={(arrowEnd) =>
                    patch(
                      (element) =>
                        element.type === "line" || element.type === "arrow"
                          ? { ...element, type: "line", arrowEnd }
                          : element,
                      "arrow-end",
                    )
                  }
                />
              </div>
            ) : null}
            {selectedPath && !selectedPath.closed ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
                <CheckRow
                  label="Flèche début"
                  checked={selectedPath.arrowStart === true}
                  onChange={(arrowStart) =>
                    patch(
                      (element) =>
                        element.type === "path" && !element.closed
                          ? { ...element, arrowStart }
                          : element,
                      "path-arrow-start",
                    )
                  }
                />
                <CheckRow
                  label="Flèche fin"
                  checked={selectedPath.arrowEnd === true}
                  onChange={(arrowEnd) =>
                    patch(
                      (element) =>
                        element.type === "path" && !element.closed
                          ? { ...element, arrowEnd }
                          : element,
                      "path-arrow-end",
                    )
                  }
                />
              </div>
            ) : null}
          </>
        )}

        {selectedShape || selectedPath?.closed ? (
          <>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2">
              <CheckRow
                label="Contour"
                checked={
                  selectedShape
                    ? selectedShape.strokeEnabled !== false
                    : selectedPath?.strokeEnabled !== false
                }
                onChange={(strokeEnabled) =>
                  patch(
                    (element) =>
                      element.type === "shape" ||
                      (element.type === "path" && element.closed)
                        ? { ...element, strokeEnabled }
                        : element,
                    "stroke-enabled",
                  )
                }
              />
              <CheckRow
                label="Fond"
                checked={
                  selectedShape?.fillEnabled ??
                  selectedPath?.fillEnabled ??
                  false
                }
                onChange={(fillEnabled) =>
                  patch(
                    (element) =>
                      element.type === "shape" ||
                      (element.type === "path" && element.closed)
                        ? { ...element, fillEnabled }
                        : element,
                    "fill-enabled",
                  )
                }
              />
            </div>
            <ColorRow
              label="Couleur fond"
              value={
                selectedShape?.fillColor ?? selectedPath?.fillColor ?? "#2563eb"
              }
              onChange={(fillColor) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, fillColor }
                      : element,
                  "fill-color",
                )
              }
            />
            <RangeRow
              label="Opacité fond"
              value={
                selectedShape?.fillOpacity ?? selectedPath?.fillOpacity ?? 0.25
              }
              min={0}
              max={1}
              step={0.05}
              onChange={(fillOpacity) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, fillOpacity }
                      : element,
                  "fill-opacity",
                )
              }
            />
            <HatchingRow
              value={
                selectedShape?.hatchingStyle ??
                selectedPath?.hatchingStyle ??
                "none"
              }
              onChange={(hatchingStyle) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, hatchingStyle }
                      : element,
                  "hatching-style",
                )
              }
            />
            {(selectedShape?.hatchingStyle ?? selectedPath?.hatchingStyle) &&
            (selectedShape?.hatchingStyle ?? selectedPath?.hatchingStyle) !==
              "none" ? (
              <>
                <ColorRow
                  label="Couleur hachures"
                  value={
                    selectedShape?.hatchingColor ??
                    selectedPath?.hatchingColor ??
                    "#111827"
                  }
                  onChange={(hatchingColor) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, hatchingColor }
                          : element,
                      "hatching-color",
                    )
                  }
                />
                <RangeRow
                  label="Épaisseur hachures"
                  value={
                    selectedShape?.hatchingWeight ??
                    selectedPath?.hatchingWeight ??
                    2
                  }
                  min={0.5}
                  max={12}
                  step={0.5}
                  suffix="px"
                  onChange={(hatchingWeight) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, hatchingWeight }
                          : element,
                      "hatching-weight",
                    )
                  }
                />
                <RangeRow
                  label="Resserrement"
                  value={
                    selectedShape?.hatchingSpacing ??
                    selectedPath?.hatchingSpacing ??
                    14
                  }
                  min={3}
                  max={60}
                  suffix="px"
                  onChange={(hatchingSpacing) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, hatchingSpacing }
                          : element,
                      "hatching-spacing",
                    )
                  }
                />
              </>
            ) : null}
            <CheckRow
              label="Points"
              checked={
                selectedShape?.dotsEnabled ?? selectedPath?.dotsEnabled ?? false
              }
              onChange={(dotsEnabled) =>
                patch(
                  (element) =>
                    element.type === "shape" ||
                    (element.type === "path" && element.closed)
                      ? { ...element, dotsEnabled }
                      : element,
                  "dots-enabled",
                )
              }
            />
            {(selectedShape?.dotsEnabled ?? selectedPath?.dotsEnabled) ? (
              <>
                <ColorRow
                  label="Couleur points"
                  value={
                    selectedShape?.dotsColor ??
                    selectedPath?.dotsColor ??
                    "#111827"
                  }
                  onChange={(dotsColor) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, dotsColor }
                          : element,
                      "dots-color",
                    )
                  }
                />
                <RangeRow
                  label="Rayon points"
                  value={
                    selectedShape?.dotsRadius ?? selectedPath?.dotsRadius ?? 2
                  }
                  min={0.5}
                  max={10}
                  step={0.5}
                  suffix="px"
                  onChange={(dotsRadius) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, dotsRadius }
                          : element,
                      "dots-radius",
                    )
                  }
                />
                <RangeRow
                  label="Espacement points"
                  value={
                    selectedShape?.dotsSpacing ??
                    selectedPath?.dotsSpacing ??
                    14
                  }
                  min={3}
                  max={60}
                  suffix="px"
                  onChange={(dotsSpacing) =>
                    patch(
                      (element) =>
                        element.type === "shape" ||
                        (element.type === "path" && element.closed)
                          ? { ...element, dotsSpacing }
                          : element,
                      "dots-spacing",
                    )
                  }
                />
              </>
            ) : null}
          </>
        ) : null}

        {selectedPath?.rawPoints ? (
          <RangeRow
            label="Lissage"
            value={selectedPath.smoothing ?? 45}
            min={0}
            max={100}
            suffix="%"
            onChange={(smoothing) =>
              patch(
                (element) =>
                  element.type === "path" && element.rawPoints
                    ? {
                        ...element,
                        smoothing,
                        points: smoothPath(
                          element.rawPoints,
                          smoothing,
                          element.closed,
                        ),
                      }
                    : element,
                "smoothing",
              )
            }
          />
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => moveSelectedElement("back")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
          >
            Arrière-plan
          </button>
          <button
            type="button"
            onClick={() => moveSelectedElement("front")}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
          >
            Premier plan
          </button>
        </div>
        <button
          type="button"
          onClick={deleteSelectedElement}
          className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
        >
          Supprimer cet élément
        </button>
      </SettingSection>
    );
  }

  function renderContextSettings() {
    if (selectedElement) return renderSelectedSettings();
    if (
      activeTool === "line" ||
      activeTool === "arrow" ||
      activeTool === "freehand-line"
    ) {
      return renderLinePresetSettings();
    }
    if (
      activeTool === "polygon" ||
      activeTool === "freehand-zone" ||
      activeTool === "rectangle" ||
      activeTool === "circle" ||
      activeTool === "ellipse" ||
      activeTool === "triangle" ||
      activeTool === "diamond" ||
      activeTool === "star"
    ) {
      return renderZonePresetSettings();
    }
    if (activeTool === "text") return renderTextPresetSettings();
    return (
      <SettingSection title="Sélection">
        <p className="text-xs leading-relaxed text-slate-700">
          Clique sur un élément pour afficher uniquement ses paramètres.
          Recliquer sur un outil actif revient à la sélection, comme dans
          l’éditeur de carte.
        </p>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          Aimantation activée entre les centres, angles et extrémités.
        </div>
      </SettingSection>
    );
  }

  const content = (
    <div
      data-dromap-tool-settings-panel="true"
      className="dromap-custom-marker-designer fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/70 p-4"
    >
      <style jsx global>{`
        .dromap-custom-marker-designer .dromap-designer-settings,
        .dromap-custom-marker-designer .dromap-designer-settings label,
        .dromap-custom-marker-designer
          .dromap-designer-settings
          .dromap-marker-setting-row,
        .dromap-custom-marker-designer
          .dromap-designer-settings
          .dromap-marker-setting-row
          span,
        .dromap-custom-marker-designer
          .dromap-designer-settings
          .dromap-marker-setting-row
          strong {
          color: #334155 !important;
          opacity: 1 !important;
        }
        .dromap-custom-marker-designer .dromap-designer-settings input,
        .dromap-custom-marker-designer .dromap-designer-settings textarea,
        .dromap-custom-marker-designer .dromap-designer-settings select {
          color: #0f172a !important;
          opacity: 1 !important;
        }
        .dromap-custom-marker-designer input[type="range"] {
          opacity: 1 !important;
        }
      `}</style>
      <section className="flex h-[min(920px,calc(100vh-2rem))] w-[min(1400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-white shadow-lg">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-950">
              {initialMarker ? "Modifier le marqueur" : "Dessiner un marqueur"}
            </h2>
            <p className="truncate text-xs text-slate-600">
              Sélectionne, déplace, redimensionne et fais pivoter directement,
              dans l’interface DroMap habituelle.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Annuler — Ctrl+Z"
            >
              ↶
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Rétablir — Ctrl+Y"
            >
              ↷
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)_300px]">
          <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-3">
            {TOOL_GROUPS.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                  {group.label}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.tools.map((tool) => (
                    <ToolButton
                      key={tool.id}
                      tool={tool}
                      activeTool={activeTool}
                      onChoose={chooseTool}
                    />
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <main className="min-h-0 overflow-auto bg-slate-100 p-4">
            <div className="relative mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-lg">
              <CustomMarkerFabricCanvas
                elements={elements}
                activeTool={activeTool}
                selectedElementId={selectedElementId}
                linePreset={linePreset}
                zonePreset={zonePreset}
                textPreset={textPreset}
                onSelectElement={setSelectedElementId}
                onCommitElements={commitElements}
                onSwitchToSelect={() => setActiveTool("select")}
              />
            </div>
          </main>

          <aside className="dromap-designer-settings overflow-y-auto border-l border-slate-200 bg-white p-4 text-slate-900">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-800">
                Nom du marqueur
              </span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="mt-4">{renderContextSettings()}</div>
          </aside>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <span className="text-xs text-slate-600">
            {elements.length} élément{elements.length > 1 ? "s" : ""} · Ctrl+Z
            pour annuler
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={elements.length === 0 || name.trim().length === 0}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  elements,
                  dataUrl: createDrawnMarkerDataUrl(elements),
                })
              }
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              Enregistrer dans Mes marqueurs
            </button>
          </div>
        </footer>
      </section>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(content, document.body);
}
