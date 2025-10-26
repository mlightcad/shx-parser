/** Defines the text orientation type */
export type Orientation = 'horizontal' | 'vertical';

/**
 * Represents the type of SHX font file
 */
export enum ShxFontType {
  /** Standard shapes font type */
  SHAPES = 'shapes',
  /** Big font type */
  BIGFONT = 'bigfont',
  /** Unicode font type */
  UNIFONT = 'unifont',
}

/**
 * Represents the content of a SHX font file.
 * Contains the actual font data and metrics.
 */
export interface ShxFontContentData {
  /** Mapping of character codes to their bitmap data */
  data: Record<number, Uint8Array>;
  /** Additional information about the font */
  info: string;
  /** Text orientation (horizontal or vertical) */
  orientation: Orientation;
  /** Number of pixels above the baseline */
  baseUp: number;
  /** Number of pixels below the baseline */
  baseDown: number;
  /**
   * Character height. Used along with character width to indicate the number of units
   * that define the font characters.
   */
  height: number;
  /**
   * Character width. Used along with character height to indicate the number of units
   * that define the font characters. The character-height and character-width values
   * are used to scale the primitives of the font. In this context, primitives are the
   * points, lines, polygons, or character strings of the font geometrically oriented
   * in 2D space. A Kanji character consists of several primitives used repeatedly in
   * different scales and combinations.
   */
  width: number;
  /**
   * Indicates if the font is an extended big font. To reduce the size of composite Kanji
   * characters, you can define an extended Big Font file.
   */
  isExtended: boolean;
}

/**
 * Represents the header information of a SHX font file.
 * Contains metadata about the font.
 */
export interface ShxFontHeaderData {
  /** The type of font (shapes, bigfont, or unifont) */
  fontType: ShxFontType;
  /** Header information from the font file */
  fileHeader: string;
  /** Version information of the font file */
  fileVersion: string;
}

/**
 * Represents the complete data structure of a SHX font file.
 * Combines both header and content information.
 */
export interface ShxFontData {
  /** Header data of the font file */
  header: ShxFontHeaderData;
  /** Content data of the font file */
  content: ShxFontContentData;
}
