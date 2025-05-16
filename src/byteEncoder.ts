/**
 * Handles byte encoding and decoding for SHX file format.
 * Converts between characters, numbers, and byte arrays using SHX-specific encoding rules.
 */

type ShxEncodableValue = string | number | boolean;
type ShxEncodable = ShxEncodableValue | ShxEncodableValue[];

export class ShxByteEncoder {
  private dataView: DataView;

  constructor(buffer: ArrayBuffer) {
    this.dataView = new DataView(buffer);
  }

  /**
   * Converts a value to its byte representation according to SHX encoding rules
   */
  public static getBytes(value: ShxEncodable): Uint8Array {
    if (typeof value === 'string') {
      return new TextEncoder().encode(value);
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value <= 2147483647) {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setInt32(0, value, true);
        return new Uint8Array(buffer);
      }
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setFloat64(0, value, true);
      return new Uint8Array(buffer);
    }
    if (typeof value === 'boolean') {
      return new Uint8Array([value ? 1 : 0]);
    }
    if (Array.isArray(value)) {
      const arrays = value.map(v => ShxByteEncoder.getBytes(v));
      const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
      }
      return result;
    }
    throw new Error('Unsupported type for byte conversion');
  }

  /**
   * Creates a new encoder from a Uint8Array
   */
  public static fromUint8Array(array: Uint8Array): ShxByteEncoder {
    return new ShxByteEncoder(array.buffer);
  }

  /**
   * Converts an unsigned byte to a signed byte as used in SHX format
   */
  public static byteToSByte(value: number): number {
    return value > 127 ? value - 256 : value;
  }

  public toBoolean(offset: number = 0): boolean {
    return this.dataView.getUint8(offset) !== 0;
  }

  public toInt32(offset: number = 0): number {
    return this.dataView.getInt32(offset, true);
  }

  public toUint16(offset: number = 0): number {
    return this.dataView.getUint16(offset, true);
  }

  public toUint32(offset: number = 0): number {
    return this.dataView.getUint32(offset, true);
  }

  public toFloat64(offset: number = 0): number {
    return this.dataView.getFloat64(offset, true);
  }
}
