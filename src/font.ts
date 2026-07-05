import { ShxFileReader } from './fileReader';
import { ShxFontContentData, ShxFontData, ShxFontType } from './fontData';
import { ShxHeaderParser } from './headerParser';
import { ShxContentParserFactory } from './contentParser';
import { Point } from './point';
import { ShxShapeParser } from './shapeParser';
import { ShxShape } from './shape';

/** Treat arc/line tessellation noise at the baseline as y=0 for unifont alignment. */
const LAYOUT_BASELINE_EPSILON = 1e-6;

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

function scaledCapHeight(content: ShxFontContentData, size: number): number {
  return computeFontMetrics(content, size).capHeight;
}

function verticalBaselineBand(content: ShxFontContentData, size: number): number {
  const { height, baseDown } = content;
  if (height <= 0) {
    return LAYOUT_BASELINE_EPSILON;
  }
  return Math.max(size * (baseDown / height), LAYOUT_BASELINE_EPSILON);
}

function isVerticalTextShapesFont(fontType: ShxFontType, content: ShxFontContentData): boolean {
  return (
    fontType === ShxFontType.SHAPES &&
    content.orientation === 'vertical' &&
    content.data[0] !== undefined
  );
}

function usesVerticalNegativeYAlignment(fontType: ShxFontType, content: ShxFontContentData): boolean {
  return fontType === ShxFontType.UNIFONT || isVerticalTextShapesFont(fontType, content);
}

function hasFiniteGlyphHeight(bbox: { minY: number; maxY: number }): boolean {
  const height = bbox.maxY - bbox.minY;
  return Number.isFinite(height) && height > LAYOUT_BASELINE_EPSILON;
}

function shouldNormalizeBigfontBodyGlyph(bbox: { minY: number; maxY: number }, size: number): boolean {
  if (!hasFiniteGlyphHeight(bbox)) {
    return false;
  }
  const { minY, maxY } = bbox;
  if (minY <= LAYOUT_BASELINE_EPSILON) {
    return false;
  }
  const height = maxY - minY;
  if (minY >= size * 0.5) {
    return false;
  }
  if (height < size * 0.5) {
    return false;
  }
  return true;
}

function isBigfontBaselinePunctuation(bbox: { minY: number; maxY: number }, size: number): boolean {
  if (!hasFiniteGlyphHeight(bbox)) {
    return false;
  }
  const height = bbox.maxY - bbox.minY;
  return bbox.minY <= size * 0.2 && height < size * 0.5;
}

function isBigfontTopPunctuation(bbox: { minY: number; maxY: number }, size: number): boolean {
  if (!hasFiniteGlyphHeight(bbox)) {
    return false;
  }
  const height = bbox.maxY - bbox.minY;
  return bbox.minY > size * 0.2 && height < size * 0.5;
}

function isZeroHeightBaselineStroke(
  bbox: { minY: number; maxY: number },
  content: ShxFontContentData,
  size: number
): boolean {
  const height = bbox.maxY - bbox.minY;
  if (height > LAYOUT_BASELINE_EPSILON) {
    return false;
  }
  const band = verticalBaselineBand(content, size);
  return (
    Math.abs(bbox.minY) <= band + LAYOUT_BASELINE_EPSILON &&
    Math.abs(bbox.maxY) <= band + LAYOUT_BASELINE_EPSILON
  );
}

function isSmallCapPunctuation(bbox: { minY: number; maxY: number }, size: number): boolean {
  const height = bbox.maxY - bbox.minY;
  if (height <= LAYOUT_BASELINE_EPSILON) {
    return false;
  }
  if (height >= size * 0.5) {
    return false;
  }
  if (bbox.minY > size * 0.2) {
    return false;
  }
  return height <= size * 0.3;
}

function centerInCapBand(shape: ShxShape, content: ShxFontContentData, size: number): ShxShape {
  const capHeight = scaledCapHeight(content, size);
  const targetCenterY = capHeight * 0.5;
  const bbox = shape.bbox;
  const currentCenterY = (bbox.minY + bbox.maxY) / 2;
  return shape.offset(new Point(0, targetCenterY - currentCenterY), true);
}

function extendNarrowGlyphAdvance(shape: ShxShape, size: number): ShxShape {
  const { maxX } = shape.bbox;
  const lastPoint = shape.lastPoint;
  if (maxX >= size * 0.12 || !lastPoint || lastPoint.x >= maxX - LAYOUT_BASELINE_EPSILON) {
    return shape;
  }
  return new ShxShape(new Point(maxX, lastPoint.y), shape.polylines);
}

function alignBigfontGlyph(shape: ShxShape, content: ShxFontContentData, size: number): ShxShape {
  const bbox = shape.bbox;

  if (Number.isFinite(bbox.minY) && bbox.minY < -LAYOUT_BASELINE_EPSILON) {
    shape = shape.offset(new Point(0, -bbox.minY), true);
  } else if (isBigfontBaselinePunctuation(shape.bbox, size)) {
    // Baseline punctuation keeps its encoded horizontal slot; only lift to y=0.
    if (Math.abs(shape.bbox.minY) > LAYOUT_BASELINE_EPSILON) {
      shape = shape.offset(new Point(0, -shape.bbox.minY), true);
    }
  } else if (shouldNormalizeBigfontBodyGlyph(shape.bbox, size)) {
    shape = shape.normalizeToOrigin(true);
  } else if (isBigfontTopPunctuation(shape.bbox, size)) {
    const capHeight = scaledCapHeight(content, size);
    const shiftY = capHeight - shape.bbox.maxY;
    if (Math.abs(shiftY) > LAYOUT_BASELINE_EPSILON) {
      shape = shape.offset(new Point(0, shiftY), true);
    }
  }

  return shape;
}

function alignVerticalNegativeYGlyph(
  shape: ShxShape,
  content: ShxFontContentData,
  size: number
): ShxShape {
  const { minY, maxY } = shape.bbox;

  if (minY >= 0) {
    if (isZeroHeightBaselineStroke(shape.bbox, content, size)) {
      return centerInCapBand(shape, content, size);
    }
    if (isSmallCapPunctuation(shape.bbox, size)) {
      return centerInCapBand(shape, content, size);
    }
    return shape;
  }

  const band = verticalBaselineBand(content, size);
  if (maxY > band) {
    return shape;
  }

  if (maxY < -band) {
    const { height, baseUp } = content;
    if (height <= 0) {
      return shape;
    }
    return shape.offset(new Point(0, size * (baseUp / height)), true);
  }

  return shape.normalizeToOrigin(true);
}

/**
 * Applies font-type-specific baseline alignment to scaled SHX geometry for text layout.
 *
 * Raw {@link ShxFont.getCharShape} output keeps encoded coordinates from the SHX file;
 * this function repositions glyphs so mixed-font lines share a common baseline and
 * punctuation renders correctly without shrinking horizontal advance.
 */
export function alignShxGlyphForLayout(shape: ShxShape, fontData: ShxFontData, size: number): ShxShape {
  const fontType = fontData.header.fontType;
  const content = fontData.content;

  if (fontType === ShxFontType.BIGFONT) {
    shape = alignBigfontGlyph(shape, content, size);
  } else if (usesVerticalNegativeYAlignment(fontType, content)) {
    shape = alignVerticalNegativeYGlyph(shape, content, size);
  }

  if (fontType === ShxFontType.UNIFONT) {
    shape = extendNarrowGlyphAdvance(shape, size);
  }

  return shape;
}

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
 * Represents a SHX font and provides methods to parse and render its characters.
 * This class handles the loading and parsing of SHX font files, and provides
 * methods to extract character shapes for rendering.
 */
export class ShxFont {
  /** The parsed font data containing header and content information */
  public readonly fontData: ShxFontData;
  /** Parser for converting character codes to shapes */
  private readonly shapeParser: ShxShapeParser;

  /**
   * Creates a new ShxFont instance.
   * @param data - Either raw binary data of the SHX font file (ArrayBuffer) or pre-parsed font data (ShxFontData)
   * @throws {Error} If the font data is invalid or cannot be parsed
   */
  constructor(data: ShxFontData | ArrayBuffer) {
    if (data instanceof ArrayBuffer) {
      const reader = new ShxFileReader(data);
      const headerParser = new ShxHeaderParser();
      const header = headerParser.parse(reader);
      const contentParser = ShxContentParserFactory.createParser(header.fontType);
      const content = contentParser.parse(reader);
      this.fontData = {
        header,
        content,
      };
    } else {
      this.fontData = data;
    }
    this.shapeParser = new ShxShapeParser(this.fontData);
  }

  /**
   * Return true if this font contains glyph of the specified character. Otherwise, return false.
   * @param char - The character to check
   * @returns True if this font contains glyph of the specified character. Otherwise, return false.
   */
  hasChar(code: number): boolean {
    const codes = this.fontData.content.data;
    return codes[code] !== undefined;
  }

  /**
   * Return true if this font contains a shape with the specified name. Otherwise, return false.
   * Shape names are matched case-insensitively.
   * @param name - The shape name to check (for example, "GRS")
   * @returns True if this font contains the named shape. Otherwise, return false.
   */
  hasShape(name: string): boolean {
    return this.getShapeCode(name) !== undefined;
  }

  /**
   * Gets the character code for a named shape.
   * @param name - The shape name to look up
   * @returns The character code, or undefined if the shape is not found
   */
  getShapeCode(name: string): number | undefined {
    const names = this.fontData.content.names;
    if (!names) {
      return undefined;
    }
    return names[name.toUpperCase()];
  }

  /**
   * Gets the shape name for a character code, if one is defined.
   * @param code - The character code to look up
   * @returns The shape name, or undefined if the code has no name
   */
  getShapeName(code: number): string | undefined {
    const fromMap = this.fontData.content.codeToName?.[code];
    if (fromMap !== undefined) {
      return fromMap;
    }

    const names = this.fontData.content.names;
    if (!names) {
      return undefined;
    }

    for (const [name, shapeCode] of Object.entries(names)) {
      if (shapeCode === code) {
        return name;
      }
    }
    return undefined;
  }

  /**
   * Returns scaled font metrics for a target render size.
   * @param size - Target font size in drawing units
   */
  getFontMetrics(size: number): ShxFontMetrics {
    return computeFontMetrics(this.fontData.content, size);
  }

  /**
   * Returns a layout-ready glyph: scaled geometry with baseline alignment applied.
   *
   * Prefer this over {@link ShxFont.getCharShape} when placing text for display.
   *
   * @param code - The character code to get the shape for
   * @param size - The desired font size
   */
  getLayoutCharShape(code: number, size: number): ShxShape | undefined {
    const raw = this.getCharShape(code, size);
    if (!raw) {
      return undefined;
    }
    return alignShxGlyphForLayout(raw, this.fontData, size);
  }

  /**
   * Gets the shape data for a named shape at a given font size.
   * Shape names are matched case-insensitively.
   * @param name - The shape name to get the shape for
   * @param size - The desired font size
   * @returns The shape data for the named shape, or undefined if it is not found in the font
   */
  getShapeByName(name: string, size: number): ShxShape | undefined {
    const code = this.getShapeCode(name);
    if (code === undefined) {
      return undefined;
    }
    return this.getCharShape(code, size);
  }

  /**
   * Gets the scaled shape geometry for a character code.
   *
   * Returns the glyph as encoded in the SHX file, scaled to `size`. Vertical placement
   * and mixed-font baseline alignment are the responsibility of the text renderer;
   * see the `textLayout` module and {@link ShxFont.getFontMetrics}.
   *
   * @param code - The character code to get the shape for
   * @param size - The desired font size
   * @returns The shape data for the character, or undefined if the character is not found in the font
   */
  public getCharShape(code: number, size: number): ShxShape | undefined {
    return this.shapeParser.getCharShape(code, size);
  }

  /**
   * Releases resources used by the font.
   * This should be called when the font is no longer needed to free up memory.
   */
  public release(): void {
    this.shapeParser.release();
  }
}
