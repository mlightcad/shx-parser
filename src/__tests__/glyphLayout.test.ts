import { ShxFont } from '../font';
import { alignShxGlyphForLayout } from '../glyphLayout';
import { getAdvanceWidth, resolveAdvanceWidth, layoutTextRun } from '../textLayout';

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
  it('uses SHX pen advance for hztxt halfwidth comma after alignment', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const raw = hztxt.getCharShape(0xa3ac, size)!;
      const aligned = alignShxGlyphForLayout(raw, hztxt.fontData, size);

      expect(resolveAdvanceWidth(aligned, hztxt.fontData, size)).toBeCloseTo(
        getAdvanceWidth(raw),
        0
      );
      expect(aligned.bbox.minX).toBeCloseTo(raw.bbox.minX, 0);
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('does not overlap hztxt halfwidth comma and G', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const placed = layoutTextRun([
        { font: hztxt, code: 0xa3ac, size },
        { font: hztxt, code: 0xa3c7, size },
      ]);
      const gap = placed[1].shape.bbox.minX - placed[0].shape.bbox.maxX;
      expect(gap).toBeGreaterThanOrEqual(0);
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('shifts txt lowercase letters by capHeight from shape #0 metrics', async () => {
    const txt = await loadFont('txt.shx');
    if (!txt) return;

    try {
      const size = 16;
      const metrics = txt.getFontMetrics(size);
      for (const char of ['a', 'e', 'o', 'x', ':', 't', 'n']) {
        const raw = txt.getCharShape(char.charCodeAt(0), size)!;
        const layoutShape = txt.getLayoutCharShape(char.charCodeAt(0), size)!;
        expect(layoutShape.bbox.minY).toBeCloseTo(raw.bbox.minY + metrics.capHeight, 0);
      }
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
      const letterL = txt.getLayoutCharShape(code, size)!;
      expect(resolveAdvanceWidth(letterL, txt.fontData, size)).toBeCloseTo(
        txt.getFontMetrics(size).cellWidth
      );
      expect(gap).toBeGreaterThanOrEqual(0);
    } finally {
      txt.release();
    }
  }, 60_000);

  it('does not mark txt cap letters as having explicit advance when path closes at origin', async () => {
    const txt = await loadFont('txt.shx');
    if (!txt) return;

    try {
      const size = 16;
      for (const ch of 'AaGW.') {
        const raw = txt.getCharShape(ch.charCodeAt(0), size)!;
        expect(raw.hasExplicitAdvance).toBe(false);
      }
      const comma = txt.getCharShape(','.charCodeAt(0), size)!;
      expect(comma.lastPoint!.x).toBeGreaterThan(0);
      expect(comma.hasExplicitAdvance).toBe(false);
    } finally {
      txt.release();
    }
  }, 60_000);

  it('uses metrics cell width and capHeight for txt compact unifont layout', async () => {
    const txt = await loadFont('txt.shx');
    if (!txt) return;

    try {
      const size = 16;
      const metrics = txt.getFontMetrics(size);

      const hyphen = txt.getLayoutCharShape('-'.charCodeAt(0), size)!;
      expect(hyphen.bbox.minY).toBeCloseTo(metrics.capHeight, 0);
      expect(hyphen.bbox.maxY).toBeCloseTo(metrics.capHeight, 0);
      expect(resolveAdvanceWidth(hyphen, txt.fontData, size)).toBeCloseTo(metrics.cellWidth);

      const comma = txt.getLayoutCharShape(','.charCodeAt(0), size)!;
      const rawComma = txt.getCharShape(','.charCodeAt(0), size)!;
      expect(comma.bbox.minY).toBeCloseTo(rawComma.bbox.minY + metrics.capHeight, 0);
      expect(rawComma.lastPoint!.x).toBeGreaterThan(0);
      expect(rawComma.hasExplicitAdvance).toBe(false);
      expect(resolveAdvanceWidth(comma, txt.fontData, size)).toBeCloseTo(metrics.cellWidth);
    } finally {
      txt.release();
    }
  }, 60_000);

  it('lays out txt comma and G without overlapping', async () => {
    const txt = await loadFont('txt.shx');
    if (!txt) return;

    try {
      const size = 16;
      const placed = layoutTextRun([
        { font: txt, code: ','.charCodeAt(0), size },
        { font: txt, code: 'G'.charCodeAt(0), size },
      ]);
      expect(placed).toHaveLength(2);
      const gap = placed[1].shape.bbox.minX - placed[0].shape.bbox.maxX;
      expect(gap).toBeGreaterThanOrEqual(0);
    } finally {
      txt.release();
    }
  }, 60_000);

  it('uses SHX pen advance for hztxt halfwidth punctuation', async () => {
    const hztxt = await loadFont('hztxt.shx');
    if (!hztxt) return;

    try {
      const size = 16;
      const placed = layoutTextRun([
        { font: hztxt, code: 0xa3a2, size },
        { font: hztxt, code: 0xa3b2, size },
        { font: hztxt, code: 0xa3b0, size },
        { font: hztxt, code: 0xa3ae, size },
        { font: hztxt, code: 0xa3b2, size },
      ]);

      expect(placed).toHaveLength(5);
      for (const code of [0xa3a2, 0xa3ae]) {
        const idx = code === 0xa3a2 ? 0 : 3;
        const raw = hztxt.getCharShape(code, size)!;
        const layoutShape = hztxt.getLayoutCharShape(code, size)!;
        expect(resolveAdvanceWidth(layoutShape, hztxt.fontData, size)).toBeCloseTo(
          getAdvanceWidth(raw),
          0
        );
        expect(placed[idx].shape.bbox.minX).toBeCloseTo(placed[idx].x + raw.bbox.minX, 0);
      }
    } finally {
      hztxt.release();
    }
  }, 60_000);

  it('uses cell width advance for aehalf punctuation', async () => {
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
        const layoutShape = aehalf.getLayoutCharShape(code, size)!;
        expect(resolveAdvanceWidth(layoutShape, aehalf.fontData, size)).toBeCloseTo(cellWidth);
      }

      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i].shape.bbox.minX - placed[i - 1].shape.bbox.maxX;
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThan(cellWidth);
      }
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
      const rawQuote = aehalf.getCharShape(34, size)!;
      expect(quote.bbox.minY).toBeCloseTo(rawQuote.bbox.minY + metrics.capHeight, 0);

      for (const code of [59, 58, 40, 41, 44, 46]) {
        const shape = aehalf.getLayoutCharShape(code, size)!;
        expect(resolveAdvanceWidth(shape, aehalf.fontData, size)).toBeCloseTo(
          metrics.cellWidth
        );
      }

      for (const ch of 'gjpq') {
        const layoutShape = aehalf.getLayoutCharShape(ch.charCodeAt(0), size)!;
        expect(layoutShape.bbox.minY).toBeCloseTo(0, 0);
      }

      const placed = layoutTextRun([
        { font: aehalf, code: 'M'.charCodeAt(0), size },
        { font: aehalf, code: 'm'.charCodeAt(0), size },
        { font: aehalf, code: '&'.charCodeAt(0), size },
      ]);
      for (let i = 1; i < placed.length; i++) {
        const gap = placed[i].shape.bbox.minX - placed[i - 1].shape.bbox.maxX;
        expect(gap).toBeGreaterThan(0);
      }
    } finally {
      aehalf.release();
    }
  }, 60_000);

  it('applies per-font metrics when laying out mixed isocp and hztxt text', async () => {
    const isocp = await loadFont('isocp.shx');
    const hztxt = await loadFont('hztxt.shx');
    if (!isocp || !hztxt) return;

    try {
      const size = 7.5;
      const isocpMetrics = isocp.getFontMetrics(size);
      const digitLayout = isocp.getLayoutCharShape('1'.charCodeAt(0), size)!;
      const rawDigit = isocp.getCharShape('1'.charCodeAt(0), size)!;
      const hanLayout = hztxt.getLayoutCharShape(0xb5f7, size)!;

      expect(digitLayout.bbox.minY).toBeCloseTo(rawDigit.bbox.minY + isocpMetrics.capHeight, 0);
      expect(hanLayout.bbox.minY).toBeCloseTo(hztxt.getCharShape(0xb5f7, size)!.bbox.minY, 0);

      const placed = layoutTextRun([
        { font: isocp, code: '1'.charCodeAt(0), size },
        { font: hztxt, code: 0xb5f7, size },
        { font: isocp, code: 'H'.charCodeAt(0), size },
      ]);
      expect(placed).toHaveLength(3);
      expect(placed[1].x).toBeCloseTo(
        resolveAdvanceWidth(digitLayout, isocp.fontData, size),
        0
      );
    } finally {
      isocp.release();
      hztxt.release();
    }
  }, 60_000);
});
