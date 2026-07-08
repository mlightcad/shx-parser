import { defaultAdvanceWidthStrategy, ShxAdvanceWidthStrategy } from './advanceWidthStrategy';
import { ShxFontContentData, ShxFontData, ShxFontType } from './fontData';
import { Point } from './point';
import { ShxShape } from './shape';

/**
 * Scaled font metrics derived from shape #0 (`baseUp`, `baseDown`, `height`, `width`).
 *
 * These values describe the font cell at a target render size. Text renderers use them
 * to align mixed-font lines on a shared baseline without modifying individual glyphs.
 */
export interface ShxFontMetrics {
  /** Target render size (font cell height in drawing units) */
  size: number;
  /** Distance from the baseline to the top of the cap band */
  capHeight: number;
  /** Distance from the baseline downward into the descender band */
  descenderHeight: number;
  /** Scaled cell width */
  cellWidth: number;
  /** Sum of cap and descender bands (`capHeight + descenderHeight`) */
  totalHeight: number;
}

/**
 * Computes scaled font metrics for a target render size.
 *
 * @param content - Parsed font content from shape #0
 * @param size - Target font size in drawing units
 */
export function computeFontMetrics(content: ShxFontContentData, size: number): ShxFontMetrics {
  const { height, width, baseUp, baseDown } = content;
  const scale = height > 0 ? size / height : 1;
  const capHeight = scale * baseUp;
  const descenderHeight = scale * baseDown;
  return {
    size,
    capHeight,
    descenderHeight,
    cellWidth: scale * width,
    totalHeight: capHeight + descenderHeight,
  };
}

/**
 * True when a SHAPES text font (shape #0 present) stores glyphs in UNIFONT-style
 * top-origin coordinates: ink extends well below the descender band unless shifted
 * by {@link ShxFontMetrics.capHeight}. gdt.shx is a common example.
 */
export function shapeEncodedWithTopOrigin(
  fontData: ShxFontData,
  shape: ShxShape,
  metrics: ShxFontMetrics
): boolean {
  if (fontData.header.fontType !== ShxFontType.SHAPES || !(0 in fontData.content.data)) {
    return false;
  }
  const threshold = -(metrics.descenderHeight + metrics.capHeight * 0.2);
  return shape.bbox.minY < threshold;
}

/**
 * Maps a glyph from font coordinates to layout coordinates using shape #0 metrics.
 *
 * UNIFONT encodes y = 0 at the cell top with negative y toward the baseline at
 * y = -baseUp. Layout uses y = 0 at the baseline with positive y upward, so glyphs
 * are shifted by {@link ShxFontMetrics.capHeight}.
 *
 * Some SHAPES text fonts (e.g. gdt.shx) reuse the same top-origin encoding; they are
 * detected via {@link shapeEncodedWithTopOrigin}.
 *
 * BIGFONT and baseline-origin SHAPES need no vertical shift.
 */
function alignGlyphWithMetrics(
  shape: ShxShape,
  fontData: ShxFontData,
  metrics: ShxFontMetrics,
  advanceStrategy: ShxAdvanceWidthStrategy = defaultAdvanceWidthStrategy
): ShxShape {
  let aligned = shape;

  if (
    fontData.header.fontType === ShxFontType.UNIFONT ||
    shapeEncodedWithTopOrigin(fontData, shape, metrics)
  ) {
    // Dual-orientation unifont horizontal glyphs (txt.shx) already use baseline at y = 0.
    if (!(fontData.header.fontType === ShxFontType.UNIFONT && fontData.content.dualOrientation)) {
      aligned = aligned.offset(new Point(0, metrics.capHeight), true);
    }
  }

  const advance = advanceStrategy.resolve(aligned, metrics.cellWidth);
  const hasExplicitAdvance = advanceStrategy.markAlignedAdvanceExplicit(aligned)
    ? true
    : aligned.hasExplicitAdvance;
  return new ShxShape(
    new Point(advance, aligned.lastPoint?.y ?? 0),
    aligned.polylines,
    hasExplicitAdvance
  );
}

/**
 * Applies font metrics to scaled SHX geometry for text layout.
 *
 * Raw {@link ShxFont.getCharShape} output keeps encoded coordinates from the SHX file;
 * this function repositions glyphs so mixed-font lines share a common baseline.
 */
export function alignShxGlyphForLayout(
  shape: ShxShape,
  fontData: ShxFontData,
  size: number,
  advanceStrategy: ShxAdvanceWidthStrategy = defaultAdvanceWidthStrategy
): ShxShape {
  const metrics = computeFontMetrics(fontData.content, size);
  return alignGlyphWithMetrics(shape, fontData, metrics, advanceStrategy);
}
