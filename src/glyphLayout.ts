import { ShxFontContentData, ShxFontData, ShxFontType } from './fontData';
import { Point } from './point';
import { ShxShape } from './shape';

/** Treat arc/line tessellation noise at the baseline as y=0 for layout comparisons. */
const LAYOUT_BASELINE_EPSILON = 1e-6;

/** Proportional unifont glyphs wider than this fraction of the em use right-ink extent for advance. */
const PROPORTIONAL_UNIFONT_WIDE_INK_RATIO = 0.12;

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

function isVerticalTextShapesFont(fontType: ShxFontType, content: ShxFontContentData): boolean {
  return (
    fontType === ShxFontType.SHAPES &&
    content.orientation === 'vertical' &&
    content.data[0] !== undefined
  );
}

function hasFiniteGlyphHeight(bbox: { minY: number; maxY: number }): boolean {
  const height = bbox.maxY - bbox.minY;
  return Number.isFinite(height) && height > LAYOUT_BASELINE_EPSILON;
}

function ensureNonNegativeMinX(shape: ShxShape): ShxShape {
  if (shape.bbox.minX < -LAYOUT_BASELINE_EPSILON) {
    return shape.offset(new Point(-shape.bbox.minX, 0), true);
  }
  return shape;
}

/** True for txt/aehalf-style 8×8 unifont cells with fixed horizontal advance. */
export function isCompactMonospaceUnifont(content: ShxFontContentData): boolean {
  const { width, height } = content;
  return width > 0 && width === height && width <= 8;
}

/**
 * Resolves horizontal pen advance for a unifont glyph after vertical metrics alignment.
 *
 * When the SHX omits a pen-up x component, compact monospace fonts advance by
 * {@link ShxFontMetrics.cellWidth}. Proportional unifonts use ink width for narrow
 * punctuation and the right ink extent from the cell origin for wider symbols.
 */
export function resolveUnifontFallbackPen(
  rawPenAdvance: number,
  minXBefore: number,
  inkWidth: number,
  content: ShxFontContentData,
  metrics: ShxFontMetrics
): number {
  const xShift = minXBefore < -LAYOUT_BASELINE_EPSILON ? -minXBefore : 0;

  if (rawPenAdvance > LAYOUT_BASELINE_EPSILON) {
    return rawPenAdvance + xShift;
  }
  if (isCompactMonospaceUnifont(content)) {
    return metrics.cellWidth;
  }
  if (inkWidth < metrics.size * PROPORTIONAL_UNIFONT_WIDE_INK_RATIO) {
    return inkWidth;
  }
  return xShift > LAYOUT_BASELINE_EPSILON ? xShift : inkWidth;
}

/**
 * Maps a unifont glyph from cell coordinates to layout coordinates using shape #0 metrics.
 *
 * Unifont cells use y = 0 at the top and negative y toward the baseline at y = -baseUp.
 * Layout uses y = 0 at the baseline with positive y upward, so glyphs are shifted by
 * {@link ShxFontMetrics.capHeight}. Horizontal advance uses the SHX pen vector when present,
 * otherwise {@link ShxFontMetrics.cellWidth} for compact monospace fonts.
 */
function alignUnifontGlyphForLayout(
  shape: ShxShape,
  content: ShxFontContentData,
  size: number
): ShxShape {
  const metrics = computeFontMetrics(content, size);
  const rawPenAdvance = shape.lastPoint?.x ?? 0;
  const rawBbox = shape.bbox;
  shape = shape.offset(new Point(0, metrics.capHeight), true);

  // txt-style compact unifonts draw x-height letters from the cell top (maxY = 0) but
  // stop above the baseline (minY > -capHeight). Snap ink bottom to the layout baseline.
  // Subshape-based unifonts (aehalf) keep maxY below the cell top and are unchanged.
  if (
    hasFiniteGlyphHeight(rawBbox) &&
    Math.abs(rawBbox.maxY) <= LAYOUT_BASELINE_EPSILON &&
    rawBbox.minY > -metrics.capHeight + LAYOUT_BASELINE_EPSILON
  ) {
    const alignedMinY = shape.bbox.minY;
    if (alignedMinY > LAYOUT_BASELINE_EPSILON) {
      shape = shape.offset(new Point(0, -alignedMinY), true);
    }
  }

  const minXBefore = shape.bbox.minX;
  const inkWidth = shape.bbox.maxX - shape.bbox.minX;
  shape = ensureNonNegativeMinX(shape);
  const penX = resolveUnifontFallbackPen(rawPenAdvance, minXBefore, inkWidth, content, metrics);
  return new ShxShape(new Point(penX, shape.lastPoint?.y ?? 0), shape.polylines);
}

/** BIGFONT vertical layout bands derived from shape #0 metrics. */
function computeBigfontLayoutBands(metrics: ShxFontMetrics) {
  const capBand =
    metrics.capHeight > LAYOUT_BASELINE_EPSILON ? metrics.capHeight : metrics.totalHeight;
  return {
    /** Upper bound of the baseline punctuation band (descender + lower cap). */
    baselineZoneTop: metrics.descenderHeight + capBand * 0.2,
    /** Glyphs shorter than this are punctuation or symbols, not body text. */
    punctuationMaxHeight: capBand * 0.5,
    /** Floating body glyphs with minY below this line are normalized to the origin. */
    bodyMidline: capBand * 0.5,
    /** Cap line used to align top-zone punctuation. */
    capLine:
      metrics.capHeight > LAYOUT_BASELINE_EPSILON ? metrics.capHeight : metrics.totalHeight,
  };
}

/**
 * Maps a BIGFONT glyph into layout coordinates using shape #0 metrics.
 *
 * BIGFONT uses y = 0 at the baseline with positive y upward. Descender ink is lifted
 * to the baseline; floating body glyphs normalize to the origin; small punctuation
 * in the lower cap band sits on the baseline; small marks in the upper cap band align
 * their top to {@link ShxFontMetrics.capHeight}.
 */
function alignBigfontGlyph(shape: ShxShape, content: ShxFontContentData, size: number): ShxShape {
  const metrics = computeFontMetrics(content, size);
  const bands = computeBigfontLayoutBands(metrics);
  const bbox = shape.bbox;

  if (Number.isFinite(bbox.minY) && bbox.minY < -LAYOUT_BASELINE_EPSILON) {
    shape = shape.offset(new Point(0, -bbox.minY), true);
    const liftedHeight = shape.bbox.maxY - shape.bbox.minY;
    if (hasFiniteGlyphHeight(shape.bbox) && liftedHeight >= bands.punctuationMaxHeight) {
      return shape.normalizeToOrigin(true);
    }
    return shape;
  }

  const glyphHeight = bbox.maxY - bbox.minY;
  if (!hasFiniteGlyphHeight(bbox)) {
    // Horizontal rules (e.g. hztxt halfwidth hyphen) tessellate to zero bbox height.
    if (bbox.minY > bands.baselineZoneTop && bbox.minY < bands.bodyMidline) {
      return shape;
    }
    if (bbox.minY <= bands.baselineZoneTop && Math.abs(bbox.minY) > LAYOUT_BASELINE_EPSILON) {
      return shape.offset(new Point(0, -bbox.minY), true);
    }
    return shape;
  }

  if (
    bbox.minY > LAYOUT_BASELINE_EPSILON &&
    bbox.minY < bands.bodyMidline &&
    glyphHeight >= bands.punctuationMaxHeight
  ) {
    return shape.normalizeToOrigin(true);
  }

  if (glyphHeight < bands.punctuationMaxHeight && bbox.minY <= bands.baselineZoneTop) {
    if (Math.abs(bbox.minY) > LAYOUT_BASELINE_EPSILON) {
      return shape.offset(new Point(0, -bbox.minY), true);
    }
    return shape;
  }

  if (glyphHeight < bands.punctuationMaxHeight && bbox.minY > bands.baselineZoneTop) {
    const shiftY = bands.capLine - bbox.maxY;
    if (Math.abs(shiftY) > LAYOUT_BASELINE_EPSILON) {
      return shape.offset(new Point(0, shiftY), true);
    }
  }

  return shape;
}

function alignVerticalTextShapesGlyph(
  shape: ShxShape,
  content: ShxFontContentData,
  size: number
): ShxShape {
  const metrics = computeFontMetrics(content, size);
  const { minY, maxY } = shape.bbox;

  if (minY >= 0) {
    return shape;
  }

  const descenderBand = Math.max(metrics.descenderHeight, LAYOUT_BASELINE_EPSILON);
  if (maxY > descenderBand) {
    return shape;
  }

  if (maxY < -descenderBand) {
    shape = shape.offset(new Point(0, metrics.capHeight), true);
    return ensureNonNegativeMinX(shape);
  }

  return shape.normalizeToOrigin(true);
}

/**
 * Applies font-type-specific baseline alignment to scaled SHX geometry for text layout.
 *
 * Raw {@link ShxFont.getCharShape} output keeps encoded coordinates from the SHX file;
 * this function repositions glyphs so mixed-font lines share a common baseline.
 */
export function alignShxGlyphForLayout(shape: ShxShape, fontData: ShxFontData, size: number): ShxShape {
  const fontType = fontData.header.fontType;
  const content = fontData.content;

  if (fontType === ShxFontType.BIGFONT) {
    return alignBigfontGlyph(shape, content, size);
  }

  if (fontType === ShxFontType.UNIFONT) {
    return alignUnifontGlyphForLayout(shape, content, size);
  }

  if (isVerticalTextShapesFont(fontType, content)) {
    return alignVerticalTextShapesGlyph(shape, content, size);
  }

  return shape;
}
