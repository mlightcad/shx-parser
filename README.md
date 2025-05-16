# SHX Parser

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/shx-parser.svg)](https://badge.fury.io/js/shx-parser)
[![CI/CD](https://github.com/shx-parser/shx-parser/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/shx-parser/shx-parser/actions/workflows/ci-cd.yml)

A TypeScript library for parsing AutoCAD SHX font files.

## Features

- Parse SHX font files and extract font data
- Support for various SHX font types:
  - Shapes
  - Bigfont
  - Unifont
- Shape parsing with performance optimization:
  - On-demand parsing
  - Shape caching by character code and size
- Modern TypeScript implementation
- Object-oriented design
- Comprehensive test coverage

## Installation

Using npm:
```bash
npm install shx-parser
```

Using pnpm:
```bash
pnpm add shx-parser
```

Using yarn:
```bash
yarn add shx-parser
```

## Quick Start

```typescript
import { ShxFont } from 'shx-parser';

// Load the font file
const fontFileData = /* ArrayBuffer containing SHX font file data */;
const font = new ShxFont(fontFileData);

// Get shape for a character
const charCode = 65; // ASCII code for 'A'
const fontSize = 12;
const shape = font.getCharShape(charCode, fontSize);

if (shape) {
  console.log(shape.polylines); // Array of polylines representing the character
  console.log(shape.lastPoint); // End point of the character
}

// Clean up resources when done
font.release();
```

## API Documentation

### `ShxFont`

The main class for working with SHX fonts.

```typescript
class ShxFont {
  constructor(data: ArrayBuffer);
  getCharShape(charCode: number, size: number): ShxShape | null;
  release(): void;
  getFontData(): ShxFontData;
}
```

### `ShxShape`

Represents a parsed character shape.

```typescript
interface ShxShape {
  polylines: Array<{ x: number; y: number }[]>;  // Array of polyline points
  lastPoint: { x: number; y: number };           // End point of the shape
  width: number;                                 // Width of the shape
  height: number;                                // Height of the shape
}
```

### Font Data Structure

The library parses SHX font files into the following structure:

```typescript
interface ShxFontData {
  header: {
    fontType: ShxFontType;     // 'shapes' | 'bigfont' | 'unifont'
    fileHeader: string;        // Font file header information
    fileVersion: string;       // Font file version
  };
  content: {
    data: Record<number, Uint8Array>;  // Character code to bitmap data mapping
    info: string;              // Additional font information
    orientation: string;       // Text orientation ('horizontal' | 'vertical')
    baseUp: number;           // Pixels above baseline
    baseDown: number;         // Pixels below baseline
  };
}
```

## Examples

### Loading a Font File

```typescript
import { readFile } from 'fs/promises';
import { ShxFont } from 'shx-parser';

async function loadFont(filePath: string) {
  const buffer = await readFile(filePath);
  const font = new ShxFont(buffer.buffer);
  return font;
}
```

### Rendering Text

```typescript
function renderText(font: ShxFont, text: string, size: number) {
  const shapes = [];
  let x = 0;
  
  for (const char of text) {
    const shape = font.getCharShape(char.charCodeAt(0), size);
    if (shape) {
      // Translate shape to current x position
      const translatedShape = {
        ...shape,
        polylines: shape.polylines.map(line =>
          line.map(point => ({ x: point.x + x, y: point.y }))
        )
      };
      shapes.push(translatedShape);
      x += shape.width;
    }
  }
  
  return shapes;
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please make sure to update tests as appropriate.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you have any questions or run into issues, please:
1. Check the [GitHub Issues](https://github.com/shx-parser/shx-parser/issues) page
2. Open a new issue if your problem hasn't been reported yet
