import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ShxFont } from '../font';
import { ShxFontType } from '../fontData';

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/';

async function loadRemoteFont(filename: string): Promise<ShxFont> {
  try {
    const response = await fetch(FONT_BASE + filename);
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status}`);
    }
    return new ShxFont(await response.arrayBuffer());
  } catch {
    const localPath = join(process.cwd(), 'examples', 'fonts', filename);
    const data = await readFile(localPath);
    return new ShxFont(data.buffer);
  }
}

describe('text font vs plain shape library (shape #0)', () => {
  it('times.shx is a text font (shape #0 present)', async () => {
    const font = await loadRemoteFont('times.shx');
    try {
      expect(font.fontData.header.fontType).toBe(ShxFontType.SHAPES);
      expect(font.fontData.content.data[0]).toBeDefined();
    } finally {
      font.release();
    }
  }, 60_000);

  it('ltypeshp.shx is a plain shape library (no shape #0)', async () => {
    const font = await loadRemoteFont('ltypeshp.shx');
    try {
      expect(font.fontData.header.fontType).toBe(ShxFontType.SHAPES);
      expect(font.fontData.content.data[0]).toBeUndefined();
    } finally {
      font.release();
    }
  }, 60_000);
});
