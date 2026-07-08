import { ShxShape } from './shape';

const LAYOUT_EPSILON = 1e-6;

/** Default cell-width fraction added after ink width in {@link InkWidthAdvanceStrategy}. */
export const DEFAULT_INK_WIDTH_CELL_FACTOR = 0.2;

/**
 * Resolves horizontal glyph advance for text layout.
 *
 * Each concrete strategy encapsulates one spacing model (SHX-native advance,
 * ink-width proportional spacing, etc.).
 */
export abstract class ShxAdvanceWidthStrategy {
  abstract resolve(shape: ShxShape, cellWidth: number): number;

  /**
   * Whether the aligned glyph should store the resolved advance as explicit.
   * When false, {@link ShxShape.hasExplicitAdvance} is preserved from the source glyph.
   */
  markAlignedAdvanceExplicit(_shape: ShxShape): boolean {
    return false;
  }
}

/** SHX pen advance with cell-width fallback (AutoCAD native model). */
export class ShxNativeAdvanceStrategy extends ShxAdvanceWidthStrategy {
  resolve(shape: ShxShape, cellWidth: number): number {
    const advanceX = shape.lastPoint?.x ?? 0;
    const hasInk = shape.polylines.some(line => line.length >= 2);

    // Only pen-up advance vectors (or BIGFONT cell #2) define horizontal spacing.
    // A non-zero final pen-down position (e.g. txt.shx comma) is stroke geometry, not advance.
    if (shape.hasExplicitAdvance) {
      return advanceX;
    }
    if (!hasInk && Math.abs(advanceX) > LAYOUT_EPSILON) {
      return advanceX;
    }
    return cellWidth;
  }
}

/** Ink bbox width plus a fraction of the font cell width. */
export class InkWidthAdvanceStrategy extends ShxAdvanceWidthStrategy {
  readonly cellWidthFactor: number;

  constructor(cellWidthFactor = DEFAULT_INK_WIDTH_CELL_FACTOR) {
    super();
    this.cellWidthFactor = cellWidthFactor;
  }

  /**
   * True when ink extends left of the glyph origin (UNIFONT center-cell encoding).
   */
  static isCenterOriginGlyph(shape: ShxShape): boolean {
    return shape.bbox.minX < -LAYOUT_EPSILON;
  }

  /**
   * Resolves ink-based advance for a glyph at a scaled cell width.
   *
   * Left-origin glyphs (`minX >= 0`): `maxX + cellWidth * factor`.
   * Center-origin glyphs (`minX < 0`): advance to the right cell edge
   * (`max(maxX, cellWidth / 2)`) plus padding, so narrow centered punctuation
   * keeps trailing whitespace instead of colliding with the next glyph.
   */
  static computeAdvance(
    shape: ShxShape,
    cellWidth: number,
    cellWidthFactor = DEFAULT_INK_WIDTH_CELL_FACTOR
  ): number {
    const hasInk = shape.polylines.some(line => line.length >= 2);
    if (!hasInk) {
      return cellWidth * cellWidthFactor;
    }

    const cellPadding = cellWidth * cellWidthFactor;
    const { maxX } = shape.bbox;

    if (InkWidthAdvanceStrategy.isCenterOriginGlyph(shape)) {
      return Math.max(maxX, cellWidth / 2) + cellPadding;
    }

    return maxX + cellPadding;
  }

  resolve(shape: ShxShape, cellWidth: number): number {
    if (shape.hasExplicitAdvance) {
      return shape.lastPoint?.x ?? 0;
    }
    return InkWidthAdvanceStrategy.computeAdvance(shape, cellWidth, this.cellWidthFactor);
  }

  markAlignedAdvanceExplicit(_shape: ShxShape): boolean {
    return true;
  }
}

/** Default advance strategy using ink-width spacing with center-cell correction. */
export const defaultAdvanceWidthStrategy = new InkWidthAdvanceStrategy();
