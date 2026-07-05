import { ShxFileReader } from './fileReader';
import { ShxFontData, ShxFontType } from './fontData';
import { ShxHeaderParser } from './headerParser';
import { ShxContentParserFactory } from './contentParser';
import { ShxShapeParser } from './shapeParser';

/** Treat arc/line tessellation noise at the baseline as y=0 for unifont alignment. */
const UNIFONT_BASELINE_EPSILON = 1e-6;

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
   * Gets the shape data for a named shape at a given font size.
   * Shape names are matched case-insensitively.
   * @param name - The shape name to get the shape for
   * @param size - The desired font size
   * @returns The shape data for the named shape, or undefined if it is not found in the font
   */
  getShapeByName(name: string, size: number) {
    const code = this.getShapeCode(name);
    if (code === undefined) {
      return undefined;
    }
    return this.getCharShape(code, size);
  }

  /**
   * Gets the shape data for a specific character at a given font size.
   * @param code - The character code to get the shape for
   * @param size - The desired font size
   * @returns The shape data for the character, or undefined if the character is not found in the font
   */
  public getCharShape(code: number, size: number) {
    let shape = this.shapeParser.getCharShape(code, size);
    if (!shape) {
      return undefined;
    }

    const fontType = this.fontData.header.fontType;

    if (fontType === ShxFontType.BIGFONT) {
      // Normalize baseline-aligned and mid-cell body glyphs to the origin.
      // Top/center punctuation (e.g. “一”, quotation marks) sit in the upper
      // half of the cell and must keep their vertical position.
      if (shape.bbox.minY <= size * 0.5) {
        shape = shape.normalizeToOrigin(true);
      }
    } else if (fontType === ShxFontType.UNIFONT) {
      // Some unifont files (e.g. tssdeng.shx) encode body strokes in negative Y
      // with maxY on the baseline. Shift to cell-bottom origin so mixed
      // bigfont + unifont lines share minY = 0 as the bottom edge.
      if (shape.bbox.minY < 0 && shape.bbox.maxY <= UNIFONT_BASELINE_EPSILON) {
        shape = shape.normalizeToOrigin(true);
      }
    }

    return shape;
  }

  /**
   * Releases resources used by the font.
   * This should be called when the font is no longer needed to free up memory.
   */
  public release(): void {
    this.shapeParser.release();
  }
}
