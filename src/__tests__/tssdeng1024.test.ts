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

describe('tssdeng digit spacing', () => {
  it('uses cell width advance for proportional unifont digits (AutoCAD model)', async () => {
    const tssdeng = await loadFont('tssdeng.shx');
    if (!tssdeng) return;

    try {
      const size = 30;
      const cellWidth = tssdeng.getFontMetrics(size).cellWidth;
      const placed = layoutTextRun(
        '1024'.split('').map(ch => ({
          font: tssdeng,
          code: ch.charCodeAt(0),
          size,
        }))
      );

      expect(placed).toHaveLength(4);
      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i].shape.bbox.minX - placed[i - 1].shape.bbox.maxX;
        expect(gap).toBeGreaterThanOrEqual(0);
      }

      for (const ch of '1024') {
        const layout = tssdeng.getLayoutCharShape(ch.charCodeAt(0), size)!;
        const advance = resolveAdvanceWidth(layout, tssdeng.fontData, size);
        expect(advance).toBeCloseTo(cellWidth);
      }
    } finally {
      tssdeng.release();
    }
  }, 60_000);
});
