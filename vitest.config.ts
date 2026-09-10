import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@obsidian-citation/shared': resolve(__dirname, 'shared/src/index.ts')
    }
  }
});
