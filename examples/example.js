import { ShxFont } from './dist/index.es.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Example usage
async function main() {
  try {
    // Read the ISO.shx file from the data folder
    const filePath = path.join(__dirname, '../data/ISO.shx');
    console.log('Reading font file:', filePath);
    
    const fileBuffer = fs.readFileSync(filePath);
    console.log('File size:', fileBuffer.length, 'bytes');
    
    // Create font instance from the file
    const font = new ShxFont(fileBuffer.buffer);

    // Get font information first
    const fontData = font.fontData;
    console.log('\nFont Information:');
    console.log('----------------');
    console.log('Font Type:', fontData.header.fontType);
    console.log('Header:', fontData.header.fileHeader);
    console.log('Version:', fontData.header.fileVersion);
    console.log('Info:', fontData.content.info);
    console.log('Orientation:', fontData.content.orientation);
    console.log('Base Up:', fontData.content.baseUp);
    console.log('Base Down:', fontData.content.baseDown);
    console.log('Number of shapes:', Object.keys(fontData.content.data).length);
    console.log('Available codes:', Object.keys(fontData.content.data).join(', '));
    console.log('----------------\n');

    // Example: Parse a simple text string
    const text = 'ABCDEF123';
    const size = 12;

    console.log(`Testing characters: ${text}`);
    console.log('----------------');

    // Get shapes for each character
    for (const char of text) {
      const code = char.charCodeAt(0);
      console.log(`\nCharacter '${char}' (code: ${code}):`);
      
      const shape = font.getCharShape(code, size);
      if (shape) {
        console.log('Shape found');
        console.log('Polylines:', shape.polylines.length);
        console.log('End point:', shape.lastPoint);
      } else {
        console.log('No shape found');
      }
    }

    // Clean up resources
    font.release();
  } catch (error) {
    if (error instanceof Error) {
      if (error.code === 'ENOENT') {
        console.error('Error: ISO.shx file not found in data folder');
      } else {
        console.error('Error:', error.message);
      }
    } else {
      console.error('An unknown error occurred');
    }
  }
}

// Run the example
main().catch(console.error);