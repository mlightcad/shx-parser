import { ShxFont } from '../font';
import { alignShxGlyphForLayout, computeFontMetrics } from '../glyphLayout';
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

  it('aligns txt x-height lowercase letters on the layout baseline', async () => {
    const txt = await loadFont('txt.shx');
    if (!txt) return;

    try {
      const size = 16;
      for (const char of ['a', 'e', 'o', 'x', ':']) {
        const layoutShape = txt.getLayoutCharShape(char.charCodeAt(0), size)!;
        expect(layoutShape.bbox.minY).toBeCloseTo(0, 0);
      }

      const letterT = txt.getLayoutCharShape('t'.charCodeAt(0), size)!;
      const letterN = txt.getLayoutCharShape('n'.charCodeAt(0), size)!;
      expect(letterT.bbox.minY).toBeCloseTo(0, 0);
      expect(letterN.bbox.minY).toBeCloseTo(0, 0);
    } finally {
      txt.release();
    }
  }, 60_000);

  it('does not overlap successive txt lowercase l glyphs in Hello', async () => {
    const txt = await loadFont('txt.shx');
    if (!txt) return;

    try {
      const size = 16;
      const code = 'l'.charCodeAt(0);
      const placed = layoutTextRun([
        { font: txt, code, size },
        { font: txt, code, size },
      ]);
      const gap = placed[1].shape.bbox.minX - placed[0].shape.bbox.maxX;
      const cellWidth = txt.getFontMetrics(size).cellWidth;
      expect(resolveAdvanceWidth(placed[0].shape, txt.fontData, size)).toBeCloseTo(cellWidth);
      expect(gap).toBeGreaterThanOrEqual(size * 0.3);
    } finally {
      txt.release();
    }
  }, 60_000);

  it('uses full cell advance and non-negative ink origin for aehalf punctuation', async () => {
    const aehalf = await loadFont('aehalf.shx');
    if (!aehalf) return;

    try {
      const size = 30;
      const cellWidth = aehalf.getFontMetrics(size).cellWidth;
      const placed = layoutTextRun([
        { font: aehalf, code: 't'.charCodeAt(0), size },
        { font: aehalf, code: 34, size },
        { font: aehalf, code: 50, size },
        { font: aehalf, code: 48, size },
        { font: aehalf, code: 126, size },
        { font: aehalf, code: 50, size },
      ]);

      expect(placed).toHaveLength(6);
      for (const code of [34, 126]) {
        const idx = code === 34 ? 1 : 4;
        const layoutShape = aehalf.getLayoutCharShape(code, size)!;
        expect(resolveAdvanceWidth(layoutShape, aehalf.fontData, size)).toBeCloseTo(cellWidth);
        expect(placed[idx].shape.bbox.minX).toBeGreaterThanOrEqual(placed[idx].x);
      }

      const quoteToTwo = placed[2].shape.bbox.minX - placed[1].shape.bbox.maxX;
      const zeroToTilde = placed[4].shape.bbox.minX - placed[3].shape.bbox.maxX;
      const tildeToTwo = placed[5].shape.bbox.minX - placed[4].shape.bbox.maxX;
      expect(quoteToTwo).toBeGreaterThan(size * 0.3);
      expect(zeroToTilde).toBeGreaterThan(size * 0.3);
      expect(tildeToTwo).toBeGreaterThan(size * 0.3);
    } finally {
      aehalf.release();
    }
  }, 60_000);

  it('maps aehalf glyphs from cell coordinates using font metrics', async () => {
    const aehalf = await loadFont('aehalf.shx');
    if (!aehalf) return;

    try {
      const size = 30;
      const metrics = aehalf.getFontMetrics(size);

      const letterA = aehalf.getLayoutCharShape(65, size)!;
      expect(letterA.bbox.minY).toBeCloseTo(0, 0);
      expect(letterA.bbox.maxY).toBeCloseTo(metrics.capHeight, 0);
      expect(letterA.lastPoint?.x).toBeCloseTo(metrics.cellWidth);

      const quote = aehalf.getLayoutCharShape(34, size)!;
      expect(quote.bbox.minY).toBeGreaterThan(metrics.capHeight * 0.5);
      expect(quote.bbox.maxY).toBeLessThanOrEqual(metrics.capHeight + 1);

      const asterisk = aehalf.getLayoutCharShape(42, size)!;
      const centerY = (asterisk.bbox.minY + asterisk.bbox.maxY) / 2;
      expect(asterisk.bbox.minY).toBeGreaterThan(0);
      expect(centerY).toBeGreaterThan(metrics.capHeight * 0.3);
      expect(centerY).toBeLessThan(metrics.capHeight * 0.7);

      for (const code of [59, 58, 40, 41, 44, 46]) {
        const shape = aehalf.getLayoutCharShape(code, size)!;
        expect(resolveAdvanceWidth(shape, aehalf.fontData, size)).toBeCloseTo(metrics.cellWidth);
      }
    } finally {
      aehalf.release();
    }
  }, 60_000);
});
