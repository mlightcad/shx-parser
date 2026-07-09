import { ShxFont } from '../font';
import { alignShxGlyphForLayout } from '../glyphLayout';

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

describe('hztxt 一 alignment', () => {
  it('preserves encoded vertical positions for bigfont body glyphs', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const code = 0xd2bb; // GBK 一
      const raw = hztxt.getCharShape(code, size)!;
      const aligned = alignShxGlyphForLayout(raw, hztxt.fontData, size);
      const layout = hztxt.getLayoutCharShape(code, size)!;

      expect(aligned.bbox.minY).toBeCloseTo(raw.bbox.minY, 0);
      expect(aligned.bbox.maxY).toBeCloseTo(raw.bbox.maxY, 0);

      const shift = raw.bbox.minY - layout.bbox.minY;
      expect(shift).toBeGreaterThan(0);
      expect(layout.bbox.minY).toBeGreaterThanOrEqual(0);
      expect(layout.bbox.maxY).toBeCloseTo(raw.bbox.maxY - shift, 0);
    } finally {
      hztxt.release();
    }
  }, 60_000);
});
