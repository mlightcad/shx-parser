import { ShxFont } from '../font';
import { ShxFontType } from '../fontData';
import { ShxFileReader } from '../fileReader';
import {
  buildMinimalShapesShx,
  createTestFont,
  getShape,
} from './helpers/fontTestHelpers';

describe('font type scaling and detection', () => {
  describe('plain shape library vs text font (shape #0)', () => {
    it('text fonts scale by size / height', () => {
      const line = new Uint8Array([0x01, 0x80, 0x00]);
      const font = createTestFont({
        shapes: { 65: line },
        isTextFont: true,
        height: 10,
      });
      try {
        const at10 = getShape(font, 65, 10);
        const at20 = getShape(font, 65, 20);
        expect(at10!.lastPoint!.x).toBeCloseTo(8);
        expect(at20!.lastPoint!.x).toBeCloseTo(16);
      } finally {
        font.release();
      }
    });

    it('plain shape libraries scale by size directly (ignore height)', () => {
      const line = new Uint8Array([0x01, 0x80, 0x00]);
      const font = createTestFont({
        shapes: { 230: line },
        isTextFont: false,
        height: 10,
      });
      try {
        const at1 = getShape(font, 230, 1);
        const at2 = getShape(font, 230, 2);
        expect(at1!.lastPoint!.x).toBeCloseTo(8);
        expect(at2!.lastPoint!.x).toBeCloseTo(16);
      } finally {
        font.release();
      }
    });

    it('detects text vs plain shape from real SHX files via shape #0', async () => {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/';

      async function load(filename: string): Promise<ShxFont | null> {
        try {
          const response = await fetch(FONT_BASE + filename);
          if (!response.ok) throw new Error('fetch failed');
          return new ShxFont(await response.arrayBuffer());
        } catch {
          try {
            const data = await readFile(join(process.cwd(), 'examples', 'fonts', filename));
            return new ShxFont(data.buffer);
          } catch {
            return null;
          }
        }
      }

      const times = await load('times.shx');
      const ltypeshp = await load('ltypeshp.shx');
      if (!times || !ltypeshp) {
        return;
      }
      try {
        expect(times.fontData.content.data[0]).toBeDefined();
        expect(ltypeshp.fontData.content.data[0]).toBeUndefined();
      } finally {
        times.release();
        ltypeshp.release();
      }
    }, 60_000);
  });

  describe('ShxFont API', () => {
    it('hasChar returns false for missing codes and code 0', () => {
      const font = createTestFont({
        shapes: { 65: new Uint8Array([0x00]) },
        isTextFont: true,
      });
      try {
        expect(font.hasChar(65)).toBe(true);
        expect(font.hasChar(66)).toBe(false);
        expect(font.getCharShape(0, 10)).toBeUndefined();
        expect(font.getShapeByName('missing', 10)).toBeUndefined();
        expect(font.hasShape('missing')).toBe(false);
      } finally {
        font.release();
      }
    });
  });

  describe('compiled SHX integration', () => {
    it('parses a minimal compiled shapes file end-to-end', () => {
      const bytecode = new Uint8Array([0x01, 0x80, 0x00]);
      const raw = new Uint8Array([...new TextEncoder().encode('TEST'), 0x00, ...bytecode]);
      const buffer = buildMinimalShapesShx([{ code: 99, raw }]);
      const font = new ShxFont(buffer);
      try {
        expect(font.fontData.header.fontType).toBe(ShxFontType.SHAPES);
        expect(font.hasShape('TEST')).toBe(true);
        expect(font.getShapeCode('test')).toBe(99);
        expect(font.getShapeName(99)).toBe('TEST');
        const shape = font.getCharShape(99, 1);
        expect(shape!.lastPoint!.x).toBeCloseTo(8);
      } finally {
        font.release();
      }
    });
  });

  describe('ShxFileReader.byteToSByte', () => {
    it('converts unsigned bytes to signed SHX values', () => {
      expect(ShxFileReader.byteToSByte(0)).toBe(0);
      expect(ShxFileReader.byteToSByte(127)).toBe(127);
      expect(ShxFileReader.byteToSByte(128)).toBe(-128);
      expect(ShxFileReader.byteToSByte(254)).toBe(-2);
      expect(ShxFileReader.byteToSByte(255)).toBe(-1);
    });
  });
});
