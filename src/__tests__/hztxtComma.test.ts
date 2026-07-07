import { ShxFont } from '../font';
import { getAdvanceWidth, layoutTextRun, resolveAdvanceWidth } from '../textLayout';

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/';

async function loadFont(name: string): Promise<ShxFont | null> {
  try {
    const response = await fetch(FONT_BASE + name);
    if (!response.ok) return null;
    return new ShxFont(await response.arrayBuffer());
  } catch {
    return null;
  }
}

describe('punctuation spacing (raw geometry + layout)', () => {
  it('returns hztxt halfwidth comma without baseline Y normalization', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const parser = (hztxt as unknown as {
        shapeParser: { getCharShape(c: number, s: number): import('../shape').ShxShape };
      }).shapeParser;
      const raw = parser.getCharShape(0xa3a4, size);
      const fromFont = hztxt.getCharShape(0xa3a4, size)!;

      expect(fromFont.bbox.minY).toBeCloseTo(raw.bbox.minY, 5);
      expect(fromFont.bbox.minX).toBeCloseTo(raw.bbox.minX, 5);
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('reports tssdeng comma advance from the SHX advance vector', async () => {
    const tssdeng = await loadFont('tssdeng.shx');
    if (!tssdeng) return;

    try {
      const size = 16;
      const comma = tssdeng.getCharShape(0x2c, size)!;

      expect(comma.lastPoint).toBeDefined();
      expect(getAdvanceWidth(comma)).toBe(comma.lastPoint!.x);
      expect(comma.bbox.maxX).toBeGreaterThan(comma.lastPoint!.x);
    } finally {
      tssdeng.release();
    }
  }, 60_000);

  it('uses SHX pen advance for hztxt halfwidth glyphs', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const comma = hztxt.getCharShape(0xa3ac, size)!;
      const letterG = hztxt.getCharShape(0xa3c7, size)!;
      const ideoComma = hztxt.getCharShape(0xa1a2, size)!;
      const period = hztxt.getCharShape(0xa1a3, size)!;

      for (const shape of [comma, letterG]) {
        expect(resolveAdvanceWidth(shape, hztxt.fontData, size)).toBeCloseTo(
          getAdvanceWidth(shape)
        );
      }
      for (const shape of [ideoComma, period]) {
        expect(getAdvanceWidth(shape)).toBeCloseTo(size, 0);
      }
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('lays out hztxt punctuation without overlapping', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      // GBK codes for ",G" and "、0" and "1。" substrings from mixed mtext runs
      const placed = layoutTextRun([
        { font: hztxt, code: 0xa3ac, size },
        { font: hztxt, code: 0xa3c7, size },
        { font: hztxt, code: 0xa1a2, size },
        { font: hztxt, code: 0xa3b0, size },
        { font: hztxt, code: 0xa3b1, size },
        { font: hztxt, code: 0xa1a3, size },
      ]);

      expect(placed).toHaveLength(6);
      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i].shape.bbox.minX - placed[i - 1].shape.bbox.maxX;
        expect(gap).toBeGreaterThanOrEqual(0);
      }
    } finally {
      hztxt.release();
    }
  }, 60_000);
});
