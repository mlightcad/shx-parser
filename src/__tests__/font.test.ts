import {
  ShxFont,
  detectUnifontBaselineOriginFont,
  unifontUsesBaselineOrigin,
} from '../font';
import { ShxNativeAdvanceStrategy } from '../advanceWidthStrategy';
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

    it('preserves bigfont glyph coordinates without per-glyph adjustment', () => {
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(0, 4), new Point(8, 12)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, bigfontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(4);
      expect(aligned.bbox.maxY).toBeCloseTo(12);
    });

    it('preserves bigfont punctuation positions', () => {
      const size = 16;
      const topMark = new ShxShape(new Point(8, 0), [
        [new Point(2, 6), new Point(4, 8)],
      ]);
      const baselineMark = new ShxShape(new Point(8, 0), [
        [new Point(2, 2), new Point(4, 4)],
      ]);
      const alignedTop = alignShxGlyphForLayout(topMark, bigfontData, size);
      const alignedBaseline = alignShxGlyphForLayout(baselineMark, bigfontData, size);
      expect(alignedTop.bbox.maxY).toBeCloseTo(8);
      expect(alignedBaseline.bbox.minY).toBeCloseTo(2);
    });

    it('preserves bigfont descender ink positions', () => {
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(-2, -2), new Point(6, 12)],
      ]);
      const aligned = alignShxGlyphForLayout(shape, bigfontData, size);
      expect(aligned.bbox.minY).toBeCloseTo(-2);
      expect(aligned.bbox.minX).toBeCloseTo(-2);
    });

    it('shifts unifont glyphs by capHeight from shape #0 metrics', () => {
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
      const shape = new ShxShape(new Point(6, 0), [
        [new Point(0, -4), new Point(6, 0)],
      ]);
      const aligned = alignShxGlyphForLayout(
        shape,
        unifontData,
        size,
        new ShxNativeAdvanceStrategy()
      );
      expect(aligned.bbox.minY).toBeCloseTo(-4 + metrics.capHeight);
      expect(aligned.bbox.maxY).toBeCloseTo(metrics.capHeight);
      expect(aligned.lastPoint?.x).toBeCloseTo(metrics.cellWidth);
    });

    it('uses full cell width when compact unifont pen advance is missing', () => {
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
      const aligned = alignShxGlyphForLayout(
        shape,
        unifontData,
        size,
        new ShxNativeAdvanceStrategy()
      );
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
      const shape = new ShxShape(
        new Point(1, 0),
        [[new Point(0, 2), new Point(1.5, 4)]],
        true
      );
      const aligned = alignShxGlyphForLayout(shape, unifontData, size);
      expect(aligned.lastPoint?.x).toBeCloseTo(1);
    });

    it('shifts zero-height unifont strokes by capHeight only', () => {
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

    it('skips capHeight shift for dual-orientation unifont glyphs', () => {
      const unifontData: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: { 97: new Uint8Array([0x02, 0x08, 0x00, 0x04, 0x01, 0x80, 0x02, 0x00]) },
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 2,
          height: 10,
          width: 10,
          isExtended: false,
          dualOrientation: true,
        },
      };
      const font = new ShxFont(unifontData);
      try {
        const raw = font.getCharShape(97, 16)!;
        const layout = font.getLayoutCharShape(97, 16)!;
        expect(layout.bbox.minY).toBeCloseTo(raw.bbox.minY, 0);
        expect(layout.bbox.maxY).toBeCloseTo(raw.bbox.maxY, 0);
      } finally {
        font.release();
      }
    });
  });

  describe('unifont baseline-origin detection', () => {
    const topOriginUnifont: ShxFontData = {
      header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
      content: {
        data: { 48: new Uint8Array([0x01, 0x80, 0x02, 0x00]) },
        info: '',
        orientation: 'horizontal',
        baseUp: 8,
        baseDown: 2,
        height: 10,
        width: 10,
        isExtended: false,
      },
    };

    it('detects baseline-origin glyphs from ink above y = 0', () => {
      const size = 16;
      const metrics = computeFontMetrics(topOriginUnifont.content, size);
      const baselineGlyph = new ShxShape(new Point(8, 0), [
        [new Point(1, 2), new Point(6, 12)],
      ]);
      const topOriginGlyph = new ShxShape(new Point(8, 0), [
        [new Point(1, -10), new Point(6, -2)],
      ]);

      expect(unifontUsesBaselineOrigin(baselineGlyph, metrics)).toBe(true);
      expect(unifontUsesBaselineOrigin(topOriginGlyph, metrics)).toBe(false);
    });

    it('rejects baseline-origin detection for tiny ink marks', () => {
      const size = 16;
      const metrics = computeFontMetrics(topOriginUnifont.content, size);
      const tinyMark = new ShxShape(new Point(8, 0), [
        [new Point(2, 0), new Point(2, 0)],
      ]);
      expect(unifontUsesBaselineOrigin(tinyMark, metrics)).toBe(false);
    });

    it('returns false for non-unifont fonts', () => {
      const fontData = createBigFontData({ 1: new Uint8Array([0x01, 0x80, 0x02, 0x00]) });
      const size = 16;
      const metrics = computeFontMetrics(fontData.content, size);
      const glyph = new ShxShape(new Point(8, 0), [[new Point(1, 2), new Point(6, 12)]]);

      expect(
        detectUnifontBaselineOriginFont(fontData, () => glyph, size)
      ).toBe(false);
    });

    it('returns true for dual-orientation unifont files', () => {
      const fontData: ShxFontData = {
        ...topOriginUnifont,
        content: { ...topOriginUnifont.content, dualOrientation: true },
      };
      expect(
        detectUnifontBaselineOriginFont(fontData, () => undefined, 16)
      ).toBe(true);
    });

    it('samples available glyphs and skips missing codes', () => {
      const size = 16;
      const metrics = computeFontMetrics(topOriginUnifont.content, size);
      const baselineGlyph = new ShxShape(new Point(8, 0), [
        [new Point(1, 2), new Point(6, 12)],
      ]);

      expect(
        detectUnifontBaselineOriginFont(
          topOriginUnifont,
          (code) => (code === 48 ? baselineGlyph : undefined),
          size
        )
      ).toBe(true);

      expect(
        detectUnifontBaselineOriginFont(
          {
            ...topOriginUnifont,
            content: { ...topOriginUnifont.content, data: {} },
          },
          () => baselineGlyph,
          size
        )
      ).toBe(false);

      expect(unifontUsesBaselineOrigin(baselineGlyph, metrics)).toBe(true);
    });
  });
});
