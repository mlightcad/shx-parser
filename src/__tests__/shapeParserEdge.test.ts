import { ShxFontType } from '../fontData';
import { createTestFont, getShape, sbyte, totalVertexCount } from './helpers/fontTestHelpers';

describe('shapeParser edge cases', () => {
  it('handles clockwise fractional arcs with end offset adjustment', () => {
    const bytecode = new Uint8Array([
      0x0b,
      0x10,
      0x20,
      0x00,
      10,
      sbyte(-0x02),
      0x00,
    ]);
    const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
    try {
      expect(totalVertexCount(getShape(font, 1, 10))).toBeGreaterThan(0);
    } finally {
      font.release();
    }
  });

  it('clamps bulge values below -127 in arc segments', () => {
    const bytecode = new Uint8Array([
      0x0c,
      sbyte(4),
      0x00,
      sbyte(-200),
      0x00,
    ]);
    const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
    try {
      expect(getShape(font, 1, 10)).toBeDefined();
    } finally {
      font.release();
    }
  });

  it('skips nested special codes after horizontal code 14', () => {
    const bytecode = new Uint8Array([
      0x0e,
      0x0e,
      0x44,
      0x00,
    ]);
    const font = createTestFont({ shapes: { 1: bytecode }, isTextFont: true });
    try {
      expect(getShape(font, 1, 10)!.lastPoint!.y).toBeCloseTo(4);
    } finally {
      font.release();
    }
  });

  it('returns undefined for character code 0', () => {
    const font = createTestFont({
      shapes: { 65: new Uint8Array([0x80, 0x00]) },
      isTextFont: true,
    });
    try {
      expect(font.getCharShape(0, 10)).toBeUndefined();
    } finally {
      font.release();
    }
  });

  it('handles missing unifont subshape without losing parent stroke', () => {
    const parent = new Uint8Array([0x07, 0x01, 0x99, 0x80, 0x00]);
    const font = createTestFont({
      fontType: ShxFontType.UNIFONT,
      shapes: { 0x0100: parent },
      isTextFont: true,
    });
    try {
      const shape = getShape(font, 0x0100, 10);
      expect(shape!.lastPoint!.x).toBeCloseTo(8);
    } finally {
      font.release();
    }
  });

  it('skips code 14 payload for vertical bigfont (extfont2-style)', () => {
    const bytecode = new Uint8Array([
      0x0e,
      0x08,
      sbyte(4),
      sbyte(0),
      0x44,
      0x00,
    ]);
    const font = createTestFont({
      fontType: ShxFontType.BIGFONT,
      shapes: { 100: bytecode },
      isExtended: true,
      orientation: 'vertical',
      height: 8,
    });
    try {
      const shape = getShape(font, 100, 16)!;
      expect(shape.lastPoint!.x).toBeCloseTo(0);
      expect(shape.lastPoint!.y).toBeCloseTo(8);
    } finally {
      font.release();
    }
  });

  it('executes gbcbig-style dual-orientation frame setup (7,8e push pen-up xy)', () => {
    // Matches gbcbig "zhong" (0xD6D0) prologue: 7,-114,5,2,8,(12,62)
    const bytecode = new Uint8Array([
      0x07,
      0x8e,
      0x05,
      0x02,
      0x08,
      12,
      62,
      0x01,
      0x44, // pen down, draw 4 north
      0x07,
      0x8f,
      0x00,
      0x00,
    ]);
    const font = createTestFont({
      fontType: ShxFontType.BIGFONT,
      shapes: { 0xd6d0: bytecode },
      isExtended: true,
      verticalDualMode: true,
      orientation: 'vertical',
      height: 64,
      width: 64,
    });
    try {
      const shape = getShape(font, 0xd6d0, 64)!;
      expect(shape.lastPoint!.x).toBeCloseTo(12);
      expect(shape.lastPoint!.y).toBeCloseTo(66);
      expect(totalVertexCount(shape)).toBeGreaterThan(0);
    } finally {
      font.release();
    }
  });

  it('does not hang on gbcbig-style xy bytes 0x0e/0x0d after frame setup', () => {
    const bytecode = new Uint8Array([
      0x07,
      0x8e,
      0x05,
      0x02,
      0x08,
      0x0e,
      0x0d,
      0x01,
      0x08,
      sbyte(-9),
      sbyte(-12),
      0x07,
      0x8f,
      0x00,
      0x00,
    ]);
    const font = createTestFont({
      fontType: ShxFontType.BIGFONT,
      shapes: { 53415: bytecode },
      isExtended: true,
      verticalDualMode: true,
      orientation: 'vertical',
      height: 64,
    });
    try {
      expect(getShape(font, 53415, 12)).toBeDefined();
    } finally {
      font.release();
    }
  });
});
