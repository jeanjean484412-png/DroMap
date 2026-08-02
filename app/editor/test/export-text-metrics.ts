/**
 * Police commune à la preview WYSIWYG et au canvas d'export.
 *
 * Utiliser exactement la même pile de polices évite qu'un titre tienne sur une
 * ligne dans React mais passe sur deux lignes dans le fichier exporté.
 */
export const EXPORT_LEGEND_FONT_FAMILY =
  'Arial, Helvetica, sans-serif';

export type ExportTextFontWeight = 400 | 500 | 600 | 700;

let textMeasureCanvas: HTMLCanvasElement | null = null;
let textMeasureContext: CanvasRenderingContext2D | null = null;

function getTextMeasureContext() {
  if (typeof document === 'undefined') {
    return null;
  }

  if (!textMeasureCanvas) {
    textMeasureCanvas = document.createElement('canvas');
    textMeasureCanvas.width = 1;
    textMeasureCanvas.height = 1;
  }

  if (!textMeasureContext) {
    textMeasureContext = textMeasureCanvas.getContext('2d');
  }

  return textMeasureContext;
}

function getFallbackCharacterFactor(character: string) {
  if (/\s/.test(character)) return 0.32;
  if (/[ilI1.,'`:;|!]/.test(character)) return 0.29;
  if (/[mwMW@#%&]/.test(character)) return 0.9;
  if (/[A-ZÀ-ÖØ-Þ]/.test(character)) return 0.64;
  if (/[0-9]/.test(character)) return 0.56;
  return 0.53;
}

function measureTextWidthFallback(
  text: string,
  fontSize: number,
  fontWeight: ExportTextFontWeight,
) {
  const weightFactor = fontWeight >= 700 ? 1.035 : fontWeight >= 600 ? 1.02 : 1;

  return Array.from(text).reduce(
    (total, character) =>
      total + getFallbackCharacterFactor(character) * fontSize * weightFactor,
    0,
  );
}

export function measureExportTextWidth(
  text: string,
  fontSize: number,
  fontWeight: ExportTextFontWeight = 400,
) {
  const safeFontSize = Math.max(1, Number(fontSize) || 1);
  const context = getTextMeasureContext();

  if (!context) {
    return measureTextWidthFallback(text, safeFontSize, fontWeight);
  }

  context.font = `${fontWeight} ${safeFontSize}px ${EXPORT_LEGEND_FONT_FAMILY}`;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';

  return context.measureText(text).width;
}

function splitOversizedWord(
  word: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: ExportTextFontWeight,
) {
  const characters = Array.from(word);
  const parts: string[] = [];
  let currentPart = '';

  for (const character of characters) {
    const candidate = `${currentPart}${character}`;

    if (
      currentPart.length === 0 ||
      measureExportTextWidth(candidate, fontSize, fontWeight) <= maxWidth
    ) {
      currentPart = candidate;
      continue;
    }

    parts.push(currentPart);
    currentPart = character;
  }

  if (currentPart.length > 0) {
    parts.push(currentPart);
  }

  return parts.length > 0 ? parts : [''];
}

/**
 * Retourne les lignes exactes utilisées par la preview et le canvas.
 * Les retours manuels sont conservés. Les mots trop longs sont découpés
 * uniquement lorsqu'ils ne peuvent réellement pas tenir dans la largeur.
 */
export function wrapExportTextLines(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: ExportTextFontWeight = 400,
) {
  const safeWidth = Math.max(1, Number(maxWidth) || 1);
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    if (
      measureExportTextWidth(paragraph, fontSize, fontWeight) <= safeWidth
    ) {
      lines.push(paragraph);
      continue;
    }

    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let currentLine = '';

    for (const word of words) {
      if (measureExportTextWidth(word, fontSize, fontWeight) > safeWidth) {
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = '';
        }

        const wordParts = splitOversizedWord(
          word,
          safeWidth,
          fontSize,
          fontWeight,
        );

        wordParts.forEach((part, partIndex) => {
          const isLastPart = partIndex === wordParts.length - 1;

          if (isLastPart) {
            currentLine = part;
          } else {
            lines.push(part);
          }
        });
        continue;
      }

      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (
        currentLine.length === 0 ||
        measureExportTextWidth(candidate, fontSize, fontWeight) <= safeWidth
      ) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines.length > 0 ? lines : [''];
}
