import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ShxFont } from '../font';

async function loadGdtFont(): Promise<ShxFont> {
  const localPath = join(process.cwd(), 'examples', 'fonts', 'gdt.shx');
  const data = await readFile(localPath);
  return new ShxFont(data.buffer);
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
      expect(shape.bbox.maxX).toBeLessThan(size);
      expect(shape.bbox.maxY).toBeLessThan(size * 0.25);
    } finally {
      font.release();
    }
  }, 10_000);
});
