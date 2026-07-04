import { createTestFont, getShape, totalVertexCount } from './helpers/fontTestHelpers';

/**
 * Vector direction codes per Autodesk spec (GUID-0A8E12A1).
 * @see https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-0A8E12A1-F4AB-44AD-8A9B-2140E0D5FD23
 */
const DIRECTION_VECTORS: Record<number, [number, number]> = {
  0: [1, 0],
  1: [1, 0.5],
  2: [1, 1],
  3: [0.5, 1],
  4: [0, 1],
  5: [-0.5, 1],
  6: [-1, 1],
  7: [-1, 0.5],
  8: [-1, 0],
  9: [-1, -0.5],
  10: [-1, -1],
  11: [-0.5, -1],
  12: [0, -1],
  13: [0.5, -1],
  14: [1, -1],
  15: [1, -0.5],
};

describe('vector length and direction codes', () => {
  it.each(Object.entries(DIRECTION_VECTORS))(
    'direction %i moves one unit to (%f, %f)',
    (dirStr, [expectedX, expectedY]) => {
      const dir = Number(dirStr);
      const len = 1;
      const command = (len << 4) | dir;
      const bytecode = new Uint8Array([command, 0x00]);

      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape).toBeDefined();
        expect(totalVertexCount(shape)).toBe(2);
        expect(shape!.lastPoint!.x).toBeCloseTo(expectedX);
        expect(shape!.lastPoint!.y).toBeCloseTo(expectedY);
      } finally {
        font.release();
      }
    }
  );

  it('scales vector length from the high nibble (length 15, direction 0)', () => {
    const bytecode = new Uint8Array([0xf0, 0x00]);
    const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
    try {
      const shape = getShape(font, 1, 10);
      expect(shape!.lastPoint!.x).toBeCloseTo(15);
      expect(shape!.lastPoint!.y).toBeCloseTo(0);
    } finally {
      font.release();
    }
  });

  it('draws the Autodesk DBOX example (box + diagonal)', () => {
    // *230,6,DBOX — 014,010,01C,018,012,0
    const dbox = new Uint8Array([0x14, 0x10, 0x1c, 0x18, 0x12, 0x00]);
    const font = createTestFont({ shapes: { 230: dbox } });
    try {
      const shape = getShape(font, 230, 1);
      expect(shape).toBeDefined();
      expect(totalVertexCount(shape)).toBe(6);
      expect(shape!.lastPoint!.x).toBeCloseTo(1);
      expect(shape!.lastPoint!.y).toBeCloseTo(1);
    } finally {
      font.release();
    }
  });
});
