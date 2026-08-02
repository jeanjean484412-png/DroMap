"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

type ColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

type HsvColor = { h: number; s: number; v: number };

type PopoverPosition = {
  left: number;
  top: number;
};

const PRESET_COLORS = [
  "#111827",
  "#334155",
  "#64748b",
  "#94a3b8",
  "#ffffff",
  "#dc2626",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#7c2d12",
  "#14532d",
  "#1e3a8a",
];

const RECENT_COLORS_STORAGE_KEY = "dromap-recent-colors-v1";
const MAX_RECENT_COLORS = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string, fallback = "#111827") {
  const trimmed = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return fallback;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function componentToHex(value: number) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): HsvColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }

  if (h < 0) h += 360;
  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToHex({ h, s, v }: HsvColor) {
  const chroma = v * s;
  const segment = h / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const m = v - chroma;
  let r = 0;
  let g = 0;
  let b = 0;

  if (segment < 1) [r, g, b] = [chroma, x, 0];
  else if (segment < 2) [r, g, b] = [x, chroma, 0];
  else if (segment < 3) [r, g, b] = [0, chroma, x];
  else if (segment < 4) [r, g, b] = [0, x, chroma];
  else if (segment < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function getPopoverPosition(anchor: HTMLElement): PopoverPosition {
  const rect = anchor.getBoundingClientRect();
  const width = 300;
  const height = 560;
  const margin = 10;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  const left = clamp(rect.left, margin, maxLeft);
  const canOpenBelow = rect.bottom + height + margin <= window.innerHeight;
  const top = canOpenBelow
    ? rect.bottom + 8
    : clamp(rect.top - height - 8, margin, maxTop);
  return { left, top };
}

function readRecentColors() {
  if (typeof window === "undefined") return [] as string[];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_COLORS_STORAGE_KEY) ?? "[]",
    );

    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed
          .filter((value): value is string => typeof value === "string")
          .map((value) => normalizeHex(value))
          .filter(Boolean),
      ),
    ).slice(0, MAX_RECENT_COLORS);
  } catch {
    return [];
  }
}

function saveRecentColors(colors: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RECENT_COLORS_STORAGE_KEY,
      JSON.stringify(colors.slice(0, MAX_RECENT_COLORS)),
    );
  } catch {
    // Le sélecteur reste fonctionnel même si le stockage local est bloqué.
  }
}

export function ColorPicker({
  value,
  onChange,
  disabled = false,
  ariaLabel = "Choisir une couleur",
  className = "",
  onInteractionStart,
  onInteractionEnd,
}: ColorPickerProps) {
  const normalizedValue = normalizeHex(value);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const saturationRef = useRef<HTMLDivElement | null>(null);
  const interactionActiveRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ left: 12, top: 12 });
  const [draftColor, setDraftColor] = useState(normalizedValue);
  const [hexDraft, setHexDraft] = useState(normalizedValue);
  const [recentColors, setRecentColors] = useState<string[]>([]);

  const hsv = useMemo(() => {
    const rgb = hexToRgb(draftColor);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  }, [draftColor]);

  const beginInteraction = useCallback(() => {
    if (interactionActiveRef.current) return;
    interactionActiveRef.current = true;
    onInteractionStart?.();
  }, [onInteractionStart]);

  const endInteraction = useCallback(() => {
    if (!interactionActiveRef.current) return;
    interactionActiveRef.current = false;
    onInteractionEnd?.();
  }, [onInteractionEnd]);

  const closeWithoutApplying = useCallback(() => {
    endInteraction();
    setDraftColor(normalizedValue);
    setHexDraft(normalizedValue);
    setOpen(false);
  }, [endInteraction, normalizedValue]);

  useEffect(() => {
    if (open) return;
    setDraftColor(normalizedValue);
    setHexDraft(normalizedValue);
  }, [normalizedValue, open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const updatePosition = () => {
      if (buttonRef.current) setPosition(getPopoverPosition(buttonRef.current));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRecentColors(readRecentColors());

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      closeWithoutApplying();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeWithoutApplying();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeWithoutApplying, open]);

  function setDraft(nextColor: string) {
    const normalized = normalizeHex(nextColor, draftColor);
    setDraftColor(normalized);
    setHexDraft(normalized);
  }

  function applyHsv(next: HsvColor) {
    setDraft(
      hsvToHex({
        h: ((next.h % 360) + 360) % 360,
        s: clamp(next.s, 0, 1),
        v: clamp(next.v, 0, 1),
      }),
    );
  }

  function updateSaturation(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = saturationRef.current?.getBoundingClientRect();
    if (!rect) return;
    applyHsv({
      h: hsv.h,
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
    });
  }

  function normalizeHexDraft() {
    if (
      /^#[0-9a-f]{6}$/i.test(hexDraft.trim()) ||
      /^#[0-9a-f]{3}$/i.test(hexDraft.trim())
    ) {
      setDraft(normalizeHex(hexDraft));
    } else {
      setHexDraft(draftColor);
    }
  }

  function validateColor() {
    const nextColor = normalizeHex(draftColor);
    beginInteraction();
    onChange(nextColor);
    endInteraction();

    const nextRecentColors = [
      nextColor,
      ...recentColors.filter((color) => color !== nextColor),
    ].slice(0, MAX_RECENT_COLORS);
    setRecentColors(nextRecentColors);
    saveRecentColors(nextRecentColors);
    setOpen(false);
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const hasChanges = draftColor !== normalizedValue;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            closeWithoutApplying();
            return;
          }

          setDraftColor(normalizedValue);
          setHexDraft(normalizedValue);
          setRecentColors(readRecentColors());
          setOpen(true);
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={`${ariaLabel} : ${normalizedValue.toUpperCase()}`}
        className={[
          "group relative inline-flex h-9 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white p-1 shadow-sm transition hover:border-indigo-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        ].join(" ")}
      >
        <span
          className="h-full w-full rounded-lg border border-black/10 shadow-inner"
          style={{ backgroundColor: normalizedValue }}
        />
        <span className="absolute bottom-0.5 right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-200 bg-white text-[8px] text-slate-500 shadow-sm">
          ▾
        </span>
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              data-dromap-tool-settings-panel="true"
              className="fixed z-[10000] max-h-[calc(100vh-1rem)] w-[300px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl ring-1 ring-black/5"
              style={{ left: position.left, top: position.top }}
              role="dialog"
              aria-label={ariaLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-slate-900">Couleur</div>
                  <div className="text-[11px] text-slate-500">
                    La modification n’est appliquée qu’après validation.
                  </div>
                </div>
                <span
                  className="h-9 w-14 rounded-xl border border-black/10 shadow-inner"
                  style={{ backgroundColor: draftColor }}
                />
              </div>

              <div
                ref={saturationRef}
                className="relative h-40 cursor-crosshair touch-none overflow-hidden rounded-xl border border-slate-200 shadow-inner"
                style={{
                  backgroundColor: hueColor,
                  backgroundImage:
                    "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
                }}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  updateSaturation(event);
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    updateSaturation(event);
                  }
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
              >
                <span
                  className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.65)]"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`,
                  }}
                />
              </div>

              <label className="mt-3 block">
                <span className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Teinte</span>
                  <span>{Math.round(hsv.h)}°</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="359"
                  step="1"
                  value={Math.round(hsv.h)}
                  onChange={(event) =>
                    applyHsv({ ...hsv, h: Number(event.currentTarget.value) })
                  }
                  className="h-4 w-full cursor-pointer rounded-full border border-slate-200"
                  style={{
                    background:
                      "linear-gradient(to right,#ef4444,#eab308,#22c55e,#06b6d4,#3b82f6,#a855f7,#ef4444)",
                  }}
                />
              </label>

              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Code hexadécimal
                </span>
                <input
                  type="text"
                  value={hexDraft}
                  onChange={(event) => setHexDraft(event.currentTarget.value)}
                  onBlur={normalizeHexDraft}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      normalizeHexDraft();
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              {recentColors.length > 0 ? (
                <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-2.5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                    Couleurs récentes
                  </div>
                  <div className="grid grid-cols-8 gap-2">
                    {recentColors.map((recentColor) => (
                      <button
                        key={recentColor}
                        type="button"
                        onClick={() => setDraft(recentColor)}
                        className={[
                          "h-7 w-7 rounded-lg border shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-300",
                          recentColor === draftColor
                            ? "border-indigo-700 ring-2 ring-indigo-200"
                            : "border-black/10",
                        ].join(" ")}
                        style={{ backgroundColor: recentColor }}
                        title={recentColor.toUpperCase()}
                        aria-label={`Réutiliser ${recentColor}`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Couleurs rapides
                </div>
                <div className="grid grid-cols-10 gap-1.5">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDraft(preset)}
                      className={[
                        "h-5 w-5 rounded-md border shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-300",
                        preset.toLowerCase() === draftColor
                          ? "border-indigo-600 ring-2 ring-indigo-200"
                          : "border-black/10",
                      ].join(" ")}
                      style={{ backgroundColor: preset }}
                      aria-label={`Choisir ${preset}`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={closeWithoutApplying}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={validateColor}
                  className="rounded-xl border border-indigo-700 bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  {hasChanges ? "Valider la couleur" : "Valider"}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
