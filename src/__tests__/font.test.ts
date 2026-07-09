import {
  ShxFont,
  DEFAULT_INK_WIDTH_CELL_FACTOR,
  detectBigfontBaselineInkPadding,
  detectUnifontBaselineOriginFont,
  InkWidthAdvanceStrategy,
  ShxNativeAdvanceStrategy,
  shapeEncodedWithTopOrigin,
  unifontUsesBaselineOrigin,
} from '../font';
import { ShxNativeAdvanceStrategy as NativeStrategyDirect } from '../advanceWidthStrategy';
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

function createExtendedBigFontData(shapes: Record<number, Uint8Array>): ShxFontData {
  return {
    ...createBigFontData(shapes),
    content: {
      ...createBigFontData(shapes).content,
      baseDown: 0,
      isExtended: true,
    },
  };
}

function bodyGlyph(minY: number, maxY = minY + 4): ShxShape {
  return new ShxShape(new Point(8, 0), [[new Point(0, minY), new Point(8, maxY)]]);
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

    it('applies explicit bigfont baseline padding when provided', () => {
      const extendedBigfont = createExtendedBigFontData({
        1: new Uint8Array([0x01, 0x80, 0x02, 0x00]),
      });
      const size = 16;
      const shape = new ShxShape(new Point(8, 0), [[new Point(0, 4), new Point(8, 12)]]);
      const aligned = alignShxGlyphForLayout(shape, extendedBigfont, size, undefined, false, 2);
      expect(aligned.bbox.minY).toBeCloseTo(0);
      expect(aligned.bbox.maxY).toBeCloseTo(8);
    });

    it('detects top-origin SHAPES fonts from deep negative ink', () => {
      const shapesFont: ShxFontData = {
        header: { fontType: ShxFontType.SHAPES, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: { 0: new Uint8Array([0x00]), 1: new Uint8Array([0x00]) },
          info: 'test',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 2,
          height: 10,
          width: 10,
          isExtended: false,
        },
      };
      const metrics = computeFontMetrics(shapesFont.content, 16);
      const topOriginShape = new ShxShape(new Point(8, 0), [[new Point(0, -12), new Point(8, -4)]]);
      const baselineShape = new ShxShape(new Point(8, 0), [[new Point(0, 2), new Point(8, 10)]]);

      expect(shapeEncodedWithTopOrigin(shapesFont, topOriginShape, metrics)).toBe(true);
      expect(shapeEncodedWithTopOrigin(shapesFont, baselineShape, metrics)).toBe(false);
      expect(shapeEncodedWithTopOrigin(bigfontData, baselineShape, metrics)).toBe(false);
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

    it('caches baseline-origin detection across layout calls', () => {
      const baselineShapeBytes = new Uint8Array([
        0x02, 0x08, 0x00, 0x02, 0x01, 0x80, 0x02, 0x00,
      ]);
      const unifontData: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: { 48: baselineShapeBytes, 65: baselineShapeBytes },
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 0,
          height: 10,
          width: 10,
          isExtended: false,
        },
      };
      const font = new ShxFont(unifontData);
      try {
        const layoutA = font.getLayoutCharShape(48, 16)!;
        const layoutB = font.getLayoutCharShape(65, 16)!;
        expect(layoutA.bbox.minY).toBeGreaterThan(0);
        expect(layoutB.bbox.minY).toBeCloseTo(layoutA.bbox.minY, 5);
      } finally {
        font.release();
      }
    });
  });

  describe('font helpers', () => {
    it('re-exports advance width and layout helpers from the font entry', () => {
      expect(DEFAULT_INK_WIDTH_CELL_FACTOR).toBeGreaterThan(0);
      expect(new InkWidthAdvanceStrategy()).toBeDefined();
      expect(new ShxNativeAdvanceStrategy()).toEqual(new NativeStrategyDirect());
      expect(typeof shapeEncodedWithTopOrigin).toBe('function');
    });

    it('reports whether a character code exists', () => {
      const font = new ShxFont(createBigFontData({ 1: new Uint8Array([0x00]) }));
      try {
        expect(font.hasChar(1)).toBe(true);
        expect(font.hasChar(99)).toBe(false);
      } finally {
        font.release();
      }
    });

    it('loads shapes by name', () => {
      const fontData = createBigFontData({
        5: new Uint8Array([0x01, 0x80, 0x02, 0x00]),
      });
      fontData.content.names = { TEST: 5 };
      const font = new ShxFont(fontData);
      try {
        expect(font.getShapeByName('TEST', 16)?.bbox.minX).toBe(0);
        expect(font.getShapeByName('missing', 16)).toBeUndefined();
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

  describe('detectBigfontBaselineInkPadding', () => {
    const sampleCodes = [
      0xcbc4, 0xb2e3, 0xc2a5, 0xc3e6, 0xd6d0, 0xb9fa, 0xd5e2, 0xb5c4, 0xcac2, 0xd2bb,
      0xc0b4, 0xc9fa, 0xb5c4, 0xd3d0, 0xced2, 0xcdea, 0xcbfb, 0xb2bb, 0xc8cb, 0xb5c4,
      0xd2bb, 0xc4ea, 0xc0b4, 0xcbfb, 0xcbad, 0xb5c4, 0xc3e6, 0xc7b0, 0xc3e6, 0xd6d0,
      0xc9cf, 0xc3c7, 0xcfc2, 0xb5c4, 0xb5bd, 0xc8a5, 0xcbb5, 0xb7a8, 0xb5c4, 0xcab1,
      0xc9fa, 0xb3c9, 0xb7bd, 0xd6f7, 0xbbfa, 0xc6f7, 0xb9ab, 0xbbfa, 0xcafd, 0xd6d8,
    ];

    it('returns 0 for non-bigfont, descender bigfont, and invalid height', () => {
      const unifont: ShxFontData = {
        header: { fontType: ShxFontType.UNIFONT, fileHeader: 'test', fileVersion: '1.0' },
        content: {
          data: {},
          info: '',
          orientation: 'horizontal',
          baseUp: 8,
          baseDown: 0,
          height: 8,
          width: 8,
          isExtended: false,
        },
      };
      const descenderBigfont = createBigFontData({ 0x1000: new Uint8Array([0x00]) });
      const invalidHeight = createExtendedBigFontData({ 0x1000: new Uint8Array([0x00]) });
      invalidHeight.content.height = 0;

      expect(detectBigfontBaselineInkPadding(unifont, () => undefined, 8)).toBe(0);
      expect(detectBigfontBaselineInkPadding(descenderBigfont, () => undefined, 8)).toBe(0);
      expect(detectBigfontBaselineInkPadding(invalidHeight, () => undefined, 8)).toBe(0);
    });

    it('returns 0 when too few body glyphs qualify', () => {
      const fontData = createExtendedBigFontData({
        0x1000: new Uint8Array([0x00]),
        0x1001: new Uint8Array([0x00]),
      });
      const getRawShape = (code: number) => {
        if (code === 0x1000) {
          return bodyGlyph(2);
        }
        if (code === 0x1001) {
          return bodyGlyph(10);
        }
        return undefined;
      };

      expect(detectBigfontBaselineInkPadding(fontData, getRawShape, 8)).toBe(0);
    });

    it('estimates median padding from sample codes and skips invalid glyphs', () => {
      const data = Object.fromEntries(sampleCodes.map(code => [code, new Uint8Array([0x00])]));
      const fontData = createExtendedBigFontData(data);
      const getRawShape = (code: number) => {
        if (code <= 0xff || !(code in fontData.content.data)) {
          return undefined;
        }
        if (code === sampleCodes[0]) {
          return undefined;
        }
        if (code === sampleCodes[1]) {
          return bodyGlyph(0);
        }
        if (code === sampleCodes[2]) {
          return bodyGlyph(4);
        }
        const index = sampleCodes.indexOf(code);
        return bodyGlyph(1 + (index % 3));
      };

      expect(detectBigfontBaselineInkPadding(fontData, getRawShape, 8)).toBe(2);
    });

    it('falls back to scanning font data when sample codes are missing', () => {
      const fallbackCodes = Array.from({ length: 8 }, (_, index) => 0x1100 + index);
      const data = Object.fromEntries(fallbackCodes.map(code => [code, new Uint8Array([0x00])]));
      const fontData = createExtendedBigFontData(data);
      const getRawShape = (code: number) => bodyGlyph(1 + (code % 3));

      expect(detectBigfontBaselineInkPadding(fontData, getRawShape, 8)).toBe(2);
    });

    it('averages the middle pair when the sample count is even', () => {
      const codes = [0x1201, 0x1202, 0x1203, 0x1204, 0x1205, 0x1206, 0x1207, 0x1208];
      const data = Object.fromEntries(codes.map(code => [code, new Uint8Array([0])]));
      const minYs = [1, 1, 1, 1, 3, 3, 3, 3];
      const fontData = createExtendedBigFontData(data);
      const getRawShape = (code: number) => {
        const index = codes.indexOf(code);
        return index >= 0 ? bodyGlyph(minYs[index]) : undefined;
      };

      expect(detectBigfontBaselineInkPadding(fontData, getRawShape, 8)).toBe(2);
    });

    it('deduplicates predefined sample codes while estimating padding', () => {
      const data = Object.fromEntries(sampleCodes.map(code => [code, new Uint8Array([0x00])]));
      const fontData = createExtendedBigFontData(data);
      let lookups = 0;
      const getRawShape = (code: number) => {
        lookups += 1;
        return bodyGlyph(2);
      };

      const padding = detectBigfontBaselineInkPadding(fontData, getRawShape, 8);
      expect(padding).toBe(2);
      expect(lookups).toBeGreaterThanOrEqual(8);
      expect(lookups).toBeLessThan(sampleCodes.length);
    });

    it('stops fallback scanning after reaching the maximum sample count', () => {
      const fallbackCodes = Array.from({ length: 60 }, (_, index) => 0x1300 + index);
      const data = Object.fromEntries(fallbackCodes.map(code => [code, new Uint8Array([0x00])]));
      const fontData = createExtendedBigFontData(data);
      let lookups = 0;
      const getRawShape = (code: number) => {
        lookups += 1;
        return bodyGlyph(2);
      };

      detectBigfontBaselineInkPadding(fontData, getRawShape, 8);
      expect(lookups).toBe(48);
    });
  });

  describe('getLayoutCharShape bigfont baseline padding', () => {
    it('shifts extended bigfont glyphs down and caches padding detection', () => {
      const fontData = createExtendedBigFontData({
        0x2000: new Uint8Array([0x02, 0x08, 0x00, 0x02, 0x01, 0x80, 0x02, 0x00]),
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, index) => [
            0x2100 + index,
            new Uint8Array([0x02, 0x08, 0x00, 0x02, 0x01, 0x80, 0x02, 0x00]),
          ])
        ),
      });
      const font = new ShxFont(fontData);
      try {
        const size = 16;
        const raw = font.getCharShape(0x2000, size)!;
        const layout = font.getLayoutCharShape(0x2000, size)!;
        const layoutAgain = font.getLayoutCharShape(0x2000, size)!;

        expect(layout.bbox.minY).toBeLessThan(raw.bbox.minY);
        expect(layoutAgain.bbox.minY).toBeCloseTo(layout.bbox.minY, 5);
      } finally {
        font.release();
      }
    });

    it('returns undefined for shape names when no name tables exist', () => {
      const font = new ShxFont(createBigFontData({ 1: new Uint8Array([0x01, 0x80, 0x02, 0x00]) }));
      try {
        expect(font.getShapeName(1)).toBeUndefined();
      } finally {
        font.release();
      }
    });
  });
});
