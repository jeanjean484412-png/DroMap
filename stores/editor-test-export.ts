import { create } from "zustand";

export type ExportLegendPosition = "right" | "left" | "bottom" | "map";

export type ExportLegendMapPosition = {
  x: number;
  y: number;
};

/** Position libre normalisée dans le rectangle de carte (centre de l’élément). */
export type ExportMapElementCustomPosition = ExportLegendMapPosition;
export type ExportScaleBarStyle = "bar" | "alternating" | "line" | "boxed";
export type ExportNorthArrowStyle = "classic" | "simple" | "compass" | "needle";

export type ExportLegendCustomSymbol =
  "marker" | "line" | "arrow" | "zone" | "text";

export type ExportLegendSymbolStyle = {
  kind?: ExportLegendCustomSymbol;
  size?: number;
  markerSymbolId?: string;
  color?: string;
  opacity?: number;
  weight?: number;
  dashStyle?: "solid" | "dashed" | "dotted";
  dashLength?: number;
  dashGap?: number;
  dotSpacing?: number;
  fillColor?: string;
  fillOpacity?: number;
  markerFilled?: boolean;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  zoneStrokeEnabled?: boolean;
  zoneFillEnabled?: boolean;
  zoneHatchingStyle?:
    "none" | "diagonal-right" | "diagonal-left" | "horizontal" | "vertical";
  zoneHatchingColor?: string;
  zoneHatchingWeight?: number;
  zoneHatchingSpacing?: number;
  zoneDotsEnabled?: boolean;
  zoneDotsColor?: string;
  zoneDotsRadius?: number;
  zoneDotsSpacing?: number;
};

export type ExportLegendCustomEntry = {
  id: string;
  label: string;
  section: string;
  symbol: ExportLegendCustomSymbol;
  color: string;
  fillColor: string;
  dashStyle: "solid" | "dashed" | "dotted";
  symbolStyle?: ExportLegendSymbolStyle;
};
export type ExportMapElementPosition =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type ExportFormat =
  "auto" | "16-9" | "4-3" | "a4-landscape" | "a4-portrait" | "square";

type EditorTestExportState = {
  isExportPanelOpen: boolean;
  isImportPanelOpen: boolean;
  legendTitle: string;
  legendPosition: ExportLegendPosition;
  legendMapPosition: ExportLegendMapPosition;
  legendMapTitlePosition: ExportLegendMapPosition;
  exportFormat: ExportFormat;
  showBasemapLabels: boolean;

  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;
  legendSymbolSize: number;
  legendItemGap: number;
  legendLabelGap: number;
  legendLabelLineHeight: number;
  legendSectionGap: number;
  legendMapBorderEnabled: boolean;
  legendMapBorderColor: string;
  legendMapBorderWidth: number;
  legendMapBorderRadius: number;
  legendMapPadding: number;
  customLegendEntries: ExportLegendCustomEntry[];
  legendSymbolOverrides: Record<string, ExportLegendSymbolStyle>;

  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;
  scaleBarPosition: ExportMapElementPosition;
  scaleBarMapPosition: ExportMapElementCustomPosition | null;
  northArrowEnabled: boolean;
  northArrowStyle: ExportNorthArrowStyle;
  northArrowPosition: ExportMapElementPosition;
  northArrowMapPosition: ExportMapElementCustomPosition | null;

  hiddenLegendFeatureIds: string[];
  hiddenLegendGroupKeys: string[];
  legendFeatureOrder: string[];
  legendGroupOrder: string[];
  legendSectionOrder: string[];
  legendGroupLabels: Record<string, string>;
  legendGroupSections: Record<string, string>;

  openExportPanel: () => void;
  closeExportPanel: () => void;
  openImportPanel: () => void;
  closeImportPanel: () => void;
  setLegendTitle: (title: string) => void;
  setLegendPosition: (position: ExportLegendPosition) => void;
  setLegendMapPosition: (position: ExportLegendMapPosition) => void;
  setLegendMapTitlePosition: (position: ExportLegendMapPosition) => void;
  setExportFormat: (format: ExportFormat) => void;
  setShowBasemapLabels: (visible: boolean) => void;

  setLegendBackgroundColor: (color: string) => void;
  setLegendSideWidth: (width: number) => void;
  setLegendBottomHeight: (height: number) => void;
  setLegendTitleFontSize: (fontSize: number) => void;
  setLegendItemFontSize: (fontSize: number) => void;
  setLegendSectionTitleFontSize: (fontSize: number) => void;
  setLegendSymbolSize: (size: number) => void;
  setLegendItemGap: (gap: number) => void;
  setLegendLabelGap: (gap: number) => void;
  setLegendLabelLineHeight: (lineHeight: number) => void;
  setLegendSectionGap: (gap: number) => void;
  setLegendMapBorderEnabled: (enabled: boolean) => void;
  setLegendMapBorderColor: (color: string) => void;
  setLegendMapBorderWidth: (width: number) => void;
  setLegendMapBorderRadius: (radius: number) => void;
  setLegendMapPadding: (padding: number) => void;
  addCustomLegendEntry: (
    input?: Partial<Omit<ExportLegendCustomEntry, "id">>,
  ) => string;
  updateCustomLegendEntry: (
    id: string,
    patch: Partial<Omit<ExportLegendCustomEntry, "id">>,
  ) => void;
  removeCustomLegendEntry: (id: string) => void;
  setCustomLegendEntries: (entries: ExportLegendCustomEntry[]) => void;
  setLegendSymbolOverride: (
    groupKey: string,
    patch: Partial<ExportLegendSymbolStyle>,
  ) => void;
  resetLegendSymbolOverride: (groupKey: string) => void;
  setLegendSymbolOverrides: (
    overrides: Record<string, ExportLegendSymbolStyle>,
  ) => void;
  setScaleBarEnabled: (enabled: boolean) => void;
  setScaleBarStyle: (style: ExportScaleBarStyle) => void;
  setScaleBarPosition: (position: ExportMapElementPosition) => void;
  setScaleBarMapPosition: (
    position: ExportMapElementCustomPosition | null,
  ) => void;
  setNorthArrowEnabled: (enabled: boolean) => void;
  setNorthArrowStyle: (style: ExportNorthArrowStyle) => void;
  setNorthArrowPosition: (position: ExportMapElementPosition) => void;
  setNorthArrowMapPosition: (
    position: ExportMapElementCustomPosition | null,
  ) => void;

  setLegendFeatureOrder: (featureIds: string[]) => void;
  setLegendGroupOrder: (groupKeys: string[]) => void;
  toggleLegendFeatureVisibility: (featureId: string) => void;
  toggleLegendGroupVisibility: (groupKey: string) => void;
  setLegendGroupLabel: (groupKey: string, label: string) => void;
  setLegendGroupSection: (groupKey: string, section: string) => void;
  addLegendSection: () => void;
  renameLegendSection: (currentSection: string, nextSection: string) => void;
  removeLegendSection: (section: string) => void;
  resetExportLegendConfig: () => void;
};

export const DEFAULT_LEGEND_SECTION = "Général";
const DEFAULT_NEW_LEGEND_SECTION_BASE = "Sous-légende";

function normalizeSectionName(section: string) {
  const trimmedSection = section.trim();

  return trimmedSection.length > 0 ? trimmedSection : DEFAULT_LEGEND_SECTION;
}

function normalizeSectionKey(section: string) {
  return normalizeSectionName(section).toLowerCase();
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function appendSectionIfNeeded(sectionOrder: string[], section: string) {
  const normalizedSection = normalizeSectionName(section);

  if (
    normalizeSectionKey(normalizedSection) ===
    normalizeSectionKey(DEFAULT_LEGEND_SECTION)
  ) {
    return sectionOrder;
  }

  const hasSection = sectionOrder.some(
    (existingSection) =>
      normalizeSectionKey(existingSection) ===
      normalizeSectionKey(normalizedSection),
  );

  return hasSection ? sectionOrder : [...sectionOrder, normalizedSection];
}

function createNewSectionName(existingSections: string[]) {
  const existingKeys = new Set(existingSections.map(normalizeSectionKey));

  for (let index = 1; index < 100; index += 1) {
    const candidate = `${DEFAULT_NEW_LEGEND_SECTION_BASE} ${index}`;

    if (!existingKeys.has(normalizeSectionKey(candidate))) {
      return candidate;
    }
  }

  return `${DEFAULT_NEW_LEGEND_SECTION_BASE} ${Date.now()}`;
}

function createCustomLegendEntryId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `legend-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useEditorTestExportStore = create<EditorTestExportState>(
  (set) => ({
    isExportPanelOpen: false,
    isImportPanelOpen: false,
    legendTitle: "Légende",
    legendPosition: "right",
    legendMapPosition: { x: 0, y: 0.84 },
    legendMapTitlePosition: { x: 0.5, y: 0 },
    exportFormat: "auto",
    showBasemapLabels: true,

    legendBackgroundColor: "#ffffff",
    legendSideWidth: 420,
    legendBottomHeight: 0,
    legendTitleFontSize: 32,
    legendItemFontSize: 24,
    legendSectionTitleFontSize: 20,
    legendSymbolSize: 48,
    legendItemGap: 16,
    legendLabelGap: 18,
    legendLabelLineHeight: 1.2,
    legendSectionGap: 16,
    legendMapBorderEnabled: true,
    legendMapBorderColor: "#ffffff",
    legendMapBorderWidth: 1,
    legendMapBorderRadius: 12,
    legendMapPadding: 10,
    customLegendEntries: [],
    legendSymbolOverrides: {},

    scaleBarEnabled: true,
    scaleBarStyle: "alternating",
    scaleBarPosition: "bottom-left",
    scaleBarMapPosition: null,
    northArrowEnabled: true,
    northArrowStyle: "classic",
    northArrowPosition: "top-right",
    northArrowMapPosition: null,

    hiddenLegendFeatureIds: [],
    hiddenLegendGroupKeys: [],
    legendFeatureOrder: [],
    legendGroupOrder: [],
    legendSectionOrder: [],
    legendGroupLabels: {},
    legendGroupSections: {},

    openExportPanel: () => {
      set({ isExportPanelOpen: true, isImportPanelOpen: false });
    },

    closeExportPanel: () => {
      set({ isExportPanelOpen: false });
    },

    openImportPanel: () => {
      set({ isImportPanelOpen: true, isExportPanelOpen: false });
    },

    closeImportPanel: () => {
      set({ isImportPanelOpen: false });
    },

    setLegendTitle: (title) => {
      set({ legendTitle: title });
    },

    setLegendPosition: (position) => {
      set({ legendPosition: position });
    },

    setLegendMapPosition: (position) => {
      set({
        legendMapPosition: {
          x: Math.min(1, Math.max(0, position.x)),
          y: Math.min(1, Math.max(0, position.y)),
        },
      });
    },

    setLegendMapTitlePosition: (position) => {
      set({
        legendMapTitlePosition: {
          x: Math.min(1, Math.max(0, position.x)),
          y: Math.min(1, Math.max(0, position.y)),
        },
      });
    },

    setExportFormat: (format) => {
      set({ exportFormat: format });
    },

    setShowBasemapLabels: (visible) => {
      set({ showBasemapLabels: visible });
    },

    setLegendBackgroundColor: (color) => {
      set({ legendBackgroundColor: color });
    },

    setLegendSideWidth: (width) => {
      set({ legendSideWidth: width });
    },

    setLegendBottomHeight: (height) => {
      set({ legendBottomHeight: height });
    },

    setLegendTitleFontSize: (fontSize) => {
      set({ legendTitleFontSize: fontSize });
    },

    setLegendItemFontSize: (fontSize) => {
      set({ legendItemFontSize: fontSize });
    },

    setLegendSectionTitleFontSize: (fontSize) => {
      set({ legendSectionTitleFontSize: fontSize });
    },

    setLegendSymbolSize: (size) => {
      set({ legendSymbolSize: Math.min(144, Math.max(24, size)) });
    },

    setLegendItemGap: (gap) => {
      set({ legendItemGap: Math.min(40, Math.max(0, gap)) });
    },

    setLegendLabelGap: (gap) => {
      set({ legendLabelGap: Math.min(48, Math.max(0, gap)) });
    },

    setLegendLabelLineHeight: (lineHeight) => {
      set({
        legendLabelLineHeight: Math.min(1.8, Math.max(0.8, lineHeight)),
      });
    },

    setLegendSectionGap: (gap) => {
      set({ legendSectionGap: Math.min(48, Math.max(0, gap)) });
    },

    setLegendMapBorderEnabled: (enabled) => {
      set({ legendMapBorderEnabled: enabled });
    },

    setLegendMapBorderColor: (color) => {
      set({ legendMapBorderColor: color });
    },

    setLegendMapBorderWidth: (width) => {
      set({ legendMapBorderWidth: Math.min(12, Math.max(1, width)) });
    },

    setLegendMapBorderRadius: (radius) => {
      set({ legendMapBorderRadius: Math.min(40, Math.max(0, radius)) });
    },

    setLegendMapPadding: (padding) => {
      set({ legendMapPadding: Math.min(48, Math.max(0, padding)) });
    },

    addCustomLegendEntry: (input = {}) => {
      const id = createCustomLegendEntryId();
      const symbol = input.symbol ?? "marker";
      const color = input.color ?? "#111827";
      const fillColor = input.fillColor ?? "#ffffff";
      const dashStyle = input.dashStyle ?? "solid";
      const section = normalizeSectionName(
        input.section ?? DEFAULT_LEGEND_SECTION,
      );
      const label =
        typeof input.label === "string" && input.label.trim().length > 0
          ? input.label
          : "Nouvel élément";
      const symbolStyle: ExportLegendSymbolStyle = {
        kind: symbol,
        color,
        fillColor,
        dashStyle,
        ...(input.symbolStyle ?? {}),
      };

      set((state) => ({
        customLegendEntries: [
          ...state.customLegendEntries,
          {
            id,
            label,
            section,
            symbol,
            color,
            fillColor,
            dashStyle,
            symbolStyle,
          },
        ],
        legendGroupOrder: uniqueValues([
          ...state.legendGroupOrder,
          `custom:${id}`,
        ]),
        legendSectionOrder: appendSectionIfNeeded(
          state.legendSectionOrder,
          section,
        ),
      }));

      return id;
    },

    updateCustomLegendEntry: (id, patch) => {
      set((state) => {
        const groupKey = `custom:${id}`;
        const nextLabels = { ...state.legendGroupLabels };
        const nextSections = { ...state.legendGroupSections };
        let nextSectionOrder = state.legendSectionOrder;

        if (typeof patch.label === "string") {
          nextLabels[groupKey] = patch.label;
        }

        if (typeof patch.section === "string") {
          const normalizedSection = normalizeSectionName(patch.section);
          nextSections[groupKey] = normalizedSection;
          nextSectionOrder = appendSectionIfNeeded(
            state.legendSectionOrder,
            normalizedSection,
          );
        }

        return {
          customLegendEntries: state.customLegendEntries.map((entry) =>
            entry.id === id ? { ...entry, ...patch, id } : entry,
          ),
          legendGroupLabels: nextLabels,
          legendGroupSections: nextSections,
          legendSectionOrder: nextSectionOrder,
        };
      });
    },

    removeCustomLegendEntry: (id) => {
      set((state) => {
        const groupKey = `custom:${id}`;
        const nextLabels = { ...state.legendGroupLabels };
        const nextSections = { ...state.legendGroupSections };
        delete nextLabels[groupKey];
        delete nextSections[groupKey];

        return {
          customLegendEntries: state.customLegendEntries.filter(
            (entry) => entry.id !== id,
          ),
          hiddenLegendGroupKeys: state.hiddenLegendGroupKeys.filter(
            (key) => key !== groupKey,
          ),
          legendGroupOrder: state.legendGroupOrder.filter(
            (key) => key !== groupKey,
          ),
          legendGroupLabels: nextLabels,
          legendGroupSections: nextSections,
          legendSymbolOverrides: Object.fromEntries(
            Object.entries(state.legendSymbolOverrides).filter(
              ([key]) => key !== groupKey,
            ),
          ),
        };
      });
    },

    setCustomLegendEntries: (entries) => {
      set({ customLegendEntries: entries });
    },

    setLegendSymbolOverride: (groupKey, patch) => {
      set((state) => {
        const current = state.legendSymbolOverrides[groupKey] ?? {};
        const next = { ...current, ...patch };

        return {
          legendSymbolOverrides: {
            ...state.legendSymbolOverrides,
            [groupKey]: next,
          },
        };
      });
    },

    resetLegendSymbolOverride: (groupKey) => {
      set((state) => {
        const next = { ...state.legendSymbolOverrides };
        delete next[groupKey];
        return { legendSymbolOverrides: next };
      });
    },

    setLegendSymbolOverrides: (overrides) => {
      set({ legendSymbolOverrides: overrides });
    },

    setScaleBarEnabled: (enabled) => {
      set({ scaleBarEnabled: enabled });
    },

    setScaleBarStyle: (style) => {
      set({ scaleBarStyle: style });
    },

    setScaleBarPosition: (position) => {
      set({ scaleBarPosition: position, scaleBarMapPosition: null });
    },

    setScaleBarMapPosition: (position) => {
      set({
        scaleBarMapPosition: position
          ? {
              x: Math.min(1, Math.max(0, position.x)),
              y: Math.min(1, Math.max(0, position.y)),
            }
          : null,
      });
    },

    setNorthArrowEnabled: (enabled) => {
      set({ northArrowEnabled: enabled });
    },

    setNorthArrowStyle: (style) => {
      set({ northArrowStyle: style });
    },

    setNorthArrowPosition: (position) => {
      set({ northArrowPosition: position, northArrowMapPosition: null });
    },

    setNorthArrowMapPosition: (position) => {
      set({
        northArrowMapPosition: position
          ? {
              x: Math.min(1, Math.max(0, position.x)),
              y: Math.min(1, Math.max(0, position.y)),
            }
          : null,
      });
    },

    setLegendFeatureOrder: (featureIds) => {
      set({
        legendFeatureOrder: uniqueValues(featureIds),
      });
    },

    setLegendGroupOrder: (groupKeys) => {
      set({
        legendGroupOrder: uniqueValues(groupKeys),
      });
    },

    toggleLegendFeatureVisibility: (featureId) => {
      set((state) => {
        const isHidden = state.hiddenLegendFeatureIds.includes(featureId);

        return {
          hiddenLegendFeatureIds: isHidden
            ? state.hiddenLegendFeatureIds.filter((id) => id !== featureId)
            : [...state.hiddenLegendFeatureIds, featureId],
        };
      });
    },

    toggleLegendGroupVisibility: (groupKey) => {
      set((state) => {
        const isHidden = state.hiddenLegendGroupKeys.includes(groupKey);

        return {
          hiddenLegendGroupKeys: isHidden
            ? state.hiddenLegendGroupKeys.filter((key) => key !== groupKey)
            : [...state.hiddenLegendGroupKeys, groupKey],
        };
      });
    },

    setLegendGroupLabel: (groupKey, label) => {
      set((state) => ({
        legendGroupLabels: {
          ...state.legendGroupLabels,
          [groupKey]: label,
        },
      }));
    },

    setLegendGroupSection: (groupKey, section) => {
      const normalizedSection = normalizeSectionName(section);

      set((state) => {
        const nextSections = { ...state.legendGroupSections };
        const nextSectionOrder = appendSectionIfNeeded(
          state.legendSectionOrder,
          normalizedSection,
        );

        if (
          normalizeSectionKey(normalizedSection) ===
          normalizeSectionKey(DEFAULT_LEGEND_SECTION)
        ) {
          delete nextSections[groupKey];
        } else {
          nextSections[groupKey] = normalizedSection;
        }

        return {
          legendGroupSections: nextSections,
          legendSectionOrder: nextSectionOrder,
        };
      });
    },

    addLegendSection: () => {
      set((state) => {
        const sections = [
          DEFAULT_LEGEND_SECTION,
          ...state.legendSectionOrder,
          ...Object.values(state.legendGroupSections),
        ];
        const newSection = createNewSectionName(sections);

        return {
          legendSectionOrder: appendSectionIfNeeded(
            state.legendSectionOrder,
            newSection,
          ),
        };
      });
    },

    renameLegendSection: (currentSection, nextSection) => {
      const normalizedCurrent = normalizeSectionName(currentSection);
      const normalizedNext = normalizeSectionName(nextSection);

      if (
        normalizeSectionKey(normalizedCurrent) ===
        normalizeSectionKey(normalizedNext)
      ) {
        return;
      }

      set((state) => {
        const nextSections = { ...state.legendGroupSections };

        for (const [groupKey, section] of Object.entries(nextSections)) {
          if (
            normalizeSectionKey(section) !==
            normalizeSectionKey(normalizedCurrent)
          ) {
            continue;
          }

          if (
            normalizeSectionKey(normalizedNext) ===
            normalizeSectionKey(DEFAULT_LEGEND_SECTION)
          ) {
            delete nextSections[groupKey];
          } else {
            nextSections[groupKey] = normalizedNext;
          }
        }

        const sectionOrder = state.legendSectionOrder
          .map((section) =>
            normalizeSectionKey(section) ===
            normalizeSectionKey(normalizedCurrent)
              ? normalizedNext
              : section,
          )
          .filter(
            (section) =>
              normalizeSectionKey(section) !==
              normalizeSectionKey(DEFAULT_LEGEND_SECTION),
          );

        return {
          legendGroupSections: nextSections,
          legendSectionOrder: uniqueValues(sectionOrder),
        };
      });
    },

    removeLegendSection: (section) => {
      const normalizedSection = normalizeSectionName(section);

      if (
        normalizeSectionKey(normalizedSection) ===
        normalizeSectionKey(DEFAULT_LEGEND_SECTION)
      ) {
        return;
      }

      set((state) => {
        const nextSections = { ...state.legendGroupSections };

        for (const [groupKey, groupSection] of Object.entries(nextSections)) {
          if (
            normalizeSectionKey(groupSection) ===
            normalizeSectionKey(normalizedSection)
          ) {
            delete nextSections[groupKey];
          }
        }

        return {
          legendGroupSections: nextSections,
          legendSectionOrder: state.legendSectionOrder.filter(
            (existingSection) =>
              normalizeSectionKey(existingSection) !==
              normalizeSectionKey(normalizedSection),
          ),
        };
      });
    },

    resetExportLegendConfig: () => {
      set({
        legendTitle: "Légende",
        legendMapPosition: { x: 0, y: 0.84 },
        legendMapTitlePosition: { x: 0.5, y: 0 },
        exportFormat: "auto",
        showBasemapLabels: true,
        legendBackgroundColor: "#ffffff",
        legendSideWidth: 420,
        legendBottomHeight: 0,
        legendTitleFontSize: 32,
        legendItemFontSize: 24,
        legendSectionTitleFontSize: 20,
        legendSymbolSize: 48,
        legendItemGap: 16,
        legendLabelGap: 18,
        legendLabelLineHeight: 1.2,
        legendSectionGap: 16,
        legendMapBorderEnabled: true,
        legendMapBorderColor: "#ffffff",
        legendMapBorderWidth: 1,
        legendMapBorderRadius: 12,
        legendMapPadding: 10,
        customLegendEntries: [],
        legendSymbolOverrides: {},
        scaleBarEnabled: true,
        scaleBarStyle: "alternating",
        scaleBarPosition: "bottom-left",
        scaleBarMapPosition: null,
        northArrowEnabled: true,
        northArrowStyle: "classic",
        northArrowPosition: "top-right",
        northArrowMapPosition: null,
        hiddenLegendFeatureIds: [],
        hiddenLegendGroupKeys: [],
        legendFeatureOrder: [],
        legendGroupOrder: [],
        legendSectionOrder: [],
        legendGroupLabels: {},
        legendGroupSections: {},
      });
    },
  }),
);
