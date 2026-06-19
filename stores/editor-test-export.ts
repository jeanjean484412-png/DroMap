import { create } from "zustand";

export type ExportLegendPosition = "right" | "left" | "bottom";
export type ExportScaleBarStyle = "bar" | "alternating" | "line" | "boxed";

export type ExportFormat =
  | "auto"
  | "16-9"
  | "4-3"
  | "a4-landscape"
  | "a4-portrait"
  | "square";

type EditorTestExportState = {
  isExportPanelOpen: boolean;
  isImportPanelOpen: boolean;
  legendTitle: string;
  legendPosition: ExportLegendPosition;
  exportFormat: ExportFormat;

  legendBackgroundColor: string;
  legendSideWidth: number;
  legendBottomHeight: number;
  legendTitleFontSize: number;
  legendItemFontSize: number;
  legendSectionTitleFontSize: number;

  scaleBarEnabled: boolean;
  scaleBarStyle: ExportScaleBarStyle;

  hiddenLegendFeatureIds: string[];
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
  setExportFormat: (format: ExportFormat) => void;

  setLegendBackgroundColor: (color: string) => void;
  setLegendSideWidth: (width: number) => void;
  setLegendBottomHeight: (height: number) => void;
  setLegendTitleFontSize: (fontSize: number) => void;
  setLegendItemFontSize: (fontSize: number) => void;
  setLegendSectionTitleFontSize: (fontSize: number) => void;
  setScaleBarEnabled: (enabled: boolean) => void;
  setScaleBarStyle: (style: ExportScaleBarStyle) => void;

  setLegendFeatureOrder: (featureIds: string[]) => void;
  setLegendGroupOrder: (groupKeys: string[]) => void;
  toggleLegendFeatureVisibility: (featureId: string) => void;
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

  if (normalizeSectionKey(normalizedSection) === normalizeSectionKey(DEFAULT_LEGEND_SECTION)) {
    return sectionOrder;
  }

  const hasSection = sectionOrder.some(
    (existingSection) => normalizeSectionKey(existingSection) === normalizeSectionKey(normalizedSection),
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

export const useEditorTestExportStore = create<EditorTestExportState>((set) => ({
  isExportPanelOpen: false,
  isImportPanelOpen: false,
  legendTitle: "Légende",
  legendPosition: "right",
  exportFormat: "auto",

  legendBackgroundColor: "#ffffff",
  legendSideWidth: 420,
  legendBottomHeight: 0,
  legendTitleFontSize: 32,
  legendItemFontSize: 24,
  legendSectionTitleFontSize: 20,

  scaleBarEnabled: false,
  scaleBarStyle: "alternating",

  hiddenLegendFeatureIds: [],
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

  setExportFormat: (format) => {
    set({ exportFormat: format });
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

  setScaleBarEnabled: (enabled) => {
    set({ scaleBarEnabled: enabled });
  },

  setScaleBarStyle: (style) => {
    set({ scaleBarStyle: style });
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

      if (normalizeSectionKey(normalizedSection) === normalizeSectionKey(DEFAULT_LEGEND_SECTION)) {
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

    if (normalizeSectionKey(normalizedCurrent) === normalizeSectionKey(normalizedNext)) {
      return;
    }

    set((state) => {
      const nextSections = { ...state.legendGroupSections };

      for (const [groupKey, section] of Object.entries(nextSections)) {
        if (normalizeSectionKey(section) !== normalizeSectionKey(normalizedCurrent)) {
          continue;
        }

        if (normalizeSectionKey(normalizedNext) === normalizeSectionKey(DEFAULT_LEGEND_SECTION)) {
          delete nextSections[groupKey];
        } else {
          nextSections[groupKey] = normalizedNext;
        }
      }

      const sectionOrder = state.legendSectionOrder
        .map((section) =>
          normalizeSectionKey(section) === normalizeSectionKey(normalizedCurrent)
            ? normalizedNext
            : section,
        )
        .filter(
          (section) =>
            normalizeSectionKey(section) !== normalizeSectionKey(DEFAULT_LEGEND_SECTION),
        );

      return {
        legendGroupSections: nextSections,
        legendSectionOrder: uniqueValues(sectionOrder),
      };
    });
  },

  removeLegendSection: (section) => {
    const normalizedSection = normalizeSectionName(section);

    if (normalizeSectionKey(normalizedSection) === normalizeSectionKey(DEFAULT_LEGEND_SECTION)) {
      return;
    }

    set((state) => {
      const nextSections = { ...state.legendGroupSections };

      for (const [groupKey, groupSection] of Object.entries(nextSections)) {
        if (normalizeSectionKey(groupSection) === normalizeSectionKey(normalizedSection)) {
          delete nextSections[groupKey];
        }
      }

      return {
        legendGroupSections: nextSections,
        legendSectionOrder: state.legendSectionOrder.filter(
          (existingSection) => normalizeSectionKey(existingSection) !== normalizeSectionKey(normalizedSection),
        ),
      };
    });
  },

  resetExportLegendConfig: () => {
    set({
      legendTitle: "Légende",
      exportFormat: "auto",
      legendBackgroundColor: "#ffffff",
      legendSideWidth: 420,
      legendBottomHeight: 0,
      legendTitleFontSize: 32,
      legendItemFontSize: 24,
      legendSectionTitleFontSize: 20,
      scaleBarEnabled: false,
      scaleBarStyle: "alternating",
      hiddenLegendFeatureIds: [],
      legendFeatureOrder: [],
      legendGroupOrder: [],
      legendSectionOrder: [],
      legendGroupLabels: {},
      legendGroupSections: {},
    });
  },
}));
