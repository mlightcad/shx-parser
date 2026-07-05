import { ShxFont, alignShxGlyphForLayout, computeFontMetrics } from '../font';
import { resolveAdvanceWidth, layoutTextRun } from '../textLayout';

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

describe('glyph layout alignment', () => {
  it('preserves full cell advance for hztxt baseline comma after alignment', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const raw = hztxt.getCharShape(0xa3ac, size)!;
      const aligned = alignShxGlyphForLayout(raw, hztxt.fontData, size);
      const metrics = computeFontMetrics(hztxt.fontData.content, size);

      expect(resolveAdvanceWidth(aligned, hztxt.fontData, size)).toBeCloseTo(metrics.cellWidth, 0);
      expect(aligned.lastPoint!.x).toBeCloseTo(raw.lastPoint!.x, 1);
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('leaves enough ink gap between hztxt comma and G', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const placed = layoutTextRun([
        { font: hztxt, code: 0xa3ac, size },
        { font: hztxt, code: 0xa3c7, size },
      ]);
      const gap = placed[1].shape.bbox.minX - placed[0].shape.bbox.maxX;
      expect(gap).toBeGreaterThan(size * 0.3);
    } finally {
      hztxt.release();
    }
  }, 60_000);
});
