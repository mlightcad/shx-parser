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

describe('gbcbig.shx vertical bigfont', () => {
  it('parses shape #0 metrics and renders glyphs within the font cell band', async () => {
    const font = await loadFont('gbcbig.shx');
    if (!font) return;

    try {
      const content = font.fontData.content;
      expect(content.baseUp).toBe(64);
      expect(content.baseDown).toBe(0);
      expect(content.height).toBe(64);
      expect(content.width).toBe(64);
      expect(content.orientation).toBe('vertical');
      expect(content.isExtended).toBe(true);
      expect(content.verticalDualMode).toBe(true);

      const size = 12;
      const metrics = font.getFontMetrics(size);
      expect(metrics.capHeight).toBeCloseTo(12);
      expect(metrics.descenderHeight).toBe(0);

      // Regression: misaligned frame parsing used to hang on bytes 0x0e/0x0d.
      font.getCharShape(53415, size);

      // "zhong" (中) reference glyph from gbcbig.shx
      const zhong = font.getLayoutCharShape(0xd6d0, size);
      expect(zhong).toBeDefined();

      for (const code of [0xd6d0, 45249, 42661, 41687, 53415]) {
        const shape = font.getLayoutCharShape(code, size)!;
        const scale = size / content.height;
        const minY = shape.bbox.minY / scale;
        const maxY = shape.bbox.maxY / scale;
        expect(minY).toBeGreaterThanOrEqual(-4);
        // Frame setup (pen-up y≈62) places ink above shape #0 height; zhong reaches y≈90.
        expect(maxY).toBeLessThanOrEqual(content.height + 30);
      }
    } finally {
      font.release();
    }
  }, 60_000);
});
