import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { splitShapeNameAndBytecode } from '../contentParser';
import { ShxFont } from '../font';
import { ShxFontData, ShxFontType } from '../fontData';

const FONT_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/';

function encodeNamedShape(name: string, bytecode: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const raw = new Uint8Array(nameBytes.length + 1 + bytecode.length);
  raw.set(nameBytes, 0);
  raw[nameBytes.length] = 0;
  raw.set(bytecode, nameBytes.length + 1);
  return raw;
}

function createShapeFontFromRaw(rawShapes: Record<number, Uint8Array>): ShxFont {
  const data: Record<number, Uint8Array> = {};
  const names: Record<string, number> = {};

  for (const [codeKey, bytes] of Object.entries(rawShapes)) {
    const code = Number(codeKey);
    const { name, bytecode } = splitShapeNameAndBytecode(bytes);
    data[code] = bytecode;
    if (name) {
      names[name] = code;
    }
  }

  const fontData: ShxFontData = {
    header: {
      fontType: ShxFontType.SHAPES,
      fileHeader: 'AutoCAD-86 shapes V1.0',
      fileVersion: '1.0',
    },
    content: {
      data,
      names,
      info: '',
      orientation: 'horizontal',
      baseUp: 8,
      baseDown: 2,
      height: 10,
      width: 10,
      isExtended: false,
    },
  };

  return new ShxFont(fontData);
}

async function loadG13f12d(): Promise<ShxFont> {
  try {
    const response = await fetch(FONT_BASE + 'g13f12d.shx');
    if (!response.ok) {
      throw new Error(`fetch failed: ${response.status}`);
    }
    return new ShxFont(await response.arrayBuffer());
  } catch {
    const localPath = join(process.cwd(), 'examples', 'fonts', 'g13f12d.shx');
    const data = await readFile(localPath);
    return new ShxFont(data.buffer);
  }
}

describe('shape name parsing', () => {
  it('splits a null-terminated shape name from bytecode', () => {
    const bytecode = new Uint8Array([0x01, 0x80, 0x02, 0x00]);
    const raw = encodeNamedShape('GRS', bytecode);

    expect(splitShapeNameAndBytecode(raw)).toEqual({
      name: 'GRS',
      bytecode,
    });
  });

  it('treats a leading null byte as an empty shape name', () => {
    const bytecode = new Uint8Array([0x02, 0x14, 0x03, 0x00]);
    const raw = new Uint8Array([0x00, ...bytecode]);

    expect(splitShapeNameAndBytecode(raw)).toEqual({
      name: null,
      bytecode,
    });
  });

  it('looks up named shapes case-insensitively', () => {
    const font = createShapeFontFromRaw({
      135: encodeNamedShape('GRS', new Uint8Array([0x01, 0x80, 0x02, 0x00])),
    });

    try {
      expect(font.hasShape('GRS')).toBe(true);
      expect(font.hasShape('grs')).toBe(true);
      expect(font.getShapeCode('grs')).toBe(135);
      expect(font.getShapeName(135)).toBe('GRS');

      const shape = font.getShapeByName('grs', 10);
      expect(shape).toBeDefined();
      expect(shape!.polylines.length).toBeGreaterThan(0);
    } finally {
      font.release();
    }
  });

  it('parses named shapes from a real compiled shape font', async () => {
    const font = await loadG13f12d();
    try {
      expect(font.hasShape('!')).toBe(true);
      expect(font.getShapeCode('!')).toBe(33);

      const byCode = font.getCharShape(33, 10);
      const byName = font.getShapeByName('!', 10);
      expect(byName).toBeDefined();
      expect(byName!.polylines.length).toBe(byCode!.polylines.length);
    } finally {
      font.release();
    }
  }, 60_000);
});
