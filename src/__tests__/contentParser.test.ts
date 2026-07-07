import { ShxContentParserFactory, splitShapeNameAndBytecode } from '../contentParser';
import { ShxFileReader } from '../fileReader';
import { ShxFontType } from '../fontData';
import { buildMinimalShapesShx } from './helpers/fontTestHelpers';

describe('contentParser', () => {
  describe('splitShapeNameAndBytecode', () => {
    it('returns the full buffer as bytecode when no null terminator exists', () => {
      const bytes = new Uint8Array([0x01, 0x80, 0x02]);
      expect(splitShapeNameAndBytecode(bytes)).toEqual({
        name: null,
        bytecode: bytes,
      });
    });

    it('extracts uppercase ASCII shape names before the null byte', () => {
      const bytecode = new Uint8Array([0x80, 0x00]);
      const raw = new Uint8Array([...new TextEncoder().encode('DBOX'), 0x00, ...bytecode]);
      expect(splitShapeNameAndBytecode(raw)).toEqual({
        name: 'DBOX',
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
  });

  describe('ShxContentParserFactory', () => {
    it('throws for unsupported font types', () => {
      expect(() =>
        ShxContentParserFactory.createParser('unknown' as ShxFontType)
      ).toThrow(/Unsupported font type/);
    });
  });

  describe('ShxBigfontContentParser', () => {
    it('parses non-extended bigfont info metrics', () => {
      const header = 'AutoCAD-86 bigfont V1.0\r\n\x1a';
      const glyph = new Uint8Array([0x80, 0x00]);
      const infoBlock = new Uint8Array([
        ...new TextEncoder().encode('Standard'),
        0x00,
        7,
        1,
        0,
        0,
      ]);
      const indexBytes = 6 + 8;
      const buffer = new ArrayBuffer(header.length + indexBytes + glyph.length + infoBlock.length);
      const bytes = new Uint8Array(buffer);
      bytes.set(new TextEncoder().encode(header), 0);
      const view = new DataView(buffer);
      let o = header.length;
      view.setInt16(o, 0, true);
      o += 2;
      view.setInt16(o, 1, true);
      o += 2;
      view.setInt16(o, 0, true);
      o += 2;
      view.setUint16(o, 0, true);
      o += 2;
      view.setUint16(o, infoBlock.length, true);
      o += 2;
      view.setUint32(o, header.length + indexBytes, true);
      o += 4;
      bytes.set(infoBlock, o);

      const reader = new ShxFileReader(buffer);
      reader.setPosition(header.length);
      const content = ShxContentParserFactory.createParser(ShxFontType.BIGFONT).parse(reader);
      expect(content.isExtended).toBe(false);
      expect(content.height).toBe(8);
    });

    it('parses bigfont index table and extended info block', () => {
      const header = 'AutoCAD-86 bigfont V1.0\r\n\x1a';
      const glyph = new Uint8Array([0x80, 0x00]);
      const infoBlock = new Uint8Array([
        ...new TextEncoder().encode('BigFont'),
        0x00,
        8,
        0,
        0,
        8,
        0,
      ]);
      const indexBytes = 6 + 16;
      const dataSectionSize = indexBytes + glyph.length + infoBlock.length;
      const buffer = new ArrayBuffer(header.length + dataSectionSize);
      const bytes = new Uint8Array(buffer);
      bytes.set(new TextEncoder().encode(header), 0);
      const view = new DataView(buffer);
      let o = header.length;
      view.setInt16(o, 0, true);
      o += 2;
      view.setInt16(o, 2, true);
      o += 2;
      view.setInt16(o, 0, true);
      o += 2;
      view.setUint16(o, 65, true);
      o += 2;
      view.setUint16(o, glyph.length, true);
      o += 2;
      view.setUint32(o, header.length + indexBytes, true);
      o += 4;
      view.setUint16(o, 0, true);
      o += 2;
      view.setUint16(o, infoBlock.length, true);
      o += 2;
      view.setUint32(o, header.length + indexBytes + glyph.length, true);
      o += 4;
      bytes.set(glyph, o);
      o += glyph.length;
      bytes.set(infoBlock, o);

      const reader = new ShxFileReader(buffer);
      reader.setPosition(header.length);
      const content = ShxContentParserFactory.createParser(ShxFontType.BIGFONT).parse(reader);
      expect(content.data[65]).toEqual(glyph);
      expect(content.data[0]).toEqual(infoBlock);
      expect(content.isExtended).toBe(true);
    });

    it('parses short non-extended metrics after a double null terminator', () => {
      const header = 'AutoCAD-86 bigfont V1.0\r\n\x1a';
      const glyph = new Uint8Array([0x80, 0x00]);
      const infoBlock = new Uint8Array([
        ...new TextEncoder().encode('GBCBig'),
        0x00,
        0x00,
        64,
        2,
        0,
      ]);
      const indexBytes = 6 + 8;
      const buffer = new ArrayBuffer(header.length + indexBytes + glyph.length + infoBlock.length);
      const bytes = new Uint8Array(buffer);
      bytes.set(new TextEncoder().encode(header), 0);
      const view = new DataView(buffer);
      let o = header.length;
      view.setInt16(o, 0, true);
      o += 2;
      view.setInt16(o, 1, true);
      o += 2;
      view.setInt16(o, 0, true);
      o += 2;
      view.setUint16(o, 0, true);
      o += 2;
      view.setUint16(o, infoBlock.length, true);
      o += 2;
      view.setUint32(o, header.length + indexBytes, true);
      o += 4;
      bytes.set(infoBlock, o);

      const reader = new ShxFileReader(buffer);
      reader.setPosition(header.length);
      const content = ShxContentParserFactory.createParser(ShxFontType.BIGFONT).parse(reader);
      expect(content.baseUp).toBe(64);
      expect(content.baseDown).toBe(0);
      expect(content.height).toBe(64);
      expect(content.width).toBe(64);
      expect(content.orientation).toBe('vertical');
      expect(content.isExtended).toBe(true);
      expect(content.verticalDualMode).toBe(true);
    });
  });

  describe('ShxUnifontContentParser', () => {
    it('parses unifont info and named glyph entries', () => {
      const header = 'AutoCAD-86 unifont V1.0\r\n\x1a';
      const glyphBytecode = new Uint8Array([0x80, 0x00]);
      const namedRaw = new Uint8Array([...new TextEncoder().encode('A'), 0x00, ...glyphBytecode]);
      const info = new Uint8Array([
        ...new TextEncoder().encode('UniFont'),
        0x00,
        8,
        2,
        0,
      ]);
      const sectionSize = 4 + 2 + info.length + 4 + namedRaw.length;
      const buffer = new ArrayBuffer(header.length + sectionSize);
      const bytes = new Uint8Array(buffer);
      bytes.set(new TextEncoder().encode(header), 0);
      const view = new DataView(buffer);
      let o = header.length;
      view.setInt32(o, 2, true);
      o += 4;
      view.setInt16(o, info.length, true);
      o += 2;
      bytes.set(info, o);
      o += info.length;
      view.setUint16(o, 65, true);
      o += 2;
      view.setUint16(o, namedRaw.length, true);
      o += 2;
      bytes.set(namedRaw, o);

      const reader = new ShxFileReader(buffer);
      reader.setPosition(header.length);
      const content = ShxContentParserFactory.createParser(ShxFontType.UNIFONT).parse(reader);
      expect(content.info).toBe('UniFont');
      expect(content.names?.A).toBe(65);
      expect(content.codeToName?.[65]).toBe('A');
      expect(content.data[65]).toEqual(glyphBytecode);
    });
  });

  describe('ShxShapeContentParser', () => {
    it('parses shape table, names, and font info block (shape #0)', () => {
      const infoBlock = new Uint8Array([
        ...new TextEncoder().encode('MyFont'),
        0x00,
        7, // baseUp
        3, // baseDown
        0, // horizontal
      ]);
      const glyph = new Uint8Array([0x01, 0x80, 0x00]);
      const namedRaw = new Uint8Array([...new TextEncoder().encode('A'), 0x00, ...glyph]);

      const buffer = buildMinimalShapesShx([
        { code: 0, raw: infoBlock },
        { code: 65, raw: namedRaw },
      ]);

      const header = 'AutoCAD-86 shapes V1.0\r\n\x1a';
      const reader = new ShxFileReader(buffer);
      reader.setPosition(header.length);
      const parser = ShxContentParserFactory.createParser(ShxFontType.SHAPES);
      const content = parser.parse(reader);

      expect(content.info).toBe('MyFont');
      expect(content.baseUp).toBe(7);
      expect(content.baseDown).toBe(3);
      expect(content.height).toBe(10);
      expect(content.orientation).toBe('horizontal');
      expect(content.names?.A).toBe(65);
      expect(content.data[65]).toEqual(glyph);
    });
  });
});
