import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ShxFont } from '../font';

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/';

async function loadAmgdt(): Promise<ShxFont> {
  try {
    const response = await fetch(FONT_BASE + 'amgdt.shx');
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status}`);
    }
    return new ShxFont(await response.arrayBuffer());
  } catch {
    const localPath = join(process.cwd(), 'examples', 'fonts', 'amgdt.shx');
    const data = await readFile(localPath);
    return new ShxFont(data.buffer);
  }
}

function countVertices(font: ShxFont, code: number, size: number): number {
  const shape = font.getCharShape(code, size);
  if (!shape) {
    return 0;
  }
  let count = 0;
  for (const line of shape.polylines) {
    count += line.length;
  }
  return count;
}

function bboxWidth(font: ShxFont, code: number, size: number): number {
  const shape = font.getCharShape(code, size);
  if (!shape) {
    return 0;
  }
  const { minX, maxX } = shape.bbox;
  return maxX - minX;
}

describe('amgdt.shx code 132 (%%132)', () => {
  it('parses stroke geometry after a blank unifont subshape call', async () => {
    const font = await loadAmgdt();
    try {
      expect(countVertices(font, 130, 10)).toBeGreaterThan(0);
      expect(countVertices(font, 131, 10)).toBeGreaterThan(0);
      expect(countVertices(font, 132, 10)).toBeGreaterThan(0);
    } finally {
      font.release();
    }
  }, 60_000);

  it('code 132 has visible stroke extent comparable to other GDT symbols', async () => {
    const font = await loadAmgdt();
    try {
      const size = 10;
      const w130 = bboxWidth(font, 130, size);
      const w132 = bboxWidth(font, 132, size);
      expect(w132).toBeGreaterThan(size * 0.3);
      expect(w132 / w130).toBeGreaterThan(0.3);
    } finally {
      font.release();
    }
  }, 60_000);
});
