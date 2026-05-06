import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  
  build: {
    outDir: 'docs'
  },

  server: {
    fs: { strict: false },
  },
});