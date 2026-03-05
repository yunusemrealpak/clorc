import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: async () => {
    // Copy dashboard HTML to dist
    mkdirSync(resolve('dist', 'dashboard'), { recursive: true });
    copyFileSync(
      resolve('src', 'dashboard', 'index.html'),
      resolve('dist', 'dashboard', 'index.html'),
    );
  },
});
