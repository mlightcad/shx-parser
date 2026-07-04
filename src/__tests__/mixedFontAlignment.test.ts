import { ShxFont } from '../font';

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

describe('mixed bigfont + unifont vertical alignment', () => {
  it('aligns tssdeng digits with hztxt hanzi on a shared bottom edge at minY=0', async () => {
    const tssdeng = await loadFont('tssdeng.shx');
    const hztxt = await loadFont('hztxt.shx');
    if (!tssdeng || !hztxt) return;

    try {
      const size = 16;
      const digit = tssdeng.getCharShape(56, size)!;
      const han = hztxt.getCharShape(0xb1df, size)!;

      expect(digit.bbox.minY).toBeCloseTo(0, 5);
      expect(han.bbox.minY).toBeCloseTo(0, 5);
      expect(digit.bbox.maxY).toBeGreaterThan(0);
      expect(han.bbox.maxY).toBeGreaterThan(0);
    } finally {
      tssdeng.release();
      hztxt.release();
    }
  }, 60_000);

  it('does not invert isocp uppercase letters that already extend above y=0', async () => {
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

  it('bigfont normalizeToOrigin still shifts body glyphs up to minY=0', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const parser = (hztxt as unknown as {
        shapeParser: { getCharShape(c: number, s: number): import('../shape').ShxShape };
      }).shapeParser;
      const raw = parser.getCharShape(0xb1df, 16);
      const final = hztxt.getCharShape(0xb1df, 16)!;

      expect(final.bbox.minY).toBe(0);
      expect(raw.bbox.minY).toBeGreaterThan(0);
    } finally {
      hztxt.release();
    }
  }, 60_000);
});
