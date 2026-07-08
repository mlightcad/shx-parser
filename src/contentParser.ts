import { ShxFileReader } from './fileReader';
import { Orientation, ShxFontContentData, ShxFontType } from './fontData';

const DEFAULT_FONT_SIZE = 10;

/**
 * Detecting the termination symbol of a string.
 * 
 * ['\r', '\n', '\x00']
 */
const TERMINATING_CHARS = [0x0d, 0x0a, 0x00];

/** Applies shape #0 / unifont info-block mode-byte semantics to font metadata. */
function applyFontModes(fontData: ShxFontContentData, modes: number): void {
  if (modes === 0) {
    fontData.orientation = 'horizontal';
    return;
  }
  if (modes === 2) {
    // Dual-orientation text fonts (txt.shx, simplex.shx, etc.) default to horizontal layout.
    fontData.orientation = 'horizontal';
    fontData.dualOrientation = true;
    return;
  }
  fontData.orientation = 'vertical';
}

function buildCodeToName(names: Record<string, number>): Record<number, string> {
  const codeToName: Record<number, string> = {};
  for (const [name, code] of Object.entries(names)) {
    codeToName[code] = name;
  }
  return codeToName;
}

/**
 * Splits a compiled shape entry into its optional name label and bytecode payload.
 * Shape files store an uppercase name followed by a null byte before the bytecode.
 * Text-font entries use a leading null byte when no name is stored.
 */
export function splitShapeNameAndBytecode(bytes: Uint8Array): {
  name: string | null;
  bytecode: Uint8Array;
} {
  const nulIndex = bytes.indexOf(0x00);
  if (nulIndex < 0) {
    return { name: null, bytecode: bytes };
  }

  const name =
    nulIndex > 0 ? new TextDecoder('ascii').decode(bytes.subarray(0, nulIndex)) : null;
  return { name, bytecode: bytes.subarray(nulIndex + 1) };
}

/**
 * Interface for parsing the content section of a SHX font file.
 * Different font types may have different parsing implementations.
 */
export interface ShxContentParser {
  /**
   * Parses the content section of a SHX font file.
   * @param reader - The file reader positioned at the start of the content section
   * @returns The parsed font content data
   */
  parse(reader: ShxFileReader): ShxFontContentData;
}

class ShxShapeContentParser implements ShxContentParser {
  parse(reader: ShxFileReader): ShxFontContentData {
    try {
      // Skip start and end codes
      reader.readBytes(4);
      const count = reader.readInt16();

      if (count <= 0) {
        throw new Error('Invalid shape count in font file');
      }

      const items: { code: number; length: number }[] = [];
      for (let i = 0; i < count; i++) {
        const code = reader.readUint16();
        const length = reader.readUint16();
        if (length > 0) {
          // Only add valid entries
          items.push({ code, length });
        }
      }

      const rawData: Record<number, Uint8Array> = {};
      for (const item of items) {
        try {
          const bytes = reader.readBytes(item.length);
          if (bytes.length === item.length) {
            rawData[item.code] = bytes;
          }
        } catch {
          console.warn(`Failed to read shape data for code ${item.code}`);
        }
      }

      const data: Record<number, Uint8Array> = {};
      const names: Record<string, number> = {};
      for (const [codeKey, bytes] of Object.entries(rawData)) {
        const code = Number(codeKey);
        if (code === 0) {
          data[code] = bytes;
          continue;
        }

        const { name, bytecode } = splitShapeNameAndBytecode(bytes);
        data[code] = bytecode;
        if (name) {
          names[name] = code;
        }
      }

      // Set default values first
      const fontData: ShxFontContentData = {
        data,
        names: Object.keys(names).length > 0 ? names : undefined,
        codeToName: Object.keys(names).length > 0 ? buildCodeToName(names) : undefined,
        info: '',
        baseUp: 8,
        baseDown: 2,
        height: DEFAULT_FONT_SIZE,
        width: DEFAULT_FONT_SIZE,
        orientation: 'horizontal',
        isExtended: false,
      };

      // Try to read font info if available
      if (0 in data) {
        const infoData = data[0];
        try {
          const info = new TextDecoder().decode(infoData);
          let index = infoData.findIndex((v) => TERMINATING_CHARS.includes(v))
          if (index >= 0) {
            fontData.info = info.substring(0, index);
            if (index + 3 < infoData.length) {
              fontData.baseUp = infoData[index + 1];
              fontData.baseDown = infoData[index + 2];
              fontData.height = fontData.baseDown + fontData.baseUp;
              fontData.width = fontData.height;
              applyFontModes(fontData, infoData[index + 3]);
            }
          }
        } catch {
          console.warn('Failed to parse font info block');
        }
      }

      return fontData;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse shape font: ${message}`);
    }
  }
}

class ShxBigfontContentParser implements ShxContentParser {
  parse(reader: ShxFileReader): ShxFontContentData {
    try {
      reader.readInt16(); // item length
      const count = reader.readInt16();
      const changeNumber = reader.readInt16();

      if (count <= 0) {
        throw new Error('Invalid character count in font file');
      }

      // Skip change table
      reader.skip(changeNumber * 4);

      const items: { code: number; length: number; offset: number }[] = [];
      for (let i = 0; i < count; i++) {
        const code = reader.readUint16();
        const length = reader.readUint16();
        const offset = reader.readUint32();
        if (code !== 0 || length !== 0 || offset !== 0) {
          items.push({ code, length, offset });
        }
      }

      const data: Record<number, Uint8Array> = {};
      for (const item of items) {
        try {
          reader.setPosition(item.offset);
          const bytes = reader.readBytes(item.length);
          if (bytes.length === item.length) {
            data[item.code] = bytes;
          }
        } catch {
          console.warn(`Failed to read bigfont data for code ${item.code}`);
        }
      }

      // Set default values first
      const fontData: ShxFontContentData = {
        data,
        info: '',
        baseUp: 8,
        baseDown: 2,
        height: DEFAULT_FONT_SIZE,
        width: DEFAULT_FONT_SIZE,
        orientation: 'horizontal',
        isExtended: false,
      };

      // Try to read font info if available
      if (0 in data) {
        const infoData = data[0];
        try {
          const info = this.utf8ArrayToStr(infoData);
          if (info.pos >= 0) {
            let infoText = info.text;
            while (infoText.length > 0 && infoText.charCodeAt(infoText.length - 1) === 0) {
              infoText = infoText.slice(0, -1);
            }
            fontData.info = infoText;
            const metrics = this.parseBigfontMetrics(infoData, info.pos + 1);
            if (metrics) {
              Object.assign(fontData, metrics);
            }
          }
        } catch {
          console.warn('Failed to parse bigfont info block');
        }
      }

      return fontData;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse big font: ${message}`);
    }
  }

  private parseBigfontMetrics(
    infoData: Uint8Array,
    startIndex: number
  ): Pick<
    ShxFontContentData,
    | 'baseUp'
    | 'baseDown'
    | 'height'
    | 'width'
    | 'orientation'
    | 'isExtended'
    | 'verticalDualMode'
  > | null {
    let index = startIndex;
    while (index < infoData.length && infoData[index] === 0) {
      index++;
    }

    const remaining = infoData.length - index;
    if (remaining <= 0) {
      return null;
    }

    const readOrientation = (modes: number): Orientation =>
      modes === 0 ? 'horizontal' : 'vertical';

    // Extended: character-height, 0, modes, character-width, [0]
    if (remaining >= 5) {
      const height = infoData[index++];
      index++;
      const orientation = readOrientation(infoData[index++]);
      const width = infoData[index++];
      return {
        baseUp: height,
        baseDown: 0,
        height,
        width,
        orientation,
        isExtended: true,
      };
    }

    if (
      remaining === 4 &&
      infoData[index + 1] === 0 &&
      infoData[index + 3] > 0 &&
      infoData[index + 3] !== infoData[index]
    ) {
      const height = infoData[index++];
      index++;
      const orientation = readOrientation(infoData[index++]);
      const width = infoData[index];
      return {
        baseUp: height,
        baseDown: 0,
        height,
        width,
        orientation,
        isExtended: true,
      };
    }

    // Non-extended: above, below, modes, [0]
    if (remaining === 4) {
      const baseUp = infoData[index++];
      const baseDown = infoData[index++];
      const orientation = readOrientation(infoData[index++]);
      return {
        baseUp,
        baseDown,
        height: baseUp + baseDown,
        width: baseUp + baseDown,
        orientation,
        isExtended: false,
      };
    }

    // Short non-extended tail seen in gbcbig.shx: above, modes, [0]
    if (remaining === 3) {
      const baseUp = infoData[index++];
      const modes = infoData[index++];
      const orientation = readOrientation(modes);
      const verticalDualMode = modes === 2;
      return {
        baseUp,
        baseDown: 0,
        height: baseUp,
        width: baseUp,
        orientation,
        // Dual-orientation vertical bigfonts (modes=2) use composite bytecode.
        isExtended: verticalDualMode,
        verticalDualMode,
      };
    }

    return null;
  }

  private utf8ArrayToStr(array: Uint8Array) {
    let out = '';
    let i = 0;
    while (i < array.length) {
      const c = array[i];
      switch (c >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
          out += String.fromCharCode(c);
          break;
        case 12:
        case 13: {
          const char2 = array[i++];
          out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
          break;
        }
        case 14: {
          const char2_14 = array[i++];
          const char3 = array[i++];
          out += String.fromCharCode(
            ((c & 0x0f) << 12) | ((char2_14 & 0x3f) << 6) | ((char3 & 0x3f) << 0)
          );
          break;
        }
      }
      // Stop continue to convert string if found null
      if (out.charCodeAt(out.length - 1) === 0) break;
      i++;
    }
    return { text: out, pos: i };
  }
}

class ShxUnifontContentParser implements ShxContentParser {
  parse(reader: ShxFileReader): ShxFontContentData {
    try {
      const count = reader.readInt32();
      if (count <= 0) {
        throw new Error('Invalid character count in font file');
      }

      const infoLength = reader.readInt16();
      const infoData = reader.readBytes(infoLength);

      // Set default values first
      const fontData: ShxFontContentData = {
        data: {},
        info: '',
        baseUp: 8,
        baseDown: 2,
        height: DEFAULT_FONT_SIZE,
        width: DEFAULT_FONT_SIZE,
        orientation: 'horizontal',
        isExtended: false,
      };

      // Try to parse info data
      try {
        const info = new TextDecoder().decode(infoData);
        let index = info.indexOf('\x00');
        if (index >= 0) {
          fontData.info = info.substring(0, index);
          if (index + 3 < infoData.length) {
            fontData.baseUp = infoData[index + 1];
            fontData.baseDown = infoData[index + 2];
            fontData.height = fontData.baseUp + fontData.baseDown;
            fontData.width = fontData.height;
            applyFontModes(fontData, infoData[index + 3]);
          }
        }
      } catch {
        console.warn('Failed to parse unifont info block');
      }

      const data: Record<number, Uint8Array> = {};
      const names: Record<string, number> = {};
      for (let i = 0; i < count - 1; i++) {
        try {
          const code = reader.readUint16();
          const length = reader.readUint16();
          if (length > 0) {
            const bytes = reader.readBytes(length);
            if (bytes.length === length) {
              const { name, bytecode } = splitShapeNameAndBytecode(bytes);

              // Only add if we got all the bytes and there's actual bytecode data
              if (bytecode.length > 0) {
                data[code] = bytecode;
                if (name) {
                  names[name] = code;
                }
              }
            }
          }
        } catch {
          console.warn('Failed to read unifont character data');
          break;
        }
      }

      fontData.data = data;
      fontData.names = Object.keys(names).length > 0 ? names : undefined;
      fontData.codeToName =
        Object.keys(names).length > 0 ? buildCodeToName(names) : undefined;
      return fontData;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse unifont: ${message}`);
    }
  }
}

export class ShxContentParserFactory {
  public static createParser(fontType: ShxFontType): ShxContentParser {
    switch (fontType) {
      case ShxFontType.SHAPES:
        return new ShxShapeContentParser();
      case ShxFontType.BIGFONT:
        return new ShxBigfontContentParser();
      case ShxFontType.UNIFONT:
        return new ShxUnifontContentParser();
      default:
        throw new Error(`Unsupported font type: ${fontType}`);
    }
  }
}
