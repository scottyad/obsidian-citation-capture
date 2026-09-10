import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

function copyManifestPlugin() {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const manifestSrc = resolve(__dirname, 'manifest.json');
      const manifestDist = resolve(__dirname, 'dist/manifest.json');
      if (fs.existsSync(manifestSrc)) {
        const content = fs.readFileSync(manifestSrc, 'utf-8');
        fs.writeFileSync(manifestDist, content, 'utf-8');
        console.log('Copied manifest.json to dist/');
      }
    }
  };
}

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        options: resolve(__dirname, 'src/options/options.html'),
        background: resolve(__dirname, 'src/background.ts'),
        content: resolve(__dirname, 'src/content.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'background.js';
          if (chunkInfo.name === 'content') return 'content.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@obsidian-citation/shared': resolve(__dirname, '../shared/src/index.ts')
    }
  },
  plugins: [copyManifestPlugin()]
});
