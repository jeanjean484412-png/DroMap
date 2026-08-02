"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useEditorTestBasemapStore } from "@/stores/editor-test-basemap";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";
import {
  bringFloatingPanelToFront,
  getInitialFloatingPanelZIndex,
} from "./floating-panel-z-index";

import {
  DROMAP_BASEMAP_MENU_SECTIONS,
  dromapBasemapHasCountryNeighborContext,
  getDromapBasemapConfig,
  isDromapBasemapId,
  type DromapBasemapConfig,
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

function isWhiteBasemap(basemapId: DromapBasemapId) {
  return getDromapBasemapConfig(basemapId).kind === "solid";
}

function shouldAutoWorkspaceForWhiteBasemap(basemapId: DromapBasemapId) {
  const basemap = getDromapBasemapConfig(basemapId);

  return (
    basemap.kind === "solid" &&
    Boolean(basemap.boundaryOverlay) &&
    !isWorldSolidBasemap(basemapId)
  );
}

const IGN_SATELLITE_PREVIEW_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=10&TILEROW=352&TILECOL=518";
const IGN_PLAN_PREVIEW_URL =
  "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&FORMAT=image/png&TILEMATRIXSET=PM&TILEMATRIX=10&TILEROW=352&TILECOL=518";

function BasemapVectorPreview(input: { variant: "classic" | "light" }) {
  const isLight = input.variant === "light";

  return (
    <svg
      viewBox="0 0 120 76"
      className="h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="120" height="76" fill={isLight ? "#eaf3f5" : "#a9d4df"} />
      <path
        d="M-8 6 C20 1 29 10 46 7 C65 4 70 18 91 14 C106 11 115 16 128 12 L128 83 L-8 83 Z"
        fill={isLight ? "#f7f7f5" : "#f2efe9"}
      />
      <path
        d="M5 61 C25 46 32 53 49 44 C66 35 73 42 90 34 C102 28 111 31 125 24"
        fill="none"
        stroke={isLight ? "#d4d4d4" : "#d9c2a0"}
        strokeWidth="7"
      />
      <path
        d="M5 61 C25 46 32 53 49 44 C66 35 73 42 90 34 C102 28 111 31 125 24"
        fill="none"
        stroke={isLight ? "#ffffff" : "#ffffff"}
        strokeWidth="3.5"
      />
      <path
        d="M18 4 C29 19 35 31 47 75 M71 4 C67 22 69 44 83 75"
        fill="none"
        stroke={isLight ? "#dcdcdc" : "#e7d7bf"}
        strokeWidth="2.5"
      />
      <path
        d="M12 19 C26 15 36 19 42 27 C32 35 18 34 9 29 Z"
        fill={isLight ? "#e6eee4" : "#b8d7a8"}
      />
      <path
        d="M81 48 C94 41 109 45 118 55 L118 74 L91 74 Z"
        fill={isLight ? "#e8eee5" : "#c4ddb5"}
      />
      <circle cx="63" cy="39" r="3.2" fill={isLight ? "#9ca3af" : "#e11d48"} />
      <text
        x="68"
        y="37"
        fontSize="7"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
        fill={isLight ? "#6b7280" : "#374151"}
      >
        Ville
      </text>
      <text
        x="24"
        y="53"
        fontSize="6"
        fontFamily="system-ui, sans-serif"
        fill={isLight ? "#9ca3af" : "#64748b"}
      >
        Rivière
      </text>
    </svg>
  );
}

function WhiteBasemapFranceExample() {
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center gap-3">
        <span
          className="relative block h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-inner"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 140 100"
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect width="140" height="100" fill="#f8fafc" />
            <path
              d="M48 12 L77 9 L101 25 L108 49 L92 72 L70 89 L45 78 L27 58 L31 31 Z"
              fill="#ffffff"
              stroke="#111827"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
            <path
              d="M48 12 L54 35 L31 31 M77 9 L72 34 L101 25 M54 35 L72 34 L83 52 L59 55 Z M31 58 L59 55 L45 78 M83 52 L108 49 M83 52 L92 72 M59 55 L70 89"
              fill="none"
              stroke="#64748b"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
            <path
              d="M113 70 C118 73 119 81 115 88 C111 85 109 77 113 70 Z"
              fill="#ffffff"
              stroke="#111827"
              strokeWidth="1.6"
            />
          </svg>
          <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/60" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Aperçu des fonds blancs
          </span>
          <span className="mt-1 block text-sm font-semibold text-slate-900">
            Exemple avec la France
          </span>
          <span className="mt-1 block text-xs leading-snug text-slate-500">
            Le rendu reste blanc et épuré ; seules les frontières affichées
            changent selon le fond choisi.
          </span>
        </span>
      </div>
    </div>
  );
}

function BasemapSolidPreview(input: { basemap: DromapBasemapConfig }) {
  const hasBoundaries = Boolean(input.basemap.boundaryOverlay);
  const background =
    input.basemap.kind === "solid"
      ? input.basemap.background
      : input.basemap.exportBackground;

  return (
    <svg
      viewBox="0 0 120 76"
      className="h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="120" height="76" fill={background} />
      {hasBoundaries ? (
        <>
          <path
            d="M8 23 C18 9 38 7 49 17 C56 23 51 30 60 35 C68 40 63 52 49 56 C31 62 19 53 12 45 C4 37 3 31 8 23 Z"
            fill="#ffffff"
            stroke="#111827"
            strokeWidth="1.4"
          />
          <path
            d="M68 12 C83 6 104 11 112 23 C119 34 112 43 102 48 C94 52 96 64 83 69 C74 65 69 56 70 47 C71 38 62 30 64 22 C65 18 66 15 68 12 Z"
            fill="#ffffff"
            stroke="#111827"
            strokeWidth="1.4"
          />
          <path
            d="M23 14 L31 29 L22 45 M39 11 L43 28 L54 37 M75 15 L84 29 L74 45 M92 11 L96 29 L108 38"
            fill="none"
            stroke="#64748b"
            strokeWidth="0.8"
          />
        </>
      ) : (
        <path
          d="M14 60 L34 39 L48 49 L65 23 L82 41 L101 17"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1.3"
          strokeDasharray="4 4"
        />
      )}
    </svg>
  );
}

function BasemapPreviewThumbnail(input: {
  basemapId: DromapBasemapId;
  compact?: boolean;
}) {
  const basemap = getDromapBasemapConfig(input.basemapId);
  const previewImageUrl =
    input.basemapId === "ign-satellite"
      ? IGN_SATELLITE_PREVIEW_URL
      : input.basemapId === "ign-plan" || input.basemapId === "ign-plan-raster"
        ? IGN_PLAN_PREVIEW_URL
        : null;
  const sizeClassName = input.compact ? "h-10 w-16" : "h-16 w-24";

  return (
    <span
      className={`relative block ${sizeClassName} shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-inner`}
      aria-hidden="true"
    >
      {previewImageUrl ? (
        <>
          <BasemapSolidPreview basemap={basemap} />
          <span
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${previewImageUrl})` }}
          />
        </>
      ) : input.basemapId === "openfreemap-liberty" ? (
        <BasemapVectorPreview variant="classic" />
      ) : input.basemapId === "openfreemap-positron" ? (
        <BasemapVectorPreview variant="light" />
      ) : (
        <BasemapSolidPreview basemap={basemap} />
      )}
      <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/40" />
    </span>
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
      lat: clampNumber(
        south - latPadding,
        WORKSPACE_MIN_LAT,
        WORKSPACE_MAX_LAT,
      ),
      lng: clampNumber(west - lngPadding, WORKSPACE_MIN_LNG, WORKSPACE_MAX_LNG),
    },
    northEast: {
      lat: clampNumber(
        north + latPadding,
        WORKSPACE_MIN_LAT,
        WORKSPACE_MAX_LAT,
      ),
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
  const showCountryNeighborContext = useEditorTestBasemapStore(
    (state) => state.showCountryNeighborContext,
  );
  const setShowCountryNeighborContext = useEditorTestBasemapStore(
    (state) => state.setShowCountryNeighborContext,
  );
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
  const selectedBasemapHidesPreview =
    isWhiteBasemap(basemapId) && basemapId !== "blank-white";
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
    const hasExistingWorkspace = workspaceBounds !== null;

    /**
     * Une zone déjà créée appartient au projet, pas au fond de carte.
     *
     * Changer de fond ne doit donc jamais :
     * - remplacer ses coordonnées ;
     * - relancer sa validation ;
     * - demander un fitBounds ;
     * - modifier le centre ou le niveau de zoom actuellement affiché.
     *
     * La création automatique d'une zone autour d'un fond blanc pays,
     * continent ou région reste disponible uniquement lorsqu'aucune zone de
     * travail n'existe encore.
     */
    const shouldAutoWorkspace =
      !hasExistingWorkspace &&
      shouldAutoWorkspaceForWhiteBasemap(nextBasemapId);
    const shouldPreserveCurrentWorkspaceView = hasExistingWorkspace;

    setBasemapId(nextBasemapId, {
      fit: !shouldPreserveCurrentWorkspaceView && !shouldAutoWorkspace,
    });
    setIsOpen(false);

    if (!shouldAutoWorkspace) {
      return;
    }

    try {
      const { getBasemapViewportBounds } =
        await import("./basemap-viewport-bounds");
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
    const showIndividualPreview =
      !isWhiteBasemap(nextBasemapId) || nextBasemapId === "blank-white";

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
        <span
          className={`flex ${
            showIndividualPreview ? "items-center gap-3" : "items-start"
          }`}
        >
          {showIndividualPreview ? (
            <BasemapPreviewThumbnail basemapId={nextBasemapId} />
          ) : null}
          <span className="min-w-0 flex-1">
            {path ? (
              <span className="mb-0.5 block truncate text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {path}
              </span>
            ) : null}
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-slate-500">
              {description}
            </span>
          </span>
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
          className="group flex min-w-56 cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 border-emerald-200 bg-white/95 px-3 py-2.5 text-left text-slate-900 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-white hover:shadow-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-600 text-white shadow-sm transition group-hover:bg-emerald-500">
              {!selectedBasemapHidesPreview ? (
                <span className="absolute inset-0 opacity-45">
                  <BasemapPreviewThumbnail basemapId={basemapId} compact />
                </span>
              ) : null}
              <svg
                aria-hidden="true"
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="relative drop-shadow"
              >
                <path d="m3 6 5-2 8 2 5-2v14l-5 2-8-2-5 2V6Z" />
                <path d="M8 4v14M16 6v14" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black uppercase tracking-wide text-emerald-700">
                Fond de carte
              </span>
              <span className="block max-w-36 truncate font-bold text-slate-950">
                {selectedBasemap.label}
              </span>
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 transition group-hover:bg-emerald-100">
            Choisir ▾
          </span>
        </button>
      ) : (
        <div className="flex max-h-[calc(100vh-2rem)] w-[440px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {!selectedBasemapHidesPreview ? (
                <BasemapPreviewThumbnail basemapId={basemapId} />
              ) : null}
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

          {dromapBasemapHasCountryNeighborContext(selectedBasemap) ? (
            <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-slate-100">
              <input
                type="checkbox"
                checked={showCountryNeighborContext}
                onChange={(event) =>
                  setShowCountryNeighborContext(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">
                  Afficher les pays voisins
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                  Montre seulement le début du contour des pays qui touchent
                  directement le pays choisi, sans afficher leurs frontières
                  internes ni leur territoire entier.
                </span>
              </span>
            </label>
          ) : null}

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

              {activeSection.id === "white-vector" ? (
                <WhiteBasemapFranceExample />
              ) : null}

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
