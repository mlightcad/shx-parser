import { ShxFont } from '../font';
import { ShxFontData, ShxFontType } from '../fontData';

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
  describe('getCharShape bigfont alignment', () => {
    // Horizontal line along the baseline: pen down, draw 8 units east, pen up, end.
    const baselineShape = new Uint8Array([0x01, 0x80, 0x02, 0x00]);
    // Horizontal line near the top of the cell: move to (0, 7), pen down, draw east, pen up, end.
    const topAlignedShape = new Uint8Array([0x08, 0x00, 0x07, 0x01, 0x80, 0x02, 0x00]);

    const font = new ShxFont(
      createBigFontData({
        1: baselineShape,
        2: topAlignedShape,
      })
    );

    afterAll(() => {
      font.release();
    });

    it('normalizes baseline-aligned bigfont glyphs to the origin', () => {
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
  });
});
