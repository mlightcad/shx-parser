import { computeFontMetrics, ShxFont } from '../font';
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

function makeShape(lastX: number, minX = 0, maxX = lastX, lastPoint?: Point): ShxShape {
  return new ShxShape(lastPoint ?? new Point(lastX, 0), [
    [new Point(minX, 0), new Point(maxX, 0)],
  ]);
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
    it('returns pen advance for narrow glyphs', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const shape = makeShape(4, 0, 2);
      expect(resolveAdvanceWidth(shape, fontData, size)).toBe(4);
    });

    it('uses full cell width for bigfont glyphs', () => {
      const fontData = makeFontData(ShxFontType.BIGFONT);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = makeShape(cellWidth, 0, cellWidth * 0.8);
      expect(resolveAdvanceWidth(shape, fontData, size)).toBeCloseTo(cellWidth);
    });

    it('extends advance when unifont ink exceeds pen vector', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const cellWidth = computeFontMetrics(fontData.content, size).cellWidth;
      const shape = makeShape(4, 0, cellWidth * 0.8);
      expect(resolveAdvanceWidth(shape, fontData, size)).toBeCloseTo(cellWidth);
    });

    it('uses ink extent for narrow unifont glyphs', () => {
      const fontData = makeFontData(ShxFontType.UNIFONT);
      const size = 16;
      const shape = makeShape(2, 0, 3);
      expect(resolveAdvanceWidth(shape, fontData, size)).toBe(2);
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
