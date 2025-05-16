import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'shx-parser',
      formats: ['es', 'cjs', 'umd'], // ES modules, CommonJS, and UMD
      fileName: (format) => `index.${format}.js`
    },
    sourcemap: true,
    rollupOptions: {
      external: [], // Add external dependencies here if any
      output: {
        globals: {} // Add global variable names for external dependencies if any
      }
    }
  },
  server: {
    open: '/examples/index.html', // Automatically open the viewer
    port: 3000
  }
}); 