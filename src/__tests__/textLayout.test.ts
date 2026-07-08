import { ShxFont } from '../font';
import {
  DEFAULT_INK_WIDTH_CELL_FACTOR,
  InkWidthAdvanceStrategy,
  ShxNativeAdvanceStrategy,
} from '../advanceWidthStrategy';
import { computeFontMetrics } from '../glyphLayout';
import { ShxFontData, ShxFontType } from '../fontData';
import { Point } from '../point';
import { ShxShape } from '../shape';
import { getAdvanceWidth, layoutTextRun, placeGlyphOnBaseline, resolveAdvanceWidth } from '../textLayout';

function makeFontData(fontType: ShxFontType): ShxFontData {
  return {
    header: { fontType, fileHeader: 'test', fileVersion: '1.0' },
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
}

function makeShape(
  lastX: number,
  minX = 0,
  maxX = lastX,
  lastPoint?: Point,
  hasExplicitAdvance = false
): ShxShape {
  return new ShxShape(lastPoint ?? new Point(lastX, 0), [
    [new Point(minX, 0), new Point(maxX, 0)],
  ], hasExplicitAdvance || lastX !== 0);
}

function makeMockFont(getShape: () => ShxShape | undefined): ShxFont {
  const fontData = {
    header: { fontType: ShxFontType.SHAPES, fileHeader: 'test', fileVersion: '1.0' },
    content: {
      data: {},
      info: '',
      orientation: 'horizontal' as const,
      baseUp: 8,
      baseDown: 2,
      height: 10,
      width: 10,
      isExtended: false,
    },
  };
  return {
    fontData,
    getCharShape: jest.fn(getShape),
    getLayoutCharShape: jest.fn(getShape),
  } as unknown as ShxFont;
}

describe('textLayout', () => {
  describe('resolveAdvanceWidth', () => {
    const native = new ShxNativeAdvanceStrategy();

    it('returns explicit advance for layout-ready unifont glyphs', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const shape = makeShape(4, 0, 2);
      expect(resolveAdvanceWidth(shape, fontData, size)).toBe(4);
    });

    it('falls back to full cell for compact unifonts without defined advance', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 8;
      fontData.content.height = 8;
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(undefined, [[new Point(0, 0), new Point(2, 0)]]);
      expect(resolveAdvanceWidth(shape, fontData, size, native)).toBe(cellWidth);
    });

    it('falls back to full cell for compact unifonts with zero ink', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 8;
      fontData.content.height = 8;
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(undefined, []);
      expect(resolveAdvanceWidth(shape, fontData, size, native)).toBeCloseTo(cellWidth);
    });

    it('falls back to full cell for aehalf without defined advance', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 8;
      fontData.content.height = 8;
      fontData.content.data[65] = new Uint8Array([3, 17, 2, 0]);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(undefined, []);
      expect(resolveAdvanceWidth(shape, fontData, size, native)).toBeCloseTo(cellWidth);
    });

    it('falls back to cell width for proportional unifonts without defined advance', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 33;
      fontData.content.height = 33;
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(undefined, [[new Point(0, 0), new Point(2, 0)]]);
      expect(resolveAdvanceWidth(shape, fontData, size, native)).toBe(cellWidth);
    });

    it('uses full cell width for bigfont glyphs', () => {
      const fontData = makeFontData(ShxFontType.BIGFONT);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = makeShape(cellWidth, 0, cellWidth * 0.8);
      expect(resolveAdvanceWidth(shape, fontData, size, native)).toBeCloseTo(cellWidth);
    });

    it('preserves explicit advance for proportional unifonts', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 33;
      fontData.content.height = 33;
      const size = 16;
      const smallSymbol = new ShxShape(
        new Point(0.714, 0),
        [[new Point(0, 4), new Point(0.714, 4.714)]],
        true
      );
      expect(resolveAdvanceWidth(smallSymbol, fontData, size)).toBeCloseTo(0.714);
    });

    it('falls back to cell width when pen-down endpoint is non-zero', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 8;
      fontData.content.height = 8;
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(new Point(2, 0), [[new Point(-1, -4), new Point(1, 0)]]);
      expect(resolveAdvanceWidth(shape, fontData, size, native)).toBeCloseTo(cellWidth);
    });

    it('uses explicit zero advance for advance-only glyphs', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      fontData.content.width = 8;
      fontData.content.height = 8;
      const size = 16;
      const shape = new ShxShape(new Point(0, 0), [], true);
      expect(resolveAdvanceWidth(shape, fontData, size)).toBe(0);
    });

    it('uses right ink edge plus cell fraction for InkWidth strategy', () => {
      const fontData = makeFontData(ShxFontType.SHAPES);
      fontData.content.width = 10;
      fontData.content.height = 10;
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const factor = 0.15;
      const shape = new ShxShape(undefined, [[new Point(0, 0), new Point(cellWidth * 0.6, 0)]]);
      const strategy = new InkWidthAdvanceStrategy(factor);

      expect(resolveAdvanceWidth(shape, fontData, size, strategy)).toBeCloseTo(
        shape.bbox.maxX + cellWidth * factor
      );
    });

    it('includes left offset when advancing left-origin punctuation', () => {
      const fontData = makeFontData(ShxFontType.SHAPES);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(undefined, [
        [new Point(4, 0), new Point(6, 0)],
      ]);
      const letter = new ShxShape(undefined, [
        [new Point(0, 0), new Point(8, 0)],
      ]);

      const advance = resolveAdvanceWidth(shape, fontData, size);
      const gap = advance + letter.bbox.minX - shape.bbox.maxX;

      expect(advance).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(shape, cellWidth)
      );
      expect(advance).toBeCloseTo(shape.bbox.maxX + cellWidth * DEFAULT_INK_WIDTH_CELL_FACTOR);
      expect(gap).toBeCloseTo(cellWidth * DEFAULT_INK_WIDTH_CELL_FACTOR);
    });

    it('preserves explicit zero advance under InkWidth strategy', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const shape = new ShxShape(new Point(0, 0), [[new Point(0, 0), new Point(5, 0)]], true);

      expect(resolveAdvanceWidth(shape, fontData, size, new InkWidthAdvanceStrategy())).toBe(0);
    });

    it('defaults InkWidth cell factor to DEFAULT_INK_WIDTH_CELL_FACTOR', () => {
      const fontData = makeFontData(ShxFontType.SHAPES);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = new ShxShape(undefined, [[new Point(0, 0), new Point(4, 0)]]);

      expect(resolveAdvanceWidth(shape, fontData, size, new InkWidthAdvanceStrategy())).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(shape, cellWidth)
      );
    });

    it('advances center-origin glyphs to the right cell edge plus padding', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const comma = new ShxShape(undefined, [
        [new Point(-1, 0), new Point(1, 0)],
      ]);

      expect(resolveAdvanceWidth(comma, fontData, size)).toBeCloseTo(
        cellWidth / 2 + cellWidth * DEFAULT_INK_WIDTH_CELL_FACTOR
      );
    });

    it('does not let center-origin punctuation overlap a following letter', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const comma = new ShxShape(undefined, [
        [new Point(-1.1, 0), new Point(1.1, 0)],
      ]);
      const letterB = new ShxShape(undefined, [
        [new Point(-5.96, 0), new Point(6.62, 0)],
      ]);

      const commaAdvance = resolveAdvanceWidth(comma, fontData, size);
      const gap = commaAdvance + letterB.bbox.minX - comma.bbox.maxX;
      expect(gap).toBeGreaterThan(0);
      expect(commaAdvance).toBeCloseTo(
        InkWidthAdvanceStrategy.computeAdvance(comma, cellWidth)
      );
    });
  });

  describe('getAdvanceWidth', () => {
    it('uses lastPoint.x when present', () => {
      expect(getAdvanceWidth(makeShape(10, 0, 12))).toBe(10);
    });

    it('falls back to bbox width when lastPoint is absent', () => {
      const shape = new ShxShape(undefined, [[new Point(0, 0), new Point(10, 0)]]);
      expect(getAdvanceWidth(shape)).toBe(10);
    });
  });

  describe('placeGlyphOnBaseline', () => {
    it('translates the glyph without changing relative geometry', () => {
      const shape = new ShxShape(new Point(8, 0), [
        [new Point(0, 0), new Point(8, 0)],
        [new Point(2, 3), new Point(4, 5)],
      ]);
      const placed = placeGlyphOnBaseline(shape, 10, 20);

      expect(placed.bbox.minX).toBeCloseTo(10);
      expect(placed.bbox.minY).toBeCloseTo(20);
      expect(placed.bbox.maxX - placed.bbox.minX).toBeCloseTo(8);
    });
  });

  describe('layoutTextRun', () => {
    it('places glyphs horizontally using advance widths', () => {
      const fontA = makeMockFont(() => makeShape(5, 0, 5));
      const fontB = makeMockFont(() => makeShape(7, 0, 7));

      const placed = layoutTextRun([
        { font: fontA, code: 65, size: 16 },
        { font: fontB, code: 66, size: 16 },
      ]);

      expect(placed).toHaveLength(2);
      expect(placed[0].x).toBe(0);
      expect(placed[1].x).toBe(5);
      expect(placed[0].shape.bbox.minX).toBe(0);
      expect(placed[1].shape.bbox.minX).toBe(5);
    });

    it('skips missing glyphs', () => {
      const font = makeMockFont(() => undefined);

      expect(layoutTextRun([{ font, code: 65, size: 16 }])).toEqual([]);
    });
  });
});
