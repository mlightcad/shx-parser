import { defaultAdvanceWidthStrategy, ShxAdvanceWidthStrategy } from './advanceWidthStrategy';
import { ShxFontContentData, ShxFontData, ShxFontType } from './fontData';
import { Point } from './point';
import { ShxShape } from './shape';

/** Minimum body-glyph samples required for {@link detectBigfontBaselineInkPadding}. */
const BIGFONT_BASELINE_INK_PADDING_MIN_SAMPLES = 8;
/** Maximum glyph lookups while estimating BIGFONT baseline ink padding. */
const BIGFONT_BASELINE_INK_PADDING_MAX_SAMPLES = 48;
/** Body glyphs above this fraction of the font cell are treated as top-zone punctuation. */
const BIGFONT_BASELINE_INK_PADDING_MAX_BODY_FRACTION = 0.4;
/** Common double-byte BIGFONT body glyphs used to estimate baseline ink padding. */
const BIGFONT_BASELINE_INK_PADDING_SAMPLE_CODES = [
  0xcbc4, 0xb2e3, 0xc2a5, 0xc3e6, 0xd6d0, 0xb9fa, 0xd5e2, 0xb5c4, 0xcac2, 0xd2bb,
  0xc0b4, 0xc9fa, 0xb5c4, 0xd3d0, 0xced2, 0xcdea, 0xcbfb, 0xb2bb, 0xc8cb, 0xb5c4,
  0xd2bb, 0xc4ea, 0xc0b4, 0xcbfb, 0xcbad, 0xb5c4, 0xc3e6, 0xc7b0, 0xc3e6, 0xd6d0,
  0xc9cf, 0xc3c7, 0xcfc2, 0xb5c4, 0xb5bd, 0xc8a5, 0xcbb5, 0xb7a8, 0xb5c4, 0xcab1,
  0xc9fa, 0xb3c9, 0xb7bd, 0xd6f7, 0xbbfa, 0xc6f7, 0xb9ab, 0xbbfa, 0xcafd, 0xd6d8,
];

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
 * Detects the median baseline ink padding for a BIGFONT with no descender band.
 *
 * Extended-style BIGFONT files such as hztxt.shx encode full-width Han glyphs with
 * their lowest ink above y = 0. When paired with baseline-origin UNIFONT primaries
 * (tssdeng.shx), ASCII digits sit on y = 0 while CJK appears visually higher.
 * Layout shifts these BIGFONT glyphs down by the detected padding so mixed lines
 * share a common visual baseline without cross-font reference metrics.
 *
 * @param fontData - Parsed font header and content
 * @param getRawShape - Returns scaled raw geometry for a character code
 * @param size - Font size used when sampling glyph geometry (typically shape #0 height)
 * @returns Median minimum y of sampled body glyphs in font units at `size`
 */
export function detectBigfontBaselineInkPadding(
  fontData: ShxFontData,
  getRawShape: (code: number) => ShxShape | undefined,
  size: number
): number {
  if (fontData.header.fontType !== ShxFontType.BIGFONT || fontData.content.baseDown > 0) {
    return 0;
  }

  const { height } = fontData.content;
  if (height <= 0) {
    return 0;
  }

  const maxBodyMinY = height * BIGFONT_BASELINE_INK_PADDING_MAX_BODY_FRACTION;
  const samples: number[] = [];
  const seenCodes = new Set<number>();

  const considerCode = (code: number) => {
    if (seenCodes.has(code) || code <= 0xff || !(code in fontData.content.data)) {
      return;
    }
    seenCodes.add(code);
    const raw = getRawShape(code);
    if (!raw) {
      return;
    }
    const minY = raw.bbox.minY;
    if (minY > 0 && minY <= maxBodyMinY) {
      samples.push(minY);
    }
  };

  for (const code of BIGFONT_BASELINE_INK_PADDING_SAMPLE_CODES) {
    considerCode(code);
    if (samples.length >= BIGFONT_BASELINE_INK_PADDING_MAX_SAMPLES) {
      break;
    }
  }

  if (samples.length < BIGFONT_BASELINE_INK_PADDING_MIN_SAMPLES) {
    for (const codeStr of Object.keys(fontData.content.data)) {
      considerCode(Number(codeStr));
      if (samples.length >= BIGFONT_BASELINE_INK_PADDING_MAX_SAMPLES) {
        break;
      }
    }
  }

  if (samples.length < BIGFONT_BASELINE_INK_PADDING_MIN_SAMPLES) {
    return 0;
  }

  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  return samples.length % 2 === 0
    ? (samples[mid - 1] + samples[mid]) / 2
    : samples[mid];
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
 * BIGFONT with a descender band and baseline-origin SHAPES need no vertical shift.
 * BIGFONT files with `baseDown = 0` may apply {@link detectBigfontBaselineInkPadding}.
 */
function alignGlyphWithMetrics(
  shape: ShxShape,
  fontData: ShxFontData,
  metrics: ShxFontMetrics,
  advanceStrategy: ShxAdvanceWidthStrategy = defaultAdvanceWidthStrategy,
  unifontBaselineOriginFont = false,
  bigfontBaselineInkPaddingNative = 0
): ShxShape {
  let aligned = shape;

  if (
    fontData.header.fontType === ShxFontType.BIGFONT &&
    bigfontBaselineInkPaddingNative > 0
  ) {
    const scale =
      fontData.content.height > 0 ? metrics.size / fontData.content.height : 1;
    aligned = aligned.offset(new Point(0, -bigfontBaselineInkPaddingNative * scale), true);
  }

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
  unifontBaselineOriginFont = false,
  bigfontBaselineInkPaddingNative = 0
): ShxShape {
  const metrics = computeFontMetrics(fontData.content, size);
  return alignGlyphWithMetrics(
    shape,
    fontData,
    metrics,
    advanceStrategy,
    unifontBaselineOriginFont,
    bigfontBaselineInkPaddingNative
  );
}
