import { ShxFont } from '../../font';
import { ShxFontData, ShxFontType } from '../../fontData';
import { ShxShape } from '../../shape';

/** Encode a signed byte (-128..127) as an unsigned SHX byte. */
export function sbyte(value: number): number {
  return value < 0 ? 256 + value : value;
}

export interface TestFontOptions {
  fontType?: ShxFontType;
  shapes: Record<number, Uint8Array>;
  /** When true, shape #0 is present (text font). When false, plain shape library. */
  isTextFont?: boolean;
  height?: number;
  width?: number;
  orientation?: 'horizontal' | 'vertical';
  isExtended?: boolean;
  shapeZeroInfo?: Uint8Array;
}

export function createTestFont(options: TestFontOptions): ShxFont {
  const fontType = options.fontType ?? ShxFontType.SHAPES;
  const data: Record<number, Uint8Array> = { ...options.shapes };

  if (options.isTextFont) {
    const orientation = options.orientation ?? 'horizontal';
    data[0] =
      options.shapeZeroInfo ??
      new Uint8Array([
        ...new TextEncoder().encode('test font'),
        0x00, // terminator
        8, // baseUp
        2, // baseDown
        orientation === 'vertical' ? 1 : 0,
      ]);
  }

  const height = options.height ?? 10;
  const fontData: ShxFontData = {
    header: {
      fontType,
      fileHeader: `AutoCAD-86 ${fontType} V1.0`,
      fileVersion: '1.0',
    },
    content: {
      data,
      info: options.isTextFont ? 'test font' : '',
      orientation: options.orientation ?? 'horizontal',
      baseUp: 8,
      baseDown: 2,
      height,
      width: options.width ?? height,
      isExtended: options.isExtended ?? false,
    },
  };

  return new ShxFont(fontData);
}

export function getShape(font: ShxFont, code: number, size = 10): ShxShape | undefined {
  return font.getCharShape(code, size);
}

export function allPoints(shape: ShxShape | undefined): { x: number; y: number }[] {
  if (!shape) {
    return [];
  }
  return shape.polylines.flatMap(line => line.map(p => ({ x: p.x, y: p.y })));
}

export function totalVertexCount(shape: ShxShape | undefined): number {
  return allPoints(shape).length;
}

/** Build a minimal compiled shapes SHX ArrayBuffer for integration tests. */
export function buildMinimalShapesShx(
  entries: { code: number; raw: Uint8Array }[]
): ArrayBuffer {
  const header = 'AutoCAD-86 shapes V1.0\r\n\x1a';
  const headerBytes = new TextEncoder().encode(header);

  const tableSize = 4 + 2 + entries.length * 4;
  const dataBytes = entries.reduce((sum, e) => sum + e.raw.length, 0);
  const buffer = new ArrayBuffer(headerBytes.length + tableSize + dataBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes.set(headerBytes, 0);
  let offset = headerBytes.length;

  // start/end codes (4 bytes)
  view.setInt16(offset, 0, true);
  offset += 2;
  view.setInt16(offset, 0, true);
  offset += 2;

  view.setInt16(offset, entries.length, true);
  offset += 2;

  let dataOffset = headerBytes.length + tableSize;
  for (const entry of entries) {
    view.setUint16(offset, entry.code, true);
    offset += 2;
    view.setUint16(offset, entry.raw.length, true);
    offset += 2;
  }

  for (const entry of entries) {
    bytes.set(entry.raw, dataOffset);
    dataOffset += entry.raw.length;
  }

  return buffer;
}
