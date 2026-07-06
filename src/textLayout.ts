import { ShxFont } from './font';
import { computeFontMetrics, isCompactMonospaceUnifont } from './glyphLayout';
import { ShxFontData, ShxFontType } from './fontData';
import { Point } from './point';
import { ShxShape } from './shape';

const ADVANCE_EPSILON = 1e-6;

/** Wide proportional unifont symbols expand advance to the full cell width. */
const PROPORTIONAL_UNIFONT_CELL_WIDTH_RATIO = 0.25;

/** A glyph positioned on a text line. */
export interface PlacedGlyph {
  /** Scaled glyph geometry translated to the line position */
  shape: ShxShape;
  /** Left edge x coordinate (baseline origin for this glyph) */
  x: number;
}

/** One character in a horizontal text run. */
export interface TextRunGlyph {
  font: ShxFont;
  code: number;
  size: number;
}

/**
 * Returns the horizontal advance width of a scaled glyph.
 *
 * Uses the pen-up vector from the SHX shape definition when present; otherwise falls
 * back to the glyph bounding box width.
 */
export function getAdvanceWidth(shape: ShxShape): number {
  if (shape.lastPoint) {
    return shape.lastPoint.x;
  }
  const { minX, maxX } = shape.bbox;
  return maxX - minX;
}

/**
 * Resolves the horizontal advance for a layout-ready glyph.
 *
 * Prefer glyphs from {@link ShxFont.getLayoutCharShape} so pen vectors and baseline
 * alignment already reflect {@link computeFontMetrics}.
 *
 * @param shape - Scaled glyph geometry, typically from {@link ShxFont.getLayoutCharShape}
 * @param fontData - Parsed font header and content
 * @param size - Target font size in drawing units
 */
export function resolveAdvanceWidth(shape: ShxShape, fontData: ShxFontData, size: number): number {
  const metrics = computeFontMetrics(fontData.content, size);
  const penAdvance = getAdvanceWidth(shape);
  const fontType = fontData.header.fontType;

  if (fontType === ShxFontType.UNIFONT) {
    const penAdvance = shape.lastPoint?.x ?? 0;
    if (penAdvance <= ADVANCE_EPSILON) {
      if (isCompactMonospaceUnifont(fontData.content)) {
        return metrics.cellWidth;
      }
      return shape.bbox.maxX - shape.bbox.minX;
    }
    if (shape.bbox.maxX < metrics.cellWidth * PROPORTIONAL_UNIFONT_CELL_WIDTH_RATIO) {
      return penAdvance;
    }
    const inkExtent = Math.max(shape.bbox.maxX - shape.bbox.minX, shape.bbox.maxX);
    if (inkExtent > penAdvance + ADVANCE_EPSILON) {
      return Math.max(penAdvance, metrics.cellWidth);
    }
    return penAdvance;
  }

  if (fontType === ShxFontType.BIGFONT) {
    const bboxWidth = shape.bbox.maxX - shape.bbox.minX;
    return Math.max(bboxWidth, penAdvance, metrics.cellWidth);
  }

  const bboxWidth = shape.bbox.maxX - shape.bbox.minX;
  return penAdvance > ADVANCE_EPSILON ? penAdvance : bboxWidth;
}

/**
 * Translates a glyph so its font baseline sits at `(x, baselineY)`.
 *
 * Glyphs keep their encoded vertical coordinates from the SHX file; the baseline is
 * y = 0 in font space per the AutoCAD shape-font specification.
 */
export function placeGlyphOnBaseline(shape: ShxShape, x: number, baselineY = 0): ShxShape {
  return shape.offset(new Point(x, baselineY), true);
}

/**
 * Lays out glyphs horizontally on a shared baseline using each font's native coordinates.
 *
 * @param glyphs - Characters to place left-to-right
 * @param baselineY - Shared baseline y coordinate in drawing units
 */
export function layoutTextRun(glyphs: TextRunGlyph[], baselineY = 0): PlacedGlyph[] {
  let cursorX = 0;
  const placed: PlacedGlyph[] = [];

  for (const { font, code, size } of glyphs) {
    const shape = font.getLayoutCharShape(code, size);
    if (!shape) {
      continue;
    }
    placed.push({
      shape: placeGlyphOnBaseline(shape, cursorX, baselineY),
      x: cursorX,
    });
    cursorX += resolveAdvanceWidth(shape, font.fontData, size);
  }

  return placed;
}
