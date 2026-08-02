import type { LegendEntry } from "./legend-entry";
import type { ExportCanvasRect, ExportLegendAppearance } from "./export-layout";
import { clampExportNumber, getSafeLegendTitle } from "./export-layout";
import { wrapExportTextLines } from "./export-text-metrics";

export const DEFAULT_EXPORT_LEGEND_SECTION = "Général";
export const DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE = 48;
export const MAX_EXPORT_LEGEND_SYMBOL_SIZE = 300;

export function getExportLegendGlobalSymbolScale(symbolSize: number) {
  return clampExportNumber(
    Number(symbolSize) / DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE,
    0.5,
    3,
  );
}

export type ExportLegendPositionForLayout = "left" | "right" | "bottom" | "map";

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
  symbolSize?: number;
  symbolBoxWidth?: number;
  symbolAnchorOffset?: number;
  labelOffset?: number;
  textLines?: string[];
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
  symbolAnchorOffset: number;
  labelOffset: number;
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
  entries?: LegendEntry[];
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

  return trimmedSection.length > 0
    ? trimmedSection
    : DEFAULT_EXPORT_LEGEND_SECTION;
}

function normalizeSectionKey(section: string) {
  return normalizeSectionLabel(section).toLowerCase();
}

export function isDefaultLegendSection(section: string) {
  return (
    normalizeSectionKey(section) ===
    normalizeSectionKey(DEFAULT_EXPORT_LEGEND_SECTION)
  );
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

    if (
      !isDefaultSection &&
      (entryIndexes.length > 0 || options.includeEmptySections === true)
    ) {
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

  return wrapExportTextLines(safeTitle, maxWidth, fontSize, 700);
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
    (column) =>
      column.sectionDisplayIndex !== null ||
      column.entryDisplayIndexes.length > 0,
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
    y: Math.max(
      itemsTop,
      legendRect.y + legendRect.height - padding - warningHeight,
    ),
    width: Math.max(1, legendRect.width - padding * 2),
    height: warningHeight,
  };
}

export function wrapLegendTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
) {
  return wrapExportTextLines(
    text.length > 0 ? text : "Sans nom",
    maxWidth,
    fontSize,
    400,
  );
}

export type ExportLegendSymbolKind =
  "marker" | "line" | "arrow" | "zone" | "text";

export function getExportLegendEntrySymbolKind(
  entry: LegendEntry | undefined,
): ExportLegendSymbolKind {
  const feature = entry?.representativeFeature;
  const featureStyle = feature?.properties.style ?? {};
  const featureType = feature?.properties.type;

  return (
    entry?.legendSymbolStyle?.kind ??
    (featureType === "line"
      ? featureStyle.arrowStart || featureStyle.arrowEnd
        ? "arrow"
        : "line"
      : featureType === "zone"
        ? "zone"
        : featureType === "text"
          ? "text"
          : "marker")
  );
}

/**
 * Largeur réellement utile au figuré dans la légende.
 *
 * Les marqueurs et les pictogrammes étaient auparavant traités comme des
 * lignes larges (taille × 1,8). Cela créait une grande zone vide à gauche des
 * labels et décalait toute la légende dès qu'un marqueur était agrandi.
 *
 * Cette largeur est utilisée par la preview et l'export. La colonne n'est
 * décalée que lorsque le dessin visible dépasserait réellement de son bord.
 */
export function getExportLegendSymbolBoxWidth(
  kind: ExportLegendSymbolKind,
  symbolSize: number,
) {
  const safeSize = clampExportNumber(
    Number(symbolSize),
    12,
    MAX_EXPORT_LEGEND_SYMBOL_SIZE,
  );

  if (kind === "marker") {
    // Un marqueur est rendu à son diamètre visuel exact. La colonne doit donc
    // réserver tout ce diamètre, sans plafond caché à 180 px.
    return clampExportNumber(
      Math.ceil(safeSize) + 2,
      18,
      MAX_EXPORT_LEGEND_SYMBOL_SIZE + 2,
    );
  }

  if (kind === "text") {
    return clampExportNumber(
      Math.ceil(Math.max(34, safeSize * 0.86)) + 2,
      36,
      MAX_EXPORT_LEGEND_SYMBOL_SIZE + 2,
    );
  }

  if (kind === "zone") {
    return clampExportNumber(
      Math.round(safeSize * 1.05),
      Math.max(30, safeSize),
      320,
    );
  }

  // Les lignes et les flèches sont naturellement plus larges que hautes.
  return clampExportNumber(
    Math.round(safeSize * 1.35),
    Math.max(34, safeSize),
    420,
  );
}

export function getExportLegendEntrySymbolMetrics(
  entry: LegendEntry | undefined,
  defaultSymbolSize: number,
) {
  const featureMarkerSize =
    entry?.representativeFeature?.properties?.type === "marker"
      ? Number(entry.representativeFeature.properties.style?.markerSize)
      : Number.NaN;
  const baseSymbolSize = Number(
    entry?.legendSymbolSize ??
      (Number.isFinite(featureMarkerSize)
        ? featureMarkerSize
        : DEFAULT_EXPORT_LEGEND_SYMBOL_SIZE),
  );
  const symbolSize = clampExportNumber(
    baseSymbolSize * getExportLegendGlobalSymbolScale(defaultSymbolSize),
    12,
    MAX_EXPORT_LEGEND_SYMBOL_SIZE,
  );
  const kind = getExportLegendEntrySymbolKind(entry);

  return {
    kind,
    symbolSize,
    symbolBoxWidth: getExportLegendSymbolBoxWidth(kind, symbolSize),
  };
}

export function getExportLegendEntrySymbolVisualHeight(
  entry: LegendEntry | undefined,
  entrySymbolSize: number,
) {
  const feature = entry?.representativeFeature;
  const featureStyle = feature?.properties.style ?? {};
  const legendStyle = entry?.legendSymbolStyle;
  const kind = getExportLegendEntrySymbolKind(entry);
  const weight = Math.max(
    0.5,
    Number(legendStyle?.weight ?? featureStyle.weight ?? 4),
  );

  if (kind === "marker") {
    return Math.ceil(Math.max(1, entrySymbolSize));
  }

  if (kind === "text") {
    return Math.ceil(Math.max(18, entrySymbolSize * 0.82) + 1);
  }

  if (kind === "zone") {
    const renderedZoneHeight = Math.max(
      entrySymbolSize * 0.64,
      Math.min(12, weight * 1.1) + 8,
    );

    return Math.ceil(renderedZoneHeight + 1);
  }

  const renderedStrokeHeight = Math.max(4, Math.min(14, weight * 1.35));
  const renderedLineHeight =
    kind === "arrow"
      ? Math.max(entrySymbolSize * 0.68, renderedStrokeHeight + 6)
      : Math.max(entrySymbolSize * 0.28, renderedStrokeHeight + 4);

  return Math.ceil(renderedLineHeight + 1);
}

export function createExportLegendLayout({
  legendRect,
  featuresCount,
  displayItems,
  entries,
  appearance,
  title = "",
  legendPosition = "right",
}: CreateExportLegendLayoutInput): ExportLegendLayoutMetrics {
  const safeTitle = getSafeLegendTitle(title);
  const hasTitle = safeTitle.length > 0;
  const mapBorderInset =
    legendPosition === "map" && appearance.mapBorderEnabled
      ? appearance.mapBorderWidth
      : 0;
  const padding =
    legendPosition === "map"
      ? appearance.mapPadding + mapBorderInset
      : clampExportNumber(Math.round(appearance.itemFontSize * 1.35), 22, 42);
  const titleFontSize = appearance.titleFontSize;
  const itemFontSize = appearance.itemFontSize;
  const sectionFontSize = appearance.sectionTitleFontSize;
  const typeFontSize = clampExportNumber(
    Math.round(itemFontSize * 0.78),
    12,
    26,
  );
  const itemGap = appearance.itemGap;
  const columnGap = clampExportNumber(Math.round(itemFontSize * 1.55), 26, 58);
  const symbolSize = appearance.symbolSize;
  const symbolBoxWidth = getExportLegendSymbolBoxWidth("marker", symbolSize);
  const textGap = appearance.labelGap;
  const labelLineHeight = Math.max(
    1,
    Math.round(itemFontSize * appearance.labelLineHeight),
  );

  const entrySymbolMetrics = (entries ?? []).map((entry) =>
    getExportLegendEntrySymbolMetrics(entry, symbolSize),
  );
  const maxEntrySymbolBoxWidth = Math.max(
    symbolBoxWidth,
    ...entrySymbolMetrics.map((metrics) => metrics.symbolBoxWidth),
  );

  // L'ancre reste au bord de la colonne standard. Elle n'est déplacée que de
  // la moitié du dépassement réel du plus grand figuré. Un gros pictogramme
  // touche donc le bord au lieu de créer une grande marge vide à sa gauche.
  const overflowShift = Math.max(
    0,
    (maxEntrySymbolBoxWidth - symbolBoxWidth) / 2,
  );
  const symbolAnchorOffset = symbolBoxWidth / 2 + overflowShift;
  const symbolColumnRight = symbolAnchorOffset + maxEntrySymbolBoxWidth / 2;
  const labelOffset = symbolColumnRight + textGap;
  const itemHeight = Math.max(
    Math.ceil(symbolSize * 0.7) + 1,
    labelLineHeight + 1,
  );
  const rowHeight = itemHeight + itemGap;
  const sectionHeaderHeight = Math.max(
    sectionFontSize * 1.45,
    itemHeight * 0.7,
  );
  const sectionGap = appearance.sectionGap;

  function getSectionTextLines(
    displayItem: Extract<ExportLegendDisplayItem, { type: "section" }>,
    availableItemWidth: number,
  ) {
    return wrapLegendTextLines(
      displayItem.label,
      Math.max(1, availableItemWidth),
      sectionFontSize,
    );
  }

  function getDisplayItemHeight(
    displayItem: ExportLegendDisplayItem | undefined,
    availableItemWidth?: number,
  ) {
    if (!displayItem) {
      return sectionHeaderHeight;
    }

    if (displayItem.type === "section") {
      if (!Number.isFinite(availableItemWidth)) {
        return sectionHeaderHeight;
      }

      const sectionLines = getSectionTextLines(
        displayItem,
        Number(availableItemWidth),
      );

      return Math.max(
        sectionHeaderHeight,
        Math.ceil(sectionLines.length * sectionFontSize * 1.2 + 4),
      );
    }

    const entry = entries?.[displayItem.entryIndex];
    const entryMetrics = getExportLegendEntrySymbolMetrics(entry, symbolSize);
    const symbolVisualHeight = getExportLegendEntrySymbolVisualHeight(
      entry,
      entryMetrics.symbolSize,
    );

    return Math.max(symbolVisualHeight, labelLineHeight + 2);
  }

  const titleX = legendRect.x + padding;
  const titleMaxWidth = Math.max(1, legendRect.width - padding * 2);
  const titleLineHeight = Math.round(titleFontSize * 1.16);
  const titleLines = estimateWrappedTitleLines(
    safeTitle,
    titleMaxWidth,
    titleFontSize,
  );
  const titleHeight = hasTitle
    ? Math.max(titleLineHeight, titleLines.length * titleLineHeight)
    : 0;
  const titleY = hasTitle
    ? legendRect.y + padding + titleFontSize
    : legendRect.y + padding;
  const itemsTop = hasTitle
    ? legendRect.y +
      padding +
      titleHeight +
      Math.max(16, Math.round(itemFontSize * 0.65))
    : legendRect.y + padding;
  const itemsBottom = legendRect.y + legendRect.height - padding;
  const warningHeight = Math.max(56, Math.round(itemFontSize * 2.6));
  const warningGap = Math.max(10, Math.round(itemFontSize * 0.45));
  const totalDisplayItems = displayItems?.length ?? featuresCount ?? 0;
  const hasExplicitSections = Boolean(
    displayItems?.some(
      (displayItem) =>
        displayItem.type === "section" && !displayItem.isDefaultSection,
    ),
  );
  const isBottomSectionColumnMode =
    legendPosition === "bottom" && hasExplicitSections;

  function buildLinearLayout(reserveWarningSpace: boolean) {
    const warningReserve = reserveWarningSpace ? warningHeight + warningGap : 0;
    const availableHeight = Math.max(
      0,
      itemsBottom - itemsTop - warningReserve,
    );
    const availableWidth = Math.max(1, legendRect.width - padding * 2);
    const maxColumnsByWidth =
      legendPosition === "bottom" ? getMaxColumnsByWidth(legendRect) : 1;

    function getColumnHeight(columnCount: number, columnIndex: number) {
      let height = 0;
      let itemCount = 0;
      const candidateColumnWidth = Math.max(
        1,
        (availableWidth - columnGap * (columnCount - 1)) / columnCount,
      );

      for (
        let displayIndex = columnIndex;
        displayIndex < totalDisplayItems;
        displayIndex += columnCount
      ) {
        const displayItem = displayItems?.[displayIndex];
        if (!displayItem) continue;

        const gap =
          itemCount === 0
            ? 0
            : displayItem.type === "section"
              ? sectionGap
              : itemGap;
        height += gap + getDisplayItemHeight(displayItem, candidateColumnWidth);
        itemCount += 1;
      }

      return height;
    }

    let columnCount = 1;

    if (legendPosition === "bottom" && totalDisplayItems > 1) {
      columnCount = maxColumnsByWidth;

      for (let candidate = 1; candidate <= maxColumnsByWidth; candidate += 1) {
        let fits = true;

        for (let columnIndex = 0; columnIndex < candidate; columnIndex += 1) {
          if (getColumnHeight(candidate, columnIndex) > availableHeight) {
            fits = false;
            break;
          }
        }

        if (fits) {
          columnCount = candidate;
          break;
        }
      }
    }

    const columnGapTotal = columnGap * (columnCount - 1);
    const columnWidth = Math.max(
      1,
      (availableWidth - columnGapTotal) / columnCount,
    );
    const columnY = Array.from({ length: columnCount }, () => itemsTop);
    const columnRows = Array.from({ length: columnCount }, () => 0);
    const columnOverflowed = Array.from({ length: columnCount }, () => false);
    const visibleItems: ExportLegendItemLayout[] = [];
    let hiddenOverflowCount = 0;

    for (
      let featureIndex = 0;
      featureIndex < totalDisplayItems;
      featureIndex += 1
    ) {
      const displayItem = displayItems?.[featureIndex];
      if (!displayItem) continue;

      const columnIndex =
        legendPosition === "bottom" ? featureIndex % columnCount : 0;

      if (columnOverflowed[columnIndex]) {
        hiddenOverflowCount += 1;
        continue;
      }

      const rowIndex = columnRows[columnIndex];
      const gap =
        rowIndex === 0
          ? 0
          : displayItem.type === "section"
            ? sectionGap
            : itemGap;
      const y = columnY[columnIndex] + gap;
      const height = getDisplayItemHeight(displayItem, columnWidth);

      if (y + height > itemsTop + availableHeight) {
        columnOverflowed[columnIndex] = true;
        hiddenOverflowCount += 1;
        continue;
      }

      const x =
        legendRect.x + padding + columnIndex * (columnWidth + columnGap);
      const entry =
        displayItem.type === "entry"
          ? entries?.[displayItem.entryIndex]
          : undefined;
      const entryMetrics = getExportLegendEntrySymbolMetrics(entry, symbolSize);

      visibleItems.push({
        featureIndex,
        columnIndex,
        rowIndex,
        x,
        y,
        width: columnWidth,
        height,
        symbolSize:
          displayItem.type === "entry" ? entryMetrics.symbolSize : undefined,
        symbolBoxWidth:
          displayItem.type === "entry"
            ? entryMetrics.symbolBoxWidth
            : undefined,
        symbolAnchorOffset:
          displayItem.type === "entry" ? symbolAnchorOffset : undefined,
        labelOffset: displayItem.type === "entry" ? labelOffset : undefined,
        textLines:
          displayItem.type === "section"
            ? getSectionTextLines(displayItem, columnWidth)
            : undefined,
      });

      columnY[columnIndex] = y + height;
      columnRows[columnIndex] += 1;
    }

    const maxRowsPerColumn = Math.max(0, ...columnRows);
    const visibleItemsCount = visibleItems.length;

    return {
      availableHeight,
      maxRowsPerColumn,
      columnCount,
      availableWidth,
      columnWidth,
      maxVisibleItems: visibleItemsCount,
      visibleItemsCount,
      hiddenOverflowCount,
      visibleItems,
    };
  }

  function buildBottomSectionLayout(reserveWarningSpace: boolean) {
    const warningReserve = reserveWarningSpace ? warningHeight + warningGap : 0;
    const availableHeight = Math.max(
      0,
      itemsBottom - itemsTop - warningReserve,
    );
    const availableWidth = Math.max(1, legendRect.width - padding * 2);
    const rawColumns = createSectionColumns(displayItems ?? []);
    // En position basse, le premier vrai sous-titre doit commencer sous le
    // titre général, dans la première colonne. Les éléments restés dans la
    // section implicite « Général » sont placés ensuite au lieu de réserver
    // silencieusement la première colonne et de repousser le sous-titre.
    const columns = [
      ...rawColumns.filter((column) => !isDefaultLegendSection(column.section)),
      ...rawColumns.filter((column) => isDefaultLegendSection(column.section)),
    ];
    const columnCount = Math.max(1, columns.length);
    const columnWidth = Math.max(
      1,
      (availableWidth - columnGap * (columnCount - 1)) / columnCount,
    );
    const visibleItems: ExportLegendItemLayout[] = [];
    let hiddenOverflowCount = 0;
    let maxRowsPerColumn = 0;

    columns.forEach((column, columnIndex) => {
      const x =
        legendRect.x + padding + columnIndex * (columnWidth + columnGap);
      let y = itemsTop;
      let rowIndex = 0;
      let hasVisibleItem = false;
      let columnOverflowed = false;

      if (
        column.sectionDisplayIndex !== null &&
        !isDefaultLegendSection(column.section)
      ) {
        const sectionDisplayItem = displayItems?.[column.sectionDisplayIndex];
        const sectionHeight = getDisplayItemHeight(
          sectionDisplayItem,
          columnWidth,
        );

        if (y + sectionHeight <= itemsTop + availableHeight) {
          visibleItems.push({
            featureIndex: column.sectionDisplayIndex,
            columnIndex,
            rowIndex,
            x,
            y,
            width: columnWidth,
            height: sectionHeight,
            textLines:
              sectionDisplayItem?.type === "section"
                ? getSectionTextLines(sectionDisplayItem, columnWidth)
                : undefined,
          });
          y += sectionHeight;
          rowIndex += 1;
          hasVisibleItem = true;
        } else {
          hiddenOverflowCount += 1;
          columnOverflowed = true;
        }
      }

      for (
        let entryIndex = 0;
        entryIndex < column.entryDisplayIndexes.length;
        entryIndex += 1
      ) {
        const entryDisplayIndex = column.entryDisplayIndexes[entryIndex];

        if (columnOverflowed) {
          hiddenOverflowCount += 1;
          continue;
        }

        const entryDisplayItem = displayItems?.[entryDisplayIndex];
        const entry =
          entryDisplayItem?.type === "entry"
            ? entries?.[entryDisplayItem.entryIndex]
            : undefined;
        const entryMetrics = getExportLegendEntrySymbolMetrics(
          entry,
          symbolSize,
        );
        const height = getDisplayItemHeight(entryDisplayItem, columnWidth);
        const gap = hasVisibleItem
          ? rowIndex === 1 &&
            column.sectionDisplayIndex !== null &&
            !isDefaultLegendSection(column.section)
            ? sectionGap
            : itemGap
          : 0;
        const nextY = y + gap;

        if (nextY + height > itemsTop + availableHeight) {
          hiddenOverflowCount += 1;
          columnOverflowed = true;
          continue;
        }

        visibleItems.push({
          featureIndex: entryDisplayIndex,
          columnIndex,
          rowIndex,
          x,
          y: nextY,
          width: columnWidth,
          height,
          symbolSize: entryMetrics.symbolSize,
          symbolBoxWidth: entryMetrics.symbolBoxWidth,
          symbolAnchorOffset,
          labelOffset,
        });
        y = nextY + height;
        rowIndex += 1;
        hasVisibleItem = true;
      }

      maxRowsPerColumn = Math.max(maxRowsPerColumn, rowIndex);
    });

    const visibleItemsCount = visibleItems.length;

    return {
      availableHeight,
      maxRowsPerColumn,
      columnCount,
      availableWidth,
      columnWidth,
      maxVisibleItems: visibleItemsCount,
      visibleItemsCount,
      hiddenOverflowCount,
      visibleItems,
    };
  }

  function buildMapDynamicLayout(reserveWarningSpace: boolean) {
    const warningReserve = reserveWarningSpace ? warningHeight + warningGap : 0;
    const availableHeight = Math.max(
      0,
      itemsBottom - itemsTop - warningReserve,
    );
    const availableWidth = Math.max(1, legendRect.width - padding * 2);
    const visibleItems: ExportLegendItemLayout[] = [];
    let y = itemsTop;
    let hiddenOverflowCount = 0;

    for (
      let displayIndex = 0;
      displayIndex < totalDisplayItems;
      displayIndex += 1
    ) {
      const displayItem = displayItems?.[displayIndex];

      if (!displayItem) continue;

      let height = itemHeight;
      let textLines: string[] | undefined;

      if (displayItem.type === "section") {
        textLines = wrapLegendTextLines(
          displayItem.label,
          availableWidth,
          sectionFontSize,
        );
        height = Math.max(
          sectionFontSize + 4,
          Math.ceil(textLines.length * sectionFontSize * 1.2 + 4),
        );
      } else {
        const entry = entries?.[displayItem.entryIndex];
        const entryMetrics = getExportLegendEntrySymbolMetrics(
          entry,
          symbolSize,
        );
        const textWidth = Math.max(1, availableWidth - labelOffset);
        textLines = wrapLegendTextLines(
          entry?.label ?? "Sans nom",
          textWidth,
          itemFontSize,
        );
        const symbolVisualHeight = getExportLegendEntrySymbolVisualHeight(
          entry,
          entryMetrics.symbolSize,
        );
        height = Math.max(
          symbolVisualHeight,
          Math.ceil(textLines.length * labelLineHeight),
        );
      }

      const gap =
        visibleItems.length === 0
          ? 0
          : displayItem.type === "section"
            ? sectionGap
            : itemGap;
      const nextY = y + gap;

      // Sur la carte, la légende est un overlay dynamique : un label long
      // ne doit jamais être supprimé ni tronqué parce que l'estimation de
      // hauteur a été dépassée pendant la saisie. Le rectangle parent se
      // recalcule au prochain rendu et l'overflow reste visible entre-temps.
      y = nextY;
      const entry =
        displayItem.type === "entry"
          ? entries?.[displayItem.entryIndex]
          : undefined;
      const entryMetrics = getExportLegendEntrySymbolMetrics(entry, symbolSize);
      visibleItems.push({
        featureIndex: displayIndex,
        columnIndex: 0,
        rowIndex: visibleItems.length,
        x: legendRect.x + padding,
        y,
        width: availableWidth,
        height,
        symbolSize:
          displayItem.type === "entry" ? entryMetrics.symbolSize : undefined,
        symbolBoxWidth:
          displayItem.type === "entry"
            ? entryMetrics.symbolBoxWidth
            : undefined,
        symbolAnchorOffset:
          displayItem.type === "entry" ? symbolAnchorOffset : undefined,
        labelOffset: displayItem.type === "entry" ? labelOffset : undefined,
        textLines,
      });
      y += height;
    }

    return {
      availableHeight: Math.max(availableHeight, y - itemsTop),
      maxRowsPerColumn: visibleItems.length,
      columnCount: 1,
      availableWidth,
      columnWidth: availableWidth,
      maxVisibleItems: visibleItems.length,
      visibleItemsCount: visibleItems.length,
      hiddenOverflowCount,
      visibleItems,
    };
  }

  function buildLayout(reserveWarningSpace: boolean) {
    if (legendPosition === "map") {
      return buildMapDynamicLayout(reserveWarningSpace);
    }

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
    symbolAnchorOffset,
    labelOffset,
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
    warningText: hasOverflow
      ? getOverflowWarningText(hiddenOverflowCount)
      : null,
  };
}
