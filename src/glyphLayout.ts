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
 * True when a UNIFONT glyph already encodes with the baseline at y = 0 and ink
 * above it (for example isocp.shx, tssdeng.shx with dualOrientation).
 *
 * These fonts must not receive the capHeight shift applied to top-origin UNIFONTs.
 */
export function unifontUsesBaselineOrigin(
  shape: ShxShape,
  metrics: ShxFontMetrics
): boolean {
  const threshold = -(metrics.descenderHeight + metrics.capHeight * 0.05);
  if (shape.bbox.minY < threshold) {
    return false;
  }
  const inkHeight = shape.bbox.maxY - shape.bbox.minY;
  if (inkHeight < metrics.capHeight * 0.05) {
    return false;
  }
  return true;
}

/**
 * Detects whether a UNIFONT file encodes horizontal glyphs with baseline at y = 0.
 *
 * Samples common ASCII letter/digit codes from the font. When any sample matches
 * {@link unifontUsesBaselineOrigin}, the whole font skips capHeight shifting so
 * punctuation such as hyphen and tilde keep their in-cell vertical positions.
 */
export function detectUnifontBaselineOriginFont(
  fontData: ShxFontData,
  getRawShape: (code: number) => ShxShape | undefined,
  size: number
): boolean {
  if (fontData.header.fontType !== ShxFontType.UNIFONT) {
    return false;
  }
  if (fontData.content.dualOrientation) {
    return true;
  }
  const metrics = computeFontMetrics(fontData.content, size);
  for (const code of [48, 65, 78, 49]) {
    if (!(code in fontData.content.data)) {
      continue;
    }
    const raw = getRawShape(code);
    if (raw && unifontUsesBaselineOrigin(raw, metrics)) {
      return true;
    }
  }
  return false;
}

/**
 * Maps a glyph from font coordinates to layout coordinates using shape #0 metrics.
 *
 * UNIFONT encodes y = 0 at the cell top with negative y toward the baseline at
 * y = -baseUp. Layout uses y = 0 at the baseline with positive y upward, so glyphs
 * are shifted by {@link ShxFontMetrics.capHeight}.
 *
 * ISO-style UNIFONT files (isocp.shx) and dual-orientation fonts (txt.shx) already
 * encode horizontal glyphs with baseline at y = 0; they are detected via
 * {@link unifontUsesBaselineOrigin} and {@link ShxFontContentData.dualOrientation}.
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
  advanceStrategy: ShxAdvanceWidthStrategy = defaultAdvanceWidthStrategy,
  unifontBaselineOriginFont = false
): ShxShape {
  let aligned = shape;

  if (
    fontData.header.fontType === ShxFontType.UNIFONT ||
    shapeEncodedWithTopOrigin(fontData, shape, metrics)
  ) {
    const skipUnifontCapShift =
      fontData.header.fontType === ShxFontType.UNIFONT &&
      (unifontBaselineOriginFont ||
        fontData.content.dualOrientation ||
        unifontUsesBaselineOrigin(shape, metrics));
    const needsCapHeightShift =
      fontData.header.fontType === ShxFontType.UNIFONT ? !skipUnifontCapShift : true;
    if (needsCapHeightShift) {
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
 * this function repositions glyphs so mixed-font lines share a common baseline at y = 0.
 */
export function alignShxGlyphForLayout(
  shape: ShxShape,
  fontData: ShxFontData,
  size: number,
  advanceStrategy: ShxAdvanceWidthStrategy = defaultAdvanceWidthStrategy,
  unifontBaselineOriginFont = false
): ShxShape {
  const metrics = computeFontMetrics(fontData.content, size);
  return alignGlyphWithMetrics(
    shape,
    fontData,
    metrics,
    advanceStrategy,
    unifontBaselineOriginFont
  );
}
