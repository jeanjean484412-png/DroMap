"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import { bringFloatingPanelToFront, getInitialFloatingPanelZIndex } from "./floating-panel-z-index";

import {
  DROMAP_BASEMAP_MENU_SECTIONS,
  getDromapBasemapConfig,
  isDromapBasemapId,
  type DromapBasemapId,
  type DromapBasemapMenuItem,
  type DromapBasemapMenuSection,
} from "@/lib/dromap/basemap";

type BasemapSearchResult = {
  basemapId: DromapBasemapId;
  label: string;
  description: string;
  path: string;
  searchText: string;
};

type BasemapMenuPath = {
  sectionId: string;
  groupIds: string[];
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getBasemapMenuItemKey(item: DromapBasemapMenuItem, index: number) {
  if (item.type === "basemap") {
    return `basemap-${item.basemapId}-${index}`;
  }

  return `group-${item.id}-${index}`;
}

function collectBasemapSearchResults(
  items: DromapBasemapMenuItem[],
  path: string[] = [],
): BasemapSearchResult[] {
  const results: BasemapSearchResult[] = [];

  for (const item of items) {
    if (item.type === "group") {
      results.push(
        ...collectBasemapSearchResults(item.items, [...path, item.label]),
      );
      continue;
    }

    if (!isDromapBasemapId(item.basemapId)) {
      continue;
    }

    const basemap = getDromapBasemapConfig(item.basemapId);
    const label = item.label ?? basemap.label;
    const description = item.description ?? basemap.description;
    const pathLabel = path.join(" › ");

    results.push({
      basemapId: item.basemapId,
      label,
      description,
      path: pathLabel,
      searchText: normalizeSearchText(
        `${pathLabel} ${label} ${description} ${basemap.label} ${basemap.description}`,
      ),
    });
  }

  return results;
}

function collectDefaultOpenGroupIds(items: DromapBasemapMenuItem[]): string[] {
  const groupIds: string[] = [];

  for (const item of items) {
    if (item.type !== "group") {
      continue;
    }

    if (item.defaultOpen) {
      groupIds.push(item.id);
    }

    groupIds.push(...collectDefaultOpenGroupIds(item.items));
  }

  return groupIds;
}

function findBasemapPathInItems(
  items: DromapBasemapMenuItem[],
  basemapId: DromapBasemapId,
  groupIds: string[] = [],
): string[] | null {
  for (const item of items) {
    if (item.type === "basemap") {
      if (item.basemapId === basemapId) {
        return groupIds;
      }

      continue;
    }

    const foundPath = findBasemapPathInItems(item.items, basemapId, [
      ...groupIds,
      item.id,
    ]);

    if (foundPath) {
      return foundPath;
    }
  }

  return null;
}

function findBasemapPath(basemapId: DromapBasemapId): BasemapMenuPath | null {
  for (const section of DROMAP_BASEMAP_MENU_SECTIONS) {
    const groupIds = findBasemapPathInItems(section.items, basemapId);

    if (groupIds) {
      return {
        sectionId: section.id,
        groupIds,
      };
    }
  }

  return null;
}

function getInitialOpenGroupIds(section: DromapBasemapMenuSection) {
  return new Set(collectDefaultOpenGroupIds(section.items));
}

const WORLD_SOLID_BASEMAP_IDS = new Set<DromapBasemapId>([
  "blank-white",
  "white-borders",
  "white-borders-basic",
]);

function isWorldSolidBasemap(basemapId: DromapBasemapId) {
  return WORLD_SOLID_BASEMAP_IDS.has(basemapId);
}

function shouldAutoWorkspaceForWhiteBasemap(basemapId: DromapBasemapId) {
  const basemap = getDromapBasemapConfig(basemapId);

  return (
    basemap.kind === "solid" &&
    Boolean(basemap.boundaryOverlay) &&
    !isWorldSolidBasemap(basemapId)
  );
}

type LeafletBoundsLike = {
  getSouth(): number;
  getWest(): number;
  getNorth(): number;
  getEast(): number;
};

const WORKSPACE_MIN_LAT = -85.05112878;
const WORKSPACE_MAX_LAT = 85.05112878;
const WORKSPACE_MIN_LNG = -240;
const WORKSPACE_MAX_LNG = 240;

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, min), max);
}

function createWorkspaceBoundsAroundBasemap(bounds: LeafletBoundsLike) {
  const rawSouth = bounds.getSouth();
  const rawWest = bounds.getWest();
  const rawNorth = bounds.getNorth();
  const rawEast = bounds.getEast();
  const south = Math.min(rawSouth, rawNorth);
  const north = Math.max(rawSouth, rawNorth);
  const west = Math.min(rawWest, rawEast);
  const east = Math.max(rawWest, rawEast);
  const latSpan = Math.max(0.000001, north - south);
  const lngSpan = Math.max(0.000001, east - west);

  /**
   * Petite marge visuelle : la zone de travail entoure le pays/continent au
   * lieu de coller exactement aux frontières. Elle reste volontairement
   * modérée pour ne pas recréer de grandes zones vides.
   */
  const latPadding = Math.min(10, Math.max(0.15, latSpan * 0.05));
  const lngPadding = Math.min(10, Math.max(0.15, lngSpan * 0.05));

  return {
    southWest: {
      lat: clampNumber(south - latPadding, WORKSPACE_MIN_LAT, WORKSPACE_MAX_LAT),
      lng: clampNumber(west - lngPadding, WORKSPACE_MIN_LNG, WORKSPACE_MAX_LNG),
    },
    northEast: {
      lat: clampNumber(north + latPadding, WORKSPACE_MIN_LAT, WORKSPACE_MAX_LAT),
      lng: clampNumber(east + lngPadding, WORKSPACE_MIN_LNG, WORKSPACE_MAX_LNG),
    },
  };
}

export function BasemapControls() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(
    DROMAP_BASEMAP_MENU_SECTIONS[0]?.id ?? "classic",
  );
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(
    () =>
      new Set(
        collectDefaultOpenGroupIds(
          DROMAP_BASEMAP_MENU_SECTIONS[0]?.items ?? [],
        ),
      ),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [hasOpenedMenuOnce, setHasOpenedMenuOnce] = useState(false);
  const [panelZIndex, setPanelZIndex] = useState(
    getInitialFloatingPanelZIndex(),
  );
  const menuScrollRef = useRef<HTMLDivElement | null>(null);
  const menuScrollTopRef = useRef(0);

  const basemapId = useEditorTestBasemapStore((state) => state.basemapId);
  const setBasemapId = useEditorTestBasemapStore((state) => state.setBasemapId);
  const currentMode = useEditorTestModeStore((state) => state.currentMode);
  const workspaceBounds = useEditorTestWorkspaceStore(
    (state) => state.workspaceBounds,
  );

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      if (menuScrollRef.current) {
        menuScrollRef.current.scrollTop = menuScrollTopRef.current;
      }
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen]);

  const selectedBasemap = getDromapBasemapConfig(basemapId);
  const activeSection =
    DROMAP_BASEMAP_MENU_SECTIONS.find(
      (section) => section.id === activeSectionId,
    ) ?? DROMAP_BASEMAP_MENU_SECTIONS[0];

  const allSearchResults = useMemo(
    () =>
      DROMAP_BASEMAP_MENU_SECTIONS.flatMap((section) =>
        collectBasemapSearchResults(section.items, [section.label]),
      ),
    [],
  );
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const searchResults = normalizedSearchQuery
    ? allSearchResults.filter((result) =>
        result.searchText.includes(normalizedSearchQuery),
      )
    : [];

  if (!hasMounted) {
    return null;
  }

  function openBasemapMenu() {
    if (!hasOpenedMenuOnce) {
      const selectedPath = findBasemapPath(basemapId);
      const nextSectionId = selectedPath?.sectionId ?? activeSectionId;
      const nextSection =
        DROMAP_BASEMAP_MENU_SECTIONS.find(
          (section) => section.id === nextSectionId,
        ) ?? DROMAP_BASEMAP_MENU_SECTIONS[0];

      setActiveSectionId(nextSection.id);
      setOpenGroupIds(getInitialOpenGroupIds(nextSection));
      setHasOpenedMenuOnce(true);
    }

    setPanelZIndex(bringFloatingPanelToFront());
    setIsOpen(true);
  }

  function rememberMenuScroll() {
    menuScrollTopRef.current = menuScrollRef.current?.scrollTop ?? 0;
  }

  function resetMenuScroll() {
    menuScrollTopRef.current = 0;
    if (menuScrollRef.current) {
      menuScrollRef.current.scrollTop = 0;
    }
  }

  async function chooseBasemap(nextBasemapId: DromapBasemapId) {
    if (!isDromapBasemapId(nextBasemapId)) {
      return;
    }

    rememberMenuScroll();

    const nextBasemap = getDromapBasemapConfig(nextBasemapId);
    const hasActiveWorkspace = currentMode === "edit" && workspaceBounds !== null;
    /**
     * Les fonds blancs pays/continents/régions doivent créer leur zone de
     * travail automatiquement même au tout premier choix, quand aucune zone
     * n'a encore été dessinée. Avant, cette création était conditionnée à
     * hasActiveWorkspace, donc elle ne se lançait qu'après validation d'une
     * zone existante.
     */
    const shouldAutoWorkspace =
      shouldAutoWorkspaceForWhiteBasemap(nextBasemapId);
    const keepCurrentWorkspaceView =
      hasActiveWorkspace &&
      (nextBasemap.kind === "tile" ||
        nextBasemap.kind === "maplibre" ||
        isWorldSolidBasemap(nextBasemapId));

    setBasemapId(nextBasemapId, {
      fit: !keepCurrentWorkspaceView && !shouldAutoWorkspace,
    });
    setIsOpen(false);

    if (!shouldAutoWorkspace) {
      return;
    }

    try {
      const { getBasemapViewportBounds } = await import(
        "./basemap-viewport-bounds"
      );
      const bounds = await getBasemapViewportBounds(nextBasemap);

      if (!bounds.isValid()) {
        return;
      }

      const nextWorkspaceBounds = createWorkspaceBoundsAroundBasemap(bounds);
      const workspaceStore = useEditorTestWorkspaceStore.getState();

      workspaceStore.setWorkspaceBounds(nextWorkspaceBounds);
      workspaceStore.validateWorkspaceZone();
    } catch (error) {
      console.warn(
        "Impossible de créer automatiquement la zone de travail du fond sélectionné.",
        error,
      );
    }
  }

  function activateSection(section: DromapBasemapMenuSection) {
    resetMenuScroll();
    setActiveSectionId(section.id);
    setSearchQuery("");
    setOpenGroupIds(getInitialOpenGroupIds(section));
  }

  function toggleGroup(groupId: string, open: boolean) {
    setOpenGroupIds((currentGroupIds) => {
      const nextGroupIds = new Set(currentGroupIds);

      if (open) {
        nextGroupIds.add(groupId);
      } else {
        nextGroupIds.delete(groupId);
      }

      return nextGroupIds;
    });
  }

  function renderBasemapButton({
    basemapId: nextBasemapId,
    label,
    description,
    path,
  }: {
    basemapId: DromapBasemapId;
    label: string;
    description: string;
    path?: string;
  }) {
    const isSelected = nextBasemapId === basemapId;

    return (
      <button
        key={`${nextBasemapId}-${label}-${path ?? ""}`}
        type="button"
        onClick={() => chooseBasemap(nextBasemapId)}
        className={`w-full rounded-xl border px-3 py-2 text-left transition ${
          isSelected
            ? "border-indigo-300 bg-indigo-50 text-indigo-950 shadow-sm"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        {path ? (
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {path}
          </span>
        ) : null}
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">
          {description}
        </span>
      </button>
    );
  }

  function renderMenuItem(item: DromapBasemapMenuItem, depth = 0, index = 0) {
    if (item.type === "basemap") {
      if (!isDromapBasemapId(item.basemapId)) {
        return null;
      }

      const basemap = getDromapBasemapConfig(item.basemapId);

      return renderBasemapButton({
        basemapId: item.basemapId,
        label: item.label ?? basemap.label,
        description: item.description ?? basemap.description,
      });
    }

    return (
      <details
        key={getBasemapMenuItemKey(item, index)}
        open={openGroupIds.has(item.id)}
        onToggle={(event) => toggleGroup(item.id, event.currentTarget.open)}
        className="rounded-xl border border-slate-200 bg-slate-50/70"
      >
        <summary className="cursor-pointer select-none rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
          {item.label}
          {item.description ? (
            <span className="mt-0.5 block pr-2 text-xs font-normal leading-snug text-slate-500">
              {item.description}
            </span>
          ) : null}
        </summary>
        <div className="space-y-2 px-2 pb-2">
          {item.items.map((childItem, childIndex) =>
            renderMenuItem(childItem, depth + 1, childIndex),
          )}
        </div>
      </details>
    );
  }

  return (
    <section
      className="absolute right-4 top-4 text-sm"
      style={{ zIndex: panelZIndex }}
      onMouseDown={(event) => {
        event.stopPropagation();
        setPanelZIndex(bringFloatingPanelToFront());
      }}
      onFocusCapture={() => setPanelZIndex(bringFloatingPanelToFront())}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {!isOpen ? (
        <button
          type="button"
          onClick={openBasemapMenu}
          aria-expanded={isOpen}
          className="flex min-w-56 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-left text-slate-900 shadow-lg backdrop-blur transition hover:border-slate-300 hover:bg-white"
        >
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Fond de carte
            </span>
            <span className="block max-w-48 truncate font-semibold">
              {selectedBasemap.label}
            </span>
          </span>
          <span className="text-slate-400">▾</span>
        </button>
      ) : (
        <div className="flex max-h-[calc(100vh-2rem)] w-[440px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fond actif
              </p>
              <p className="mt-0.5 truncate font-semibold text-slate-950">
                {selectedBasemap.label}
              </p>
              <p className="mt-1 text-xs leading-snug text-slate-500">
                {selectedBasemap.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                rememberMenuScroll();
                setIsOpen(false);
              }}
              className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Fermer
            </button>
          </div>

          <input
            value={searchQuery}
            onChange={(event) => {
              resetMenuScroll();
              setSearchQuery(event.target.value);
            }}
            placeholder="Rechercher un pays ou un fond…"
            className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />

          {normalizedSearchQuery ? (
            <div
              ref={menuScrollRef}
              onScroll={rememberMenuScroll}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
            >
              {searchResults.length > 0 ? (
                searchResults.slice(0, 80).map((result) =>
                  renderBasemapButton({
                    basemapId: result.basemapId,
                    label: result.label,
                    description: result.description,
                    path: result.path,
                  }),
                )
              ) : (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                  Aucun fond trouvé.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-2 rounded-xl bg-slate-100 p-1">
                {DROMAP_BASEMAP_MENU_SECTIONS.map((section) => {
                  const isActive = section.id === activeSection.id;

                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => activateSection(section)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? "bg-white text-slate-950 shadow-sm"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {section.label}
                    </button>
                  );
                })}
              </div>

              <p className="mb-2 text-xs leading-snug text-slate-500">
                {activeSection.description}
              </p>

              <div
                ref={menuScrollRef}
                onScroll={rememberMenuScroll}
                className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
              >
                {activeSection.items.map((item, index) =>
                  renderMenuItem(item, 0, index),
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
