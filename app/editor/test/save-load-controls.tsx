"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { DroMapFeature } from "@/lib/dromap/feature";
import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

const LOCAL_SAVE_KEY = "dromap-editor-test-save-v1";

type LocalSavePayload = {
  schemaVersion: 1;
  savedAt: string;
  features: DroMapFeature[];
  workspaceBounds: WorkspaceBounds | null;
};

type FloatingPanelPosition = {
  top: number;
  left: number;
};

function isLocalSavePayload(value: unknown): value is LocalSavePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LocalSavePayload>;

  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.savedAt === "string" &&
    Array.isArray(candidate.features) &&
    "workspaceBounds" in candidate
  );
}

function getPanelPosition(button: HTMLButtonElement): FloatingPanelPosition {
  const rect = button.getBoundingClientRect();
  const panelWidth = 260;
  const panelHeight = 210;
  const preferredLeft = rect.right + 12;

  return {
    top: Math.max(16, Math.min(rect.top, window.innerHeight - panelHeight - 16)),
    left: Math.max(
      16,
      Math.min(preferredLeft, window.innerWidth - panelWidth - 16),
    ),
  };
}

export function SaveLoadControls() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const features = useEditorTestFeaturesStore((state) => state.features);
  const replaceFeatures = useEditorTestFeaturesStore(
    (state) => state.replaceFeatures,
  );

  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );
  const setWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.setWorkspaceBounds,
  );
  const clearWorkspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.clearWorkspaceBounds,
  );
  const validateWorkspaceZone = useEditorTestWorkspaceStore(
    (state) => state.validateWorkspaceZone,
  );

  const clearSelectedFeatureId = useEditorTestSelectionStore(
    (state) => state.clearSelectedFeatureId,
  );

  const [hasMounted, setHasMounted] = useState(false);
  const [hasLocalSave, setHasLocalSave] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelPosition, setPanelPosition] =
    useState<FloatingPanelPosition | null>(null);

  useEffect(() => {
    setHasMounted(true);
    setHasLocalSave(localStorage.getItem(LOCAL_SAVE_KEY) !== null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      if (!buttonRef.current) {
        return;
      }

      setPanelPosition(getPanelPosition(buttonRef.current));
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  if (!hasMounted) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          aria-label="Sauvegarde locale"
          aria-disabled="true"
          tabIndex={-1}
          className="flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-xl border border-neutral-200 bg-neutral-100 text-lg font-bold text-neutral-400 shadow-sm"
        >
          💾
        </button>
      </div>
    );
  }

  function handleSave() {
    const payload: LocalSavePayload = {
      schemaVersion: 1,
      savedAt: new Date().toISOString(),
      features,
      workspaceBounds,
    };

    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(payload));
    setHasLocalSave(true);
    setStatus(`${features.length} objet(s) sauvegardé(s).`);
  }

  function handleLoad() {
    const rawSave = localStorage.getItem(LOCAL_SAVE_KEY);

    if (!rawSave) {
      setStatus("Aucune sauvegarde.");
      return;
    }

    try {
      const parsedSave: unknown = JSON.parse(rawSave);

      if (!isLocalSavePayload(parsedSave)) {
        setStatus("Sauvegarde invalide.");
        return;
      }

      replaceFeatures(parsedSave.features);
      clearSelectedFeatureId();

      if (parsedSave.workspaceBounds) {
        setWorkspaceBounds(parsedSave.workspaceBounds);
        validateWorkspaceZone();
      } else {
        clearWorkspaceBounds();
      }

      setStatus(`${parsedSave.features.length} objet(s) chargé(s).`);
    } catch {
      setStatus("Lecture impossible.");
    }
  }

  function handleClearSave() {
    const confirmed = window.confirm("Effacer la sauvegarde locale ?");

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(LOCAL_SAVE_KEY);
    setHasLocalSave(false);
    setStatus("Sauvegarde effacée.");
  }

  const panel =
    isOpen && panelPosition
      ? createPortal(
          <section
            className="fixed z-[3000] w-64 rounded-2xl border border-black/10 bg-white/95 p-3 text-xs shadow-2xl backdrop-blur"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-neutral-900">
                  Sauvegarde locale
                </div>
                <div className="text-[10px] text-neutral-500">
                  Navigateur uniquement
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-2 py-1 text-xs text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                Fermer
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="rounded-xl bg-neutral-900 px-3 py-2 font-medium text-white transition hover:bg-neutral-700"
              >
                Enregistrer
              </button>

              <button
                type="button"
                onClick={handleLoad}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2 font-medium text-neutral-900 transition hover:bg-neutral-50"
              >
                Charger
              </button>

              <button
                type="button"
                onClick={handleClearSave}
                aria-disabled={!hasLocalSave}
                className={[
                  "col-span-2 rounded-xl border px-3 py-2 font-medium transition",
                  hasLocalSave
                    ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                    : "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400",
                ].join(" ")}
              >
                Effacer sauvegarde
              </button>
            </div>

            {status ? (
              <p className="mt-2 rounded-xl bg-neutral-100 px-2 py-1 text-[11px] text-neutral-700">
                {status}
              </p>
            ) : null}
          </section>,
          document.body,
        )
      : null;

  return (
    <div className="flex justify-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (buttonRef.current) {
            setPanelPosition(getPanelPosition(buttonRef.current));
          }

          setIsOpen((current) => !current);
        }}
        title="Sauvegarde locale"
        aria-label="Sauvegarde locale"
        className={[
          "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shadow-sm transition",
          isOpen
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50",
        ].join(" ")}
      >
        💾
      </button>

      {panel}
    </div>
  );
}