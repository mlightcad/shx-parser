import { defaultAdvanceWidthStrategy, ShxAdvanceWidthStrategy } from './advanceWidthStrategy';
import { ShxFont } from './font';
import { computeFontMetrics } from './glyphLayout';
import { ShxFontData } from './fontData';
import { Point } from './point';
import { ShxShape } from './shape';

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
 * Returns the horizontal advance width stored on a scaled glyph.
 *
 * Uses {@link ShxShape.lastPoint}.x when present; otherwise falls back to ink width.
 * Prefer {@link resolveAdvanceWidth} for layout, which applies cell-width fallback.
 */
export function getAdvanceWidth(shape: ShxShape): number {
  if (shape.lastPoint) {
    return shape.lastPoint.x;
  }
  const { minX, maxX } = shape.bbox;
  return maxX - minX;
}

/** Options for {@link layoutTextRun}. */
export interface TextLayoutOptions {
  /** Horizontal advance strategy applied to each glyph in the run. */
  advance?: ShxAdvanceWidthStrategy;
}

/**
 * Resolves the horizontal advance for a layout-ready glyph.
 *
 * @param shape - Scaled glyph geometry, typically from {@link ShxFont.getLayoutCharShape}
 * @param fontData - Parsed font header and content
 * @param size - Target font size in drawing units
 * @param advanceStrategy - Advance strategy; defaults to {@link defaultAdvanceWidthStrategy}
 */
export function resolveAdvanceWidth(
  shape: ShxShape,
  fontData: ShxFontData,
  size: number,
  advanceStrategy: ShxAdvanceWidthStrategy = defaultAdvanceWidthStrategy
): number {
  const metrics = computeFontMetrics(fontData.content, size);
  return advanceStrategy.resolve(shape, metrics.cellWidth);
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
export function layoutTextRun(
  glyphs: TextRunGlyph[],
  baselineY = 0,
  options: TextLayoutOptions = {}
): PlacedGlyph[] {
  const advanceStrategy = options.advance ?? defaultAdvanceWidthStrategy;
  let cursorX = 0;
  const placed: PlacedGlyph[] = [];

  for (const { font, code, size } of glyphs) {
    const shape = font.getLayoutCharShape(code, size, advanceStrategy);
    if (!shape) {
      continue;
    }
    placed.push({
      shape: placeGlyphOnBaseline(shape, cursorX, baselineY),
      x: cursorX,
    });
    cursorX += resolveAdvanceWidth(shape, font.fontData, size, advanceStrategy);
  }

  return placed;
}
