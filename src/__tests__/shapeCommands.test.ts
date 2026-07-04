import { ShxFontType } from '../fontData';
import {
  createTestFont,
  getShape,
  sbyte,
  totalVertexCount,
  allPoints,
} from './helpers/fontTestHelpers';

/**
 * Special codes 0–14 per Autodesk spec.
 * @see https://help.autodesk.com/view/OARX/2023/ENU/?guid=GUID-06832147-16BE-4A66-A6D0-3ADF98DC8228
 */
describe('special shape codes (0–14)', () => {
  describe('codes 0, 1, 2 — end of shape and pen control', () => {
    it('code 1 (pen down) draws a segment; code 2 (pen up) creates a gap', () => {
      const bytecode = new Uint8Array([
        0x01, // pen down
        0x80, // 8 units east
        0x02, // pen up
        0x80, // move 8 east without drawing
        0x01, // pen down
        0x80, // draw 8 east
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.polylines.length).toBe(2);
        expect(shape!.polylines[0].length).toBe(2);
        expect(shape!.polylines[1].length).toBe(2);
        expect(shape!.lastPoint!.x).toBeCloseTo(24);
      } finally {
        font.release();
      }
    });

    it('code 0 flushes a trailing pen-down stroke at shape end', () => {
      const bytecode = new Uint8Array([0x01, 0x80, 0x00]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.polylines.length).toBe(1);
        expect(totalVertexCount(shape)).toBe(2);
      } finally {
        font.release();
      }
    });
  });

  describe('codes 3, 4 — scale control', () => {
    it('code 3 divides vector lengths by the next byte', () => {
      const bytecode = new Uint8Array([0x03, 0x02, 0x01, 0x80, 0x00]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(4);
      } finally {
        font.release();
      }
    });

    it('code 4 multiplies vector lengths by the next byte', () => {
      const bytecode = new Uint8Array([0x04, 0x02, 0x01, 0x10, 0x00]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(2);
      } finally {
        font.release();
      }
    });

    it('codes 3 and 4 compose cumulatively', () => {
      const bytecode = new Uint8Array([0x04, 0x02, 0x03, 0x02, 0x01, 0x80, 0x00]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(8);
      } finally {
        font.release();
      }
    });
  });

  describe('codes 5, 6 — location stack', () => {
    it('code 5 pushes and code 6 pops the current location', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x80, // draw to (8, 0)
        0x05, // push
        0x08,
        sbyte(5),
        sbyte(3), // move to (13, 3)
        0x01,
        0x40, // draw north 4 to (13, 7)
        0x06, // pop back to (8, 0)
        0x01,
        0x2c, // draw south 2 to (8, -2)
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(8);
        expect(shape!.lastPoint!.y).toBeCloseTo(-2);
        expect(shape!.polylines.length).toBeGreaterThanOrEqual(1);
      } finally {
        font.release();
      }
    });

    it('throws when the 4-deep position stack overflows', () => {
      const bytecode = new Uint8Array([0x05, 0x05, 0x05, 0x05, 0x05, 0x00]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        expect(() => getShape(font, 1, 10)).toThrow(
          'The position stack is only four locations deep'
        );
      } finally {
        font.release();
      }
    });
  });

  describe('code 7 — subshape', () => {
    it('draws a referenced subshape in SHAPES fonts', () => {
      const subLine = new Uint8Array([0x80, 0x00]);
      const parent = new Uint8Array([0x07, 0x01, 0x00]);
      const font = createTestFont({
        shapes: { 1: subLine, 2: parent },
        isTextFont: true,
      });
      try {
        const shape = getShape(font, 2, 10);
        expect(totalVertexCount(shape)).toBeGreaterThan(0);
        expect(shape!.lastPoint!.x).toBeGreaterThan(0);
      } finally {
        font.release();
      }
    });

    it('subshape ending with pen down still produces geometry', () => {
      const subLine = new Uint8Array([0x80, 0x00]);
      const font = createTestFont({ shapes: { 1: subLine }, isTextFont: true });
      try {
        const subOnly = getShape(font, 1, 10);
        expect(totalVertexCount(subOnly)).toBe(2);
      } finally {
        font.release();
      }
    });

    it('continues drawing from the subshape endpoint in SHAPES fonts', () => {
      const subLine = new Uint8Array([0x80, 0x00]);
      const parent = new Uint8Array([0x07, 0x01, 0x80, 0x00]);
      const font = createTestFont({
        shapes: { 1: subLine, 2: parent },
        isTextFont: true,
      });
      try {
        const combined = getShape(font, 2, 10);
        expect(combined!.lastPoint!.x).toBeCloseTo(18);
      } finally {
        font.release();
      }
    });

    it('draws a Unicode subshape in UNIFONT (two-byte shape number)', () => {
      const subLine = new Uint8Array([0x01, 0x40, 0x02, 0x00]);
      const parent = new Uint8Array([0x07, 0x01, 0x2a, 0x00]);
      const font = createTestFont({
        fontType: ShxFontType.UNIFONT,
        shapes: { 0x012a: subLine, 0x0100: parent },
        isTextFont: true,
        height: 10,
      });
      try {
        const shape = getShape(font, 0x0100, 10);
        expect(totalVertexCount(shape)).toBeGreaterThan(0);
      } finally {
        font.release();
      }
    });

    it('draws an extended bigfont subshape (7,0,primitive#,origin,scale)', () => {
      const primitive = new Uint8Array([0x01, 0x80, 0x02, 0x00]);
      const parent = new Uint8Array([
        0x07,
        0x00,
        0x00,
        0x01, // primitive #1
        sbyte(2),
        sbyte(1), // origin offset
        0x08, // width scale
        0x08, // height scale
        0x00,
      ]);
      const font = createTestFont({
        fontType: ShxFontType.BIGFONT,
        shapes: { 0x4e00: parent, 1: primitive },
        isExtended: true,
        height: 8,
        width: 8,
      });
      try {
        const shape = getShape(font, 0x4e00, 16);
        expect(totalVertexCount(shape)).toBeGreaterThan(0);
      } finally {
        font.release();
      }
    });
  });

  describe('codes 8, 9 — X-Y displacement', () => {
    it('code 8 moves by signed x,y bytes', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x08,
        sbyte(3),
        sbyte(-2),
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(3);
        expect(shape!.lastPoint!.y).toBeCloseTo(-2);
      } finally {
        font.release();
      }
    });

    it('code 9 processes multiple displacements terminated by (0,0)', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x09,
        0x01,
        0x00,
        0x02,
        0x00,
        sbyte(-1),
        sbyte(1),
        0x00,
        0x00,
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        const points = allPoints(shape);
        expect(points[points.length - 1].x).toBeCloseTo(2);
        expect(points[points.length - 1].y).toBeCloseTo(1);
      } finally {
        font.release();
      }
    });
  });

  describe('codes 10, 11 — octant and fractional arcs', () => {
    it('code 10 draws a counterclockwise quarter arc', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x0a,
        10, // radius
        0x02, // start octant 0, span 2 (90°)
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(totalVertexCount(shape)).toBeGreaterThan(2);
        expect(shape!.lastPoint!.y).toBeCloseTo(10, 0);
      } finally {
        font.release();
      }
    });

    it('code 11 draws a fractional arc with start/end offsets', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x0b,
        0x00, // start offset
        0x00, // end offset
        0x00, // high radius
        10, // low radius
        0x02, // CCW, start 0, span 2
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(totalVertexCount(shape)).toBeGreaterThan(2);
      } finally {
        font.release();
      }
    });
  });

  describe('codes 12, 13 — bulge arcs', () => {
    it('code 12 draws a straight segment when bulge is 0', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x0c,
        sbyte(4),
        0x00,
        0x00,
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(4);
        expect(totalVertexCount(shape)).toBe(2);
      } finally {
        font.release();
      }
    });

    it('code 12 draws a semicircle when bulge is 127', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x0c,
        sbyte(10),
        0x00,
        127,
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(totalVertexCount(shape)).toBeGreaterThan(2);
        expect(shape!.lastPoint!.x).toBeCloseTo(10);
      } finally {
        font.release();
      }
    });

    it('code 13 chains multiple bulge arcs terminated by (0,0)', () => {
      const bytecode = new Uint8Array([
        0x01,
        0x0d,
        sbyte(5),
        0x00,
        0x00,
        sbyte(5),
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
      ]);
      const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(10);
        expect(totalVertexCount(shape)).toBeGreaterThan(2);
      } finally {
        font.release();
      }
    });
  });

  describe('code 14 — vertical text flag', () => {
    it('skips the next single command in horizontal-orientation fonts', () => {
      const bytecode = new Uint8Array([
        0x0e,
        0x08,
        sbyte(5),
        sbyte(3), // xy move — skipped
        0x01,
        0x44, // draw 4 north from origin (len 4, dir 4)
        0x00,
      ]);
      const font = createTestFont({
        shapes: { 1: bytecode },
        isTextFont: true,
        orientation: 'horizontal',
      });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(0);
        expect(shape!.lastPoint!.y).toBeCloseTo(4);
      } finally {
        font.release();
      }
    });

    it('executes the next command in vertical-orientation fonts', () => {
      const bytecode = new Uint8Array([
        0x0e,
        0x01,
        0x80, // draw 8 east — executed when vertical
        0x00,
      ]);
      const font = createTestFont({
        shapes: { 1: bytecode },
        isTextFont: true,
        orientation: 'vertical',
        shapeZeroInfo: new Uint8Array([
          ...new TextEncoder().encode('vertical font'),
          0x00,
          8,
          2,
          1, // vertical
        ]),
      });
      try {
        const shape = getShape(font, 1, 10);
        expect(shape!.lastPoint!.x).toBeCloseTo(8);
        expect(totalVertexCount(shape)).toBeGreaterThan(0);
      } finally {
        font.release();
      }
    });
  });
});
