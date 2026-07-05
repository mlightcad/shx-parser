import { splitShapeNameAndBytecode, ShxContentParserFactory } from '../contentParser';
import { ShxFileReader } from '../fileReader';
import { ShxFont } from '../font';
import { ShxFontType } from '../fontData';
import { createTestFont, getShape } from './helpers/fontTestHelpers';

describe('regression fixes (issues 1–7)', () => {
  it('issue 1: default pen down draws shapes without explicit code 1', () => {
    const dbox = new Uint8Array([0x14, 0x10, 0x1c, 0x18, 0x12, 0x00]);
    const font = createTestFont({ shapes: { 230: dbox } });
    try {
      const shape = getShape(font, 230, 1);
      expect(shape!.polylines.length).toBeGreaterThan(0);
    } finally {
      font.release();
    }
  });

  it('issue 2: code 14 respects font orientation', () => {
    const bytecode = new Uint8Array([0x0e, 0x44, 0x00]);
    const horizontal = createTestFont({
      shapes: { 1: bytecode },
      isTextFont: true,
      orientation: 'horizontal',
    });
    const vertical = createTestFont({
      shapes: { 1: bytecode },
      isTextFont: true,
      orientation: 'vertical',
    });
    try {
      expect(getShape(horizontal, 1, 10)!.lastPoint!.y).toBeCloseTo(0);
      expect(getShape(vertical, 1, 10)!.lastPoint!.y).toBeCloseTo(4);
    } finally {
      horizontal.release();
      vertical.release();
    }
  });

  it('issue 3: subshape with pen-down ending includes trailing stroke', () => {
    const font = createTestFont({
      shapes: { 1: new Uint8Array([0x80, 0x00]) },
      isTextFont: true,
    });
    try {
      expect(getShape(font, 1, 10)!.polylines[0].length).toBe(2);
    } finally {
      font.release();
    }
  });

  it('issue 4: parent continues from subshape endpoint', () => {
    const font = createTestFont({
      shapes: {
        1: new Uint8Array([0x80, 0x00]),
        2: new Uint8Array([0x07, 0x01, 0x80, 0x00]),
      },
      isTextFont: true,
    });
    try {
      getShape(font, 1, 10);
      const parent = getShape(font, 2, 10)!;
      expect(parent.lastPoint!.x).toBeCloseTo(16);
    } finally {
      font.release();
    }
  });

  it('issue 6: invalid shape content throws instead of returning empty data', () => {
    const header = 'AutoCAD-86 shapes V1.0\r\n\x1a';
    const buffer = new ArrayBuffer(header.length + 6);
    const bytes = new Uint8Array(buffer);
    bytes.set(new TextEncoder().encode(header), 0);
    const view = new DataView(buffer);
    view.setInt16(header.length + 4, 0, true);
    const reader = new ShxFileReader(buffer);
    reader.setPosition(header.length);
    const parser = ShxContentParserFactory.createParser(ShxFontType.SHAPES);
    expect(() => parser.parse(reader)).toThrow(/Failed to parse shape font/i);
  });

  it('issue 7a: getShapeName uses codeToName map', () => {
    const font = new ShxFont({
      header: {
        fontType: ShxFontType.SHAPES,
        fileHeader: 'AutoCAD-86',
        fileVersion: '1.0',
      },
      content: {
        data: { 65: new Uint8Array([0x80, 0x00]) },
        names: { A: 65 },
        codeToName: { 65: 'A' },
        info: '',
        orientation: 'horizontal',
        baseUp: 8,
        baseDown: 2,
        height: 10,
        width: 10,
        isExtended: false,
      },
    });
    try {
      expect(font.getShapeName(65)).toBe('A');
      expect(font.getShapeName(66)).toBeUndefined();
    } finally {
      font.release();
    }
  });

  it('issue 7d: getShapeName falls back to names when codeToName is omitted', () => {
    const font = new ShxFont({
      header: {
        fontType: ShxFontType.SHAPES,
        fileHeader: 'AutoCAD-86',
        fileVersion: '1.0',
      },
      content: {
        data: { 65: new Uint8Array([0x80, 0x00]) },
        names: { A: 65 },
        info: '',
        orientation: 'horizontal',
        baseUp: 8,
        baseDown: 2,
        height: 10,
        width: 10,
        isExtended: false,
      },
    });
    try {
      expect(font.getShapeName(65)).toBe('A');
      expect(font.getShapeName(66)).toBeUndefined();
    } finally {
      font.release();
    }
  });

  it('issue 7b: splitShapeNameAndBytecode is exported from the package entry', async () => {
    const mod = await import('../index');
    expect(mod.splitShapeNameAndBytecode).toBe(splitShapeNameAndBytecode);
  });

  it('issue 7c: non-extended bigfont subshape uses uniform width and height', () => {
    const primitive = new Uint8Array([0x80, 0x00]);
    const parent = new Uint8Array([
      0x07,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x06,
      0x00,
    ]);
    const font = createTestFont({
      fontType: ShxFontType.BIGFONT,
      shapes: { 100: parent, 1: primitive },
      isExtended: false,
      height: 8,
    });
    try {
      expect(getShape(font, 100, 16)).toBeDefined();
    } finally {
      font.release();
    }
  });
});

describe('ShxFont constructor error propagation', () => {
  it('throws when ArrayBuffer content is invalid', () => {
    const header = 'AutoCAD-86 shapes V1.0\r\n\x1a';
    const buffer = new ArrayBuffer(header.length + 6);
    const bytes = new Uint8Array(buffer);
    bytes.set(new TextEncoder().encode(header), 0);
    expect(() => new ShxFont(buffer)).toThrow(/Failed to parse shape font/i);
  });
});
