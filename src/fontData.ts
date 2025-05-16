/** Defines the text orientation type */
export type Orientation = 'horizontal' | 'vertical';

/**
 * Represents the type of SHX font file
 */
export enum ShxFontType {
  SHAPES = 'shapes',
  BIGFONT = 'bigfont',
  UNIFONT = 'unifont',
}

/**
 * Represents the content of a SHX font file
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
}

/**
 * Represents the header of a SHX font file
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
 * Represents the data of a SHX font file
 */
export interface ShxFontData {
  /** Header data of the font file */
  header: ShxFontHeaderData;
  /** Content data of the font file */
  content: ShxFontContentData;
}
