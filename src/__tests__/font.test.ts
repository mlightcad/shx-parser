import { ShxFont } from '../font';
import { alignShxGlyphForLayout, computeFontMetrics } from '../glyphLayout';
import { ShxFontData, ShxFontType } from '../fontData';
import { Point } from '../point';
import { ShxShape } from '../shape';

function createBigFontData(shapes: Record<number, Uint8Array>): ShxFontData {
  return {
    header: {
      fontType: ShxFontType.BIGFONT,
      fileHeader: 'AutoCAD-86 bigfont V1.0',
      fileVersion: '1.0',
    },
    content: {
      data: shapes,
      info: 'test',
      orientation: 'horizontal',
      baseUp: 7,
      baseDown: 1,
      height: 8,
      width: 8,
      isExtended: false,
    },
  };
}

describe('ShxFont', () => {
  describe('getCharShape returns scaled raw geometry', () => {
    // Horizontal line along the baseline: pen down, draw 8 units east, pen up, end.
    const baselineShape = new Uint8Array([0x01, 0x80, 0x02, 0x00]);
    // Horizontal line near the top of the cell: move to (0, 7), pen down, draw east, pen up, end.
    const topAlignedShape = new Uint8Array([0x02, 0x08, 0x00, 0x07, 0x01, 0x80, 0x02, 0x00]);
    // Small mark in the upper cell (like hztxt quotation at GBK 0xA1B0): short stroke at y=3.
    const topPunctuationShape = new Uint8Array([
      0x02, 0x08, 0x00, 0x03, 0x01, 0x40, 0x02, 0x00,
    ]);

    const font = new ShxFont(
      createBigFontData({
        1: baselineShape,
        2: topAlignedShape,
        3: topPunctuationShape,
      })
    );

    afterAll(() => {
      font.release();
    });

    it('returns baseline-aligned bigfont glyphs at y=0 unchanged', () => {
      const size = 16;
      const shape = font.getCharShape(1, size);

      expect(shape).toBeDefined();
      expect(shape!.bbox.minX).toBe(0);
      expect(shape!.bbox.minY).toBe(0);
    });

    it('preserves vertical position for top-aligned bigfont glyphs', () => {
      const size = 16;
      const shape = font.getCharShape(2, size);

      expect(shape).toBeDefined();
      expect(shape!.bbox.minY).toBeCloseTo(14);
    });

    it('preserves encoded vertical position for top punctuation (no cap alignment)', () => {
      const size = 16;
      const shape = font.getCharShape(3, size);

      expect(shape).toBeDefined();
      // y=3 in an 8-unit cell, scaled to size 16 → minY ≈ 6
      expect(shape!.bbox.minY).toBeCloseTo(6);
      expect(shape!.bbox.maxY).toBeCloseTo(6);
    });

    it('matches shapeParser output without post-processing', () => {
      const size = 16;
      const parser = (font as unknown as {
        shapeParser: { getCharShape(c: number, s: number): import('../shape').ShxShape };
      }).shapeParser;

      for (const code of [1, 2, 3]) {
        const raw = parser.getCharShape(code, size);
        const fromFont = font.getCharShape(code, size);
        if (!raw || !fromFont) {
          throw new Error(`Expected shapes for code ${code}`);
        }
        expect(fromFont.bbox).toEqual(raw.bbox);
        expect(fromFont.lastPoint?.x).toBeCloseTo(raw.lastPoint?.x ?? 0);
      }
    });
  });

  describe('getFontMetrics', () => {
    const font = new ShxFont(
      createBigFontData({
        1: new Uint8Array([0x01, 0x80, 0x02, 0x00]),
      })
    );

    afterAll(() => {
      font.release();
    });

    it('scales baseUp and baseDown from shape #0', () => {
      const metrics = font.getFontMetrics(16);
      expect(metrics.size).toBe(16);
      expect(metrics.capHeight).toBeCloseTo(14);
      expect(metrics.descenderHeight).toBeCloseTo(2);
      expect(metrics.totalHeight).toBeCloseTo(16);
      expect(metrics.cellWidth).toBeCloseTo(16);
    });
  });

  describe('alignShxGlyphForLayout', () => {
    const bigfontData = createBigFontData({ 1: new Uint8Array([0x01, 0x80, 0x02, 0x00]) });

    it('normalizes mid-cell bigfont body glyphs to the origin', () => {
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(0, 4), new Point(8, 12)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, bigfontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(0);
    });

    it('aligns bigfont top punctuation to the cap band', () => {
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(2, 6), new Point(4, 8)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, bigfontData, size);
      expect(aligned.bbox.maxY).toBeCloseTo(14);
    });

    it('lifts bigfont baseline punctuation to y=0', () => {
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(2, 2), new Point(4, 4)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, bigfontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(0);
    });

    it('normalizes horizontal origin for descender body glyphs', () => {
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(-2, -2), new Point(6, 12)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, bigfontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(0);
      expect(aligned.bbox.minX).toBeCloseTo(0);
    });

    it('maps top-anchored unifont glyphs to the layout baseline', () => {
      const unifontData: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: {},
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 2,
          height: 10,
          width: 10,
          isExtended: false,
        },
      };
      const size = 16;
      const shape = new ShxShape(new Point(6, 0), [
        [new Point(0, -4), new Point(6, 0)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, unifontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(0);
      expect(aligned.lastPoint?.x).toBeCloseTo(6);
    });

    it('uses cell width when compact monospace unifont pen advance is missing', () => {
      const unifontData: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: {},
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 2,
          height: 8,
          width: 8,
          isExtended: false,
        },
      };
      const size = 16;
      const metrics = computeFontMetrics(unifontData.content, size);
      const shape = new ShxShape(undefined, [
        [new Point(0, -4), new Point(6, 0)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, unifontData, size);
      expect(aligned.lastPoint?.x).toBeCloseTo(metrics.cellWidth);
    });

    it('preserves explicit unifont pen advance from the SHX definition', () => {
      const unifontData: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: {},
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 2,
          height: 10,
          width: 10,
          isExtended: false,
        },
      };
      const size = 16;
      const shape = new ShxShape(new Point(1, 0), [
        [new Point(0, 2), new Point(1.5, 4)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, unifontData, size);
      expect(aligned.lastPoint?.x).toBeCloseTo(1);
    });

    it('places zero-height unifont strokes on the cap line after metrics alignment', () => {
      const unifontData: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: {},
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 2,
          height: 10,
          width: 10,
          isExtended: false,
        },
      };
      const size = 16;
      const metrics = computeFontMetrics(unifontData.content, size);
      const shape = new ShxShape(new Point(4, 0), [
        [new Point(2, 0), new Point(2, 0)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, unifontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(metrics.capHeight);
      expect(aligned.bbox.maxY).toBeCloseTo(metrics.capHeight);
    });
  });

  describe('getLayoutCharShape', () => {
    it('returns undefined for missing glyphs', () => {
      const font = new ShxFont(createBigFontData({}));
      try {
        expect(font.getLayoutCharShape(999, 16)).toBeUndefined();
      } finally {
        font.release();
      }
    });
  });
});
