import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ShxFont, alignShxGlyphForLayout } from '../font';

async function loadGdtFont(): Promise<ShxFont> {
  const localPath = join(process.cwd(), 'examples', 'fonts', 'gdt.shx');
  const data = await readFile(localPath);
  return new ShxFont(data.buffer);
}

async function loadAmgdtFont(): Promise<ShxFont | null> {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/amgdt.shx');
    if (!response.ok) {
      return null;
    }
    return new ShxFont(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function polylineCenter(shape: NonNullable<ReturnType<ShxFont['getCharShape']>>, index: number) {
  const line = shape.polylines[index];
  const xs = line.map(p => p.x);
  const ys = line.map(p => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

describe('GDT font glyphs (gdt.shx)', () => {
  it('code 110 draws a slash through the circle center', async () => {
    const font = await loadGdtFont();
    try {
      const size = font.fontData.content.height;
      const shape = font.getCharShape(110, size)!;
      expect(shape.polylines.length).toBe(2);

      const slash = polylineCenter(shape, 0);
      const circle = polylineCenter(shape, 1);
      expect(slash.x).toBeCloseTo(circle.x, 1);
      expect(slash.y).toBeCloseTo(circle.y, 0);
      expect(shape.bbox.maxY - shape.bbox.minY).toBeLessThan(size * 1.5);
    } finally {
      font.release();
    }
  }, 10_000);

  it('code 114 draws concentric circles within the em box', async () => {
    const font = await loadGdtFont();
    try {
      const size = font.fontData.content.height;
      const shape = font.getCharShape(114, size)!;
      expect(shape.polylines.length).toBe(2);

      const outer = polylineCenter(shape, 0);
      const inner = polylineCenter(shape, 1);
      expect(inner.x).toBeCloseTo(outer.x, 1);
      expect(inner.y).toBeCloseTo(outer.y, 1);
      expect(shape.bbox.maxX - shape.bbox.minX).toBeLessThan(size * 1.15);
      expect(shape.bbox.maxY - shape.bbox.minY).toBeLessThan(size * 1.15);
    } finally {
      font.release();
    }
  }, 30_000);

  it('layout aligns gdt glyphs with amgdt on the same baseline band', async () => {
    const gdt = await loadGdtFont();
    const amgdt = await loadAmgdtFont();
    if (!amgdt) return;
    try {
      const size = 10;
      for (const code of [110, 114]) {
        const gdtAligned = alignShxGlyphForLayout(gdt.getCharShape(code, size)!, gdt.fontData, size);
        const amgdtAligned = alignShxGlyphForLayout(
          amgdt.getCharShape(code, size)!,
          amgdt.fontData,
          size
        );
        expect(gdtAligned.bbox.minY).toBeCloseTo(amgdtAligned.bbox.minY, 1);
      }
    } finally {
      gdt.release();
      amgdt.release();
    }
  }, 30_000);
});
