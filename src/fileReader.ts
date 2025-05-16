export class ShxFileReader {
  private position: number;
  private data: DataView;

  constructor(arraybuffer: ArrayBuffer) {
    this.position = 0;
    this.data = new DataView(arraybuffer);
  }

  readBytes(length = 1) {
    if (this.data.byteLength < this.position + length) {
      this.throwOutOfRangeError(this.position + length);
    }

    const buf = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      buf[i] = this.data.getUint8(this.position + i);
    }

    this.position += length;
    return buf;
  }

  readUint8() {
    if (this.data.byteLength < this.position + 1) {
      this.throwOutOfRangeError(this.position + 1);
    }
    const result = this.data.getUint8(this.position);

    this.position += 1;
    return result;
  }

  readInt8() {
    if (this.data.byteLength < this.position + 1) {
      this.throwOutOfRangeError(this.position + 1);
    }
    const result = this.data.getInt8(this.position);

    this.position += 1;
    return result;
  }

  readUint16() {
    if (this.data.byteLength < this.position + 2) {
      this.throwOutOfRangeError(this.position + 2);
    }

    const result = this.data.getUint16(this.position, true);
    this.position += 2;
    return result;
  }

  readInt16() {
    if (this.data.byteLength < this.position + 2) {
      this.throwOutOfRangeError(this.position + 2);
    }

    const result = this.data.getInt16(this.position, true);
    this.position += 2;
    return result;
  }

  readUint32() {
    if (this.data.byteLength < this.position + 4) {
      this.throwOutOfRangeError(this.position + 4);
    }

    const result = this.data.getUint32(this.position, true);
    this.position += 4;
    return result;
  }

  readInt32() {
    if (this.data.byteLength < this.position + 4) {
      this.throwOutOfRangeError(this.position + 4);
    }

    const result = this.data.getInt32(this.position, true);
    this.position += 4;
    return result;
  }

  readFloat32() {
    if (this.data.byteLength < this.position + 4) {
      this.throwOutOfRangeError(this.position + 4);
    }

    const result = this.data.getFloat32(this.position, true);
    this.position += 4;
    return result;
  }

  readFloat64() {
    if (this.data.byteLength < this.position + 8) {
      this.throwOutOfRangeError(this.position + 8);
    }

    const result = this.data.getFloat64(this.position, true);
    this.position += 8;
    return result;
  }

  setPosition(position: number) {
    if (this.data.byteLength < position) {
      this.throwOutOfRangeError(position);
    }
    this.position = position;
  }

  isEnd() {
    return this.position === this.data.byteLength - 1;
  }

  get currentPosition(): number {
    return this.position;
  }

  get length(): number {
    return this.data.byteLength;
  }

  private throwOutOfRangeError(position: number) {
    throw new Error(
      `Position ${position} is out of range for the data length ${this.data.byteLength}!`
    );
  }
}
