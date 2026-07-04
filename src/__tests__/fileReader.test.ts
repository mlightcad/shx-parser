import { ShxFileReader } from '../fileReader';

describe('ShxFileReader', () => {
  describe('byteToSByte', () => {
    it('converts unsigned bytes to signed values', () => {
      expect(ShxFileReader.byteToSByte(0)).toBe(0);
      expect(ShxFileReader.byteToSByte(127)).toBe(127);
      expect(ShxFileReader.byteToSByte(128)).toBe(-128);
      expect(ShxFileReader.byteToSByte(254)).toBe(-2);
    });
  });

  describe('read methods', () => {
    it('reads bytes, integers, and floats', () => {
      const buffer = new ArrayBuffer(26);
      const view = new DataView(buffer);
      view.setUint8(0, 0xfe);
      view.setInt8(1, -1);
      view.setUint16(2, 0x1234, true);
      view.setInt16(4, -100, true);
      view.setUint32(6, 0xdeadbeef, true);
      view.setInt32(10, -999, true);
      view.setFloat32(14, 1.5, true);
      view.setFloat64(18, 2.5, true);

      const reader = new ShxFileReader(buffer);
      expect(reader.readUint8()).toBe(0xfe);
      expect(reader.readInt8()).toBe(-1);
      expect(reader.readUint16()).toBe(0x1234);
      expect(reader.readInt16()).toBe(-100);
      expect(reader.readUint32()).toBe(0xdeadbeef);
      expect(reader.readInt32()).toBe(-999);
      expect(reader.readFloat32()).toBeCloseTo(1.5);
      expect(reader.readFloat64()).toBeCloseTo(2.5);
    });

    it('reads byte arrays and skips', () => {
      const buffer = new ArrayBuffer(8);
      const reader = new ShxFileReader(buffer);
      expect(reader.readBytes(2)).toEqual(new Uint8Array([0, 0]));
      reader.skip(2);
      expect(reader.currentPosition).toBe(4);
    });

    it('reads big-endian uint16', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint16(0, 0x1234, false);
      const reader = new ShxFileReader(buffer);
      expect(reader.readUint16(false)).toBe(0x1234);
    });

    it('reports length and end state', () => {
      const reader = new ShxFileReader(new ArrayBuffer(4));
      expect(reader.length).toBe(4);
      reader.setPosition(3);
      expect(reader.isEnd()).toBe(true);
    });

    it('throws when reading past buffer end', () => {
      const reader = new ShxFileReader(new ArrayBuffer(4));
      reader.setPosition(4);
      expect(() => reader.readUint8()).toThrow(/out of range/i);
      expect(() => reader.readBytes(1)).toThrow(/out of range/i);
      expect(() => reader.skip(1)).toThrow(/out of range/i);
      expect(() => reader.setPosition(10)).toThrow(/out of range/i);
    });
  });
});
