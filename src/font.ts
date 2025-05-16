import { ShxFileReader } from './fileReader';
import { ShxFontData } from './fontData';
import { ShxHeaderParser } from './headerParser';
import { ShxContentParserFactory } from './contentParser';
import { ShxShapeParser } from './shapeParser';

export class ShxFont {
  public readonly fontData: ShxFontData;
  private readonly shapeParser: ShxShapeParser;

  constructor(fileData: ArrayBuffer) {
    const reader = new ShxFileReader(fileData);
    const headerParser = new ShxHeaderParser();
    const header = headerParser.parse(reader);
    const contentParser = ShxContentParserFactory.createParser(header.fontType);
    const content = contentParser.parse(reader);
    this.fontData = {
      header,
      content,
    };
    this.shapeParser = new ShxShapeParser(this.fontData);
  }

  public getCharShape(code: number, size: number) {
    return this.shapeParser.parse(code, size);
  }

  public release(): void {
    this.shapeParser.release();
  }
}
