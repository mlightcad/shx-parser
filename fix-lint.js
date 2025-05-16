import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixFile = (filePath) => {
  const content = readFileSync(filePath, 'utf8');
  
  // Fix loose equality comparisons
  let newContent = content.replace(/([^=!])==([^=])/g, '$1===$2');
  newContent = newContent.replace(/([^=!])!=([^=])/g, '$1!==$2');
  
  // Remove console.log statements
  newContent = newContent.replace(/console\.(log|error|warn|debug|info)\((.*?)\);?\n?/g, '');
  
  // Fix case declarations by moving them before the switch
  newContent = newContent.replace(
    /(case [^:]+:)\s*(?:const|let) ([^;]+);/g,
    'const $2;\n$1'
  );
  
  if (content !== newContent) {
    writeFileSync(filePath, newContent);
    console.log(`Fixed ${filePath}`);
  }
};

const files = [
  'src/shapeParser.ts',
  'src/contentParser.ts',
  'src/byteEncoder.ts',
  'src/fontData.ts',
  'src/point.ts'
];

files.forEach(file => fixFile(join(__dirname, file))); 