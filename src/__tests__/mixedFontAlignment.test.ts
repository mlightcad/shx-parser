import { ShxFont } from '../font';
import { layoutTextRun, resolveAdvanceWidth } from '../textLayout';

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

function getShapeParser(font: ShxFont) {
  return (font as unknown as {
    shapeParser: { getCharShape(c: number, s: number): import('../shape').ShxShape };
  }).shapeParser;
}

describe('font metrics and text layout', () => {
  it('getCharShape returns the same geometry as shapeParser (no alignment pass)', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const parser = getShapeParser(hztxt);
      for (const code of [0xb1df, 0xa1b0, 0xa1a2, 0xa3a4]) {
        const raw = parser.getCharShape(code, size);
        const fromFont = hztxt.getCharShape(code, size)!;
        expect(fromFont.bbox.minX).toBeCloseTo(raw.bbox.minX, 5);
        expect(fromFont.bbox.minY).toBeCloseTo(raw.bbox.minY, 5);
        expect(fromFont.bbox.maxX).toBeCloseTo(raw.bbox.maxX, 5);
        expect(fromFont.bbox.maxY).toBeCloseTo(raw.bbox.maxY, 5);
      }
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('exposes scaled font metrics from shape #0 for mixed-font rendering', async () => {
    const tssdeng = await loadFont('tssdeng.shx');
    const hztxt = await loadFont('hztxt.shx');
    if (!tssdeng || !hztxt) return;

    try {
      const size = 16;
      const tMetrics = tssdeng.getFontMetrics(size);
      const hMetrics = hztxt.getFontMetrics(size);

      expect(tMetrics.capHeight).toBeGreaterThan(0);
      expect(hMetrics.capHeight).toBeCloseTo(size, 1);
      expect(hMetrics.descenderHeight).toBe(0);
      expect(hztxt.getFontMetrics(size).capHeight).toBe(hMetrics.capHeight);
    } finally {
      tssdeng.release();
      hztxt.release();
    }
  }, 60_000);

  it('layoutTextRun aligns mixed-font glyphs on a shared baseline', async () => {
    const tssdeng = await loadFont('tssdeng.shx');
    const hztxt = await loadFont('hztxt.shx');
    if (!tssdeng || !hztxt) return;

    try {
      const size = 16;
      const digitLayout = tssdeng.getLayoutCharShape(56, size)!;
      const hanLayout = hztxt.getLayoutCharShape(0xb1df, size)!;

      const placed = layoutTextRun([
        { font: tssdeng, code: 56, size },
        { font: hztxt, code: 0xb1df, size },
      ]);

      expect(placed).toHaveLength(2);
      expect(placed[0].shape.bbox.minY).toBeCloseTo(digitLayout.bbox.minY, 5);
      expect(placed[1].shape.bbox.minY).toBeCloseTo(hanLayout.bbox.minY, 5);
      expect(placed[1].x).toBeCloseTo(
        resolveAdvanceWidth(digitLayout, tssdeng.fontData, size),
        5
      );
    } finally {
      tssdeng.release();
      hztxt.release();
    }
  }, 60_000);

  it('preserves encoded vertical positions for hztxt punctuation types', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      // GBK: U+201C/U+201D — top quotation marks sit above mid-cell
      for (const code of [0xa1b0, 0xa1b1]) {
        const shape = hztxt.getCharShape(code, size)!;
        expect(shape.bbox.maxY).toBeLessThan(size);
        expect(shape.bbox.minY).toBeGreaterThan(0);
      }
      // GBK: U+3001/U+3002 — baseline punctuation
      for (const code of [0xa1a2, 0xa1a3]) {
        const shape = hztxt.getCharShape(code, size)!;
        expect(shape.bbox.maxY).toBeLessThan(size * 0.5);
      }
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('does not invert isocp uppercase letters that extend above y=0', async () => {
    const isocp = await loadFont('isocp.shx');
    if (!isocp) return;

    try {
      const size = 16;
      const letterA = isocp.getCharShape(65, size)!;
      expect(letterA.bbox.maxY).toBeGreaterThan(0);
    } finally {
      isocp.release();
    }
  }, 60_000);

  it('preserves relative vertical positions within unifont families', async () => {
    const aehalf = await loadFont('aehalf.shx');
    if (!aehalf) return;

    try {
      const size = 16;
      const tilde = aehalf.getCharShape(126, size)!;
      const digit = aehalf.getCharShape(50, size)!;

      expect(tilde.bbox.minY).toBeGreaterThan(digit.bbox.minY);
      expect(tilde.bbox.maxY).toBeLessThan(digit.bbox.maxY);
    } finally {
      aehalf.release();
    }
  }, 60_000);
});
