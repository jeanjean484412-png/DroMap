import type { LegendEntry } from "./legend-entry";
import type {
  ExportCanvasRect,
  ExportLegendAppearance,
} from "./export-layout";
import { clampExportNumber, getSafeLegendTitle } from "./export-layout";

export const DEFAULT_EXPORT_LEGEND_SECTION = "Général";

export type ExportLegendPositionForLayout = "left" | "right" | "bottom";

export type ExportLegendDisplayItem =
  | {
      type: "section";
      id: string;
      label: string;
      section: string;
      isDefaultSection: boolean;
    }
  | {
      type: "entry";
      id: string;
      entryIndex: number;
      section: string;
    };

export type ExportLegendItemLayout = {
  featureIndex: number;
  columnIndex: number;
  rowIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExportLegendLayoutMetrics = {
  padding: number;
  titleFontSize: number;
  itemFontSize: number;
  sectionFontSize: number;
  typeFontSize: number;
  itemGap: number;
  columnGap: number;
  symbolSize: number;
  symbolBoxWidth: number;
  textGap: number;
  itemHeight: number;
  rowHeight: number;
  sectionHeaderHeight: number;
  sectionGap: number;
  titleX: number;
  titleY: number;
  titleMaxWidth: number;
  titleLineHeight: number;
  titleLines: string[];
  titleHeight: number;
  hasTitle: boolean;
  itemsTop: number;
  itemsBottom: number;
  availableWidth: number;
  availableHeight: number;
  columnCount: number;
  columnWidth: number;
  maxRowsPerColumn: number;
  maxVisibleItems: number;
  visibleItemsCount: number;
  hiddenOverflowCount: number;
  hasOverflow: boolean;
  isBottomSectionColumnMode: boolean;
  visibleItems: ExportLegendItemLayout[];
  warningRect: ExportCanvasRect | null;
  warningText: string | null;
};

type CreateExportLegendLayoutInput = {
  legendRect: ExportCanvasRect;
  featuresCount?: number;
  displayItems?: ExportLegendDisplayItem[];
  appearance: ExportLegendAppearance;
  title?: string;
  legendPosition?: ExportLegendPositionForLayout;
};

type CreateExportLegendDisplayItemsOptions = {
  legendSectionOrder?: string[];
  includeEmptySections?: boolean;
};

type LegendSectionColumn = {
  section: string;
  sectionDisplayIndex: number | null;
  entryDisplayIndexes: number[];
};

function normalizeSectionLabel(section: string) {
  const trimmedSection = section.trim();

  return trimmedSection.length > 0 ? trimmedSection : DEFAULT_EXPORT_LEGEND_SECTION;
}

function normalizeSectionKey(section: string) {
  return normalizeSectionLabel(section).toLowerCase();
}

export function isDefaultLegendSection(section: string) {
  return normalizeSectionKey(section) === normalizeSectionKey(DEFAULT_EXPORT_LEGEND_SECTION);
}

function getSectionItemId(section: string, index: number) {
  return `section:${index}:${section}`;
}

export function createExportLegendDisplayItems(
  entries: LegendEntry[],
  options: CreateExportLegendDisplayItemsOptions = {},
): ExportLegendDisplayItem[] {
  const entryIndexesBySection = new Map<string, number[]>();
  const sectionLabelByKey = new Map<string, string>();

  entries.forEach((entry, entryIndex) => {
    const section = normalizeSectionLabel(entry.section);
    const sectionKey = normalizeSectionKey(section);
    const existingIndexes = entryIndexesBySection.get(sectionKey);

    sectionLabelByKey.set(sectionKey, section);

    if (existingIndexes) {
      existingIndexes.push(entryIndex);
      return;
    }

    entryIndexesBySection.set(sectionKey, [entryIndex]);
  });

  const sectionOrder: string[] = [];
  const seenSectionKeys = new Set<string>();

  const pushSection = (section: string) => {
    const normalizedSection = normalizeSectionLabel(section);
    const sectionKey = normalizeSectionKey(normalizedSection);

    if (seenSectionKeys.has(sectionKey)) {
      return;
    }

    seenSectionKeys.add(sectionKey);
    sectionOrder.push(sectionLabelByKey.get(sectionKey) ?? normalizedSection);
  };

  pushSection(DEFAULT_EXPORT_LEGEND_SECTION);

  for (const section of options.legendSectionOrder ?? []) {
    pushSection(section);
  }

  for (const entry of entries) {
    pushSection(entry.section);
  }

  const displayItems: ExportLegendDisplayItem[] = [];

  sectionOrder.forEach((section, sectionIndex) => {
    const normalizedSection = normalizeSectionLabel(section);
    const sectionKey = normalizeSectionKey(normalizedSection);
    const entryIndexes = entryIndexesBySection.get(sectionKey) ?? [];
    const isDefaultSection = isDefaultLegendSection(normalizedSection);

    if (!isDefaultSection && (entryIndexes.length > 0 || options.includeEmptySections === true)) {
      displayItems.push({
        type: "section",
        id: getSectionItemId(normalizedSection, sectionIndex),
        label: normalizedSection,
        section: normalizedSection,
        isDefaultSection,
      });
    }

    for (const entryIndex of entryIndexes) {
      const entry = entries[entryIndex];

      if (!entry) {
        continue;
      }

      displayItems.push({
        type: "entry",
        id: `entry:${entry.dedupeKey}`,
        entryIndex,
        section: normalizedSection,
      });
    }
  });

  return displayItems;
}

function getMaxColumnsByWidth(legendRect: ExportCanvasRect) {
  if (legendRect.width < legendRect.height * 1.7) {
    return 1;
  }

  return Math.max(1, Math.min(5, Math.floor(legendRect.width / 360)));
}

function getColumnCount(
  legendRect: ExportCanvasRect,
  featuresCount: number,
  maxRowsPerColumn: number,
) {
  const maxColumnsByWidth = getMaxColumnsByWidth(legendRect);

  if (featuresCount <= 1 || maxColumnsByWidth <= 1) {
    return 1;
  }

  if (maxRowsPerColumn <= 0) {
    return maxColumnsByWidth;
  }

  const neededColumns = Math.ceil(featuresCount / maxRowsPerColumn);

  return Math.max(1, Math.min(maxColumnsByWidth, neededColumns));
}

function getOverflowWarningText(hiddenOverflowCount: number) {
  if (hiddenOverflowCount <= 1) {
    return "Légende trop petite : 1 élément visible n’est pas affiché. Agrandis la légende ou masque des entrées.";
  }

  return `Légende trop petite : ${hiddenOverflowCount} éléments visibles ne sont pas affichés. Agrandis la légende ou masque des entrées.`;
}

function estimateWrappedTitleLines(
  title: string,
  maxWidth: number,
  fontSize: number,
) {
  const safeTitle = getSafeLegendTitle(title);

  if (safeTitle.length === 0) {
    return [];
  }

  const maxCharsPerLine = Math.max(4, Math.floor(maxWidth / Math.max(1, fontSize * 0.58)));
  const words = safeTitle.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (candidate.length <= maxCharsPerLine || currentLine.length === 0) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.slice(0, 4);
}

function createSectionColumns(displayItems: ExportLegendDisplayItem[]) {
  const columns: LegendSectionColumn[] = [];
  const columnBySectionKey = new Map<string, LegendSectionColumn>();

  function ensureColumn(section: string) {
    const normalizedSection = normalizeSectionLabel(section);
    const sectionKey = normalizeSectionKey(normalizedSection);
    const existingColumn = columnBySectionKey.get(sectionKey);

    if (existingColumn) {
      return existingColumn;
    }

    const column: LegendSectionColumn = {
      section: normalizedSection,
      sectionDisplayIndex: null,
      entryDisplayIndexes: [],
    };

    columnBySectionKey.set(sectionKey, column);
    columns.push(column);

    return column;
  }

  displayItems.forEach((displayItem, displayIndex) => {
    if (displayItem.type === "section") {
      const column = ensureColumn(displayItem.section);
      column.sectionDisplayIndex = displayIndex;
      return;
    }

    const column = ensureColumn(displayItem.section);
    column.entryDisplayIndexes.push(displayIndex);
  });

  return columns.filter(
    (column) => column.sectionDisplayIndex !== null || column.entryDisplayIndexes.length > 0,
  );
}

function reserveWarningRect(
  legendRect: ExportCanvasRect,
  padding: number,
  itemsTop: number,
  warningHeight: number,
) {
  return {
    x: legendRect.x + padding,
    y: Math.max(itemsTop, legendRect.y + legendRect.height - padding - warningHeight),
    width: Math.max(1, legendRect.width - padding * 2),
    height: warningHeight,
  };
}

export function createExportLegendLayout({
  legendRect,
  featuresCount,
  displayItems,
  appearance,
  title = "",
  legendPosition = "right",
}: CreateExportLegendLayoutInput): ExportLegendLayoutMetrics {
  const safeTitle = getSafeLegendTitle(title);
  const hasTitle = safeTitle.length > 0;
  const padding = clampExportNumber(
    Math.round(appearance.itemFontSize * 1.35),
    22,
    42,
  );
  const titleFontSize = appearance.titleFontSize;
  const itemFontSize = appearance.itemFontSize;
  const sectionFontSize = appearance.sectionTitleFontSize;
  const typeFontSize = clampExportNumber(
    Math.round(itemFontSize * 0.78),
    12,
    26,
  );
  const itemGap = clampExportNumber(Math.round(itemFontSize * 0.72), 12, 28);
  const columnGap = clampExportNumber(Math.round(itemFontSize * 1.55), 26, 58);
  const symbolSize = clampExportNumber(Math.round(itemFontSize * 2), 40, 74);
  const symbolBoxWidth = clampExportNumber(
    Math.round(itemFontSize * 4.1),
    82,
    112,
  );
  const textGap = 22;
  const itemHeight = Math.max(symbolSize + 10, itemFontSize + typeFontSize + 14);
  const rowHeight = itemHeight + itemGap;
  const sectionHeaderHeight = Math.max(sectionFontSize * 1.65, itemHeight * 0.76);
  const sectionGap = Math.max(12, Math.round(itemFontSize * 0.72));

  const titleX = legendRect.x + padding;
  const titleMaxWidth = Math.max(1, legendRect.width - padding * 2);
  const titleLineHeight = Math.round(titleFontSize * 1.16);
  const titleLines = estimateWrappedTitleLines(safeTitle, titleMaxWidth, titleFontSize);
  const titleHeight = hasTitle ? Math.max(titleLineHeight, titleLines.length * titleLineHeight) : 0;
  const titleY = hasTitle ? legendRect.y + padding + titleFontSize : legendRect.y + padding;
  const itemsTop = hasTitle
    ? legendRect.y + padding + titleHeight + Math.max(16, Math.round(itemFontSize * 0.65))
    : legendRect.y + padding;
  const itemsBottom = legendRect.y + legendRect.height - padding;
  const warningHeight = Math.max(56, Math.round(itemFontSize * 2.6));
  const warningGap = Math.max(10, Math.round(itemFontSize * 0.45));
  const totalDisplayItems = displayItems?.length ?? featuresCount ?? 0;
  const hasExplicitSections = Boolean(
    displayItems?.some((displayItem) => displayItem.type === "section" && !displayItem.isDefaultSection),
  );
  const isBottomSectionColumnMode = legendPosition === "bottom" && hasExplicitSections;

  function buildLinearLayout(reserveWarningSpace: boolean) {
    const warningReserve = reserveWarningSpace ? warningHeight + warningGap : 0;
    const availableHeight = Math.max(0, itemsBottom - itemsTop - warningReserve);
    const maxRowsPerColumn = Math.max(0, Math.floor((availableHeight + itemGap) / rowHeight));
    const columnCount = legendPosition === "bottom"
      ? getColumnCount(legendRect, totalDisplayItems, maxRowsPerColumn)
      : 1;
    const availableWidth = Math.max(1, legendRect.width - padding * 2);
    const columnWidth = Math.max(
      1,
      (availableWidth - columnGap * (columnCount - 1)) / columnCount,
    );
    const maxVisibleItems = columnCount * maxRowsPerColumn;
    const visibleItemsCount = Math.min(totalDisplayItems, maxVisibleItems);
    const hiddenOverflowCount = Math.max(0, totalDisplayItems - visibleItemsCount);
    const visibleItems: ExportLegendItemLayout[] = [];

    for (let featureIndex = 0; featureIndex < visibleItemsCount; featureIndex += 1) {
      const columnIndex = legendPosition === "bottom" ? featureIndex % columnCount : 0;
      const rowIndex = legendPosition === "bottom"
        ? Math.floor(featureIndex / columnCount)
        : featureIndex;
      const x = legendRect.x + padding + columnIndex * (columnWidth + columnGap);
      const y = itemsTop + rowIndex * rowHeight;
      const displayItem = displayItems?.[featureIndex];
      const height = displayItem?.type === "section" ? sectionHeaderHeight : itemHeight;

      visibleItems.push({
        featureIndex,
        columnIndex,
        rowIndex,
        x,
        y,
        width: columnWidth,
        height,
      });
    }

    return {
      availableHeight,
      maxRowsPerColumn,
      columnCount,
      availableWidth,
      columnWidth,
      maxVisibleItems,
      visibleItemsCount,
      hiddenOverflowCount,
      visibleItems,
    };
  }

  function buildBottomSectionLayout(reserveWarningSpace: boolean) {
    const warningReserve = reserveWarningSpace ? warningHeight + warningGap : 0;
    const availableHeight = Math.max(0, itemsBottom - itemsTop - warningReserve);
    const availableWidth = Math.max(1, legendRect.width - padding * 2);
    const columns = createSectionColumns(displayItems ?? []);
    const columnCount = Math.max(1, columns.length);
    const columnWidth = Math.max(
      1,
      (availableWidth - columnGap * (columnCount - 1)) / columnCount,
    );
    const visibleItems: ExportLegendItemLayout[] = [];
    let hiddenOverflowCount = 0;
    let maxRowsPerColumn = 0;

    columns.forEach((column, columnIndex) => {
      const x = legendRect.x + padding + columnIndex * (columnWidth + columnGap);
      let y = itemsTop;
      let rowIndex = 0;

      if (column.sectionDisplayIndex !== null && !isDefaultLegendSection(column.section)) {
        if (y + sectionHeaderHeight <= itemsTop + availableHeight) {
          visibleItems.push({
            featureIndex: column.sectionDisplayIndex,
            columnIndex,
            rowIndex,
            x,
            y,
            width: columnWidth,
            height: sectionHeaderHeight,
          });
          y += sectionHeaderHeight + sectionGap;
          rowIndex += 1;
        } else {
          hiddenOverflowCount += 1 + column.entryDisplayIndexes.length;
          return;
        }
      }

      for (const entryDisplayIndex of column.entryDisplayIndexes) {
        if (y + itemHeight > itemsTop + availableHeight) {
          hiddenOverflowCount += 1;
          continue;
        }

        visibleItems.push({
          featureIndex: entryDisplayIndex,
          columnIndex,
          rowIndex,
          x,
          y,
          width: columnWidth,
          height: itemHeight,
        });
        y += rowHeight;
        rowIndex += 1;
      }

      maxRowsPerColumn = Math.max(maxRowsPerColumn, rowIndex);
    });

    const visibleItemsCount = visibleItems.length;
    const maxVisibleItems = visibleItemsCount;

    return {
      availableHeight,
      maxRowsPerColumn,
      columnCount,
      availableWidth,
      columnWidth,
      maxVisibleItems,
      visibleItemsCount,
      hiddenOverflowCount,
      visibleItems,
    };
  }

  function buildLayout(reserveWarningSpace: boolean) {
    return isBottomSectionColumnMode
      ? buildBottomSectionLayout(reserveWarningSpace)
      : buildLinearLayout(reserveWarningSpace);
  }

  const firstPass = buildLayout(false);
  const needsWarningReserve = firstPass.hiddenOverflowCount > 0;
  const finalLayout = needsWarningReserve ? buildLayout(true) : firstPass;
  const hiddenOverflowCount = finalLayout.hiddenOverflowCount;
  const hasOverflow = hiddenOverflowCount > 0;
  const warningRect = hasOverflow
    ? reserveWarningRect(legendRect, padding, itemsTop, warningHeight)
    : null;

  return {
    padding,
    titleFontSize,
    itemFontSize,
    sectionFontSize,
    typeFontSize,
    itemGap,
    columnGap,
    symbolSize,
    symbolBoxWidth,
    textGap,
    itemHeight,
    rowHeight,
    sectionHeaderHeight,
    sectionGap,
    titleX,
    titleY,
    titleMaxWidth,
    titleLineHeight,
    titleLines,
    titleHeight,
    hasTitle,
    itemsTop,
    itemsBottom,
    availableWidth: finalLayout.availableWidth,
    availableHeight: finalLayout.availableHeight,
    columnCount: finalLayout.columnCount,
    columnWidth: finalLayout.columnWidth,
    maxRowsPerColumn: finalLayout.maxRowsPerColumn,
    maxVisibleItems: finalLayout.maxVisibleItems,
    visibleItemsCount: finalLayout.visibleItemsCount,
    hiddenOverflowCount,
    hasOverflow,
    isBottomSectionColumnMode,
    visibleItems: finalLayout.visibleItems,
    warningRect,
    warningText: hasOverflow ? getOverflowWarningText(hiddenOverflowCount) : null,
  };
}
