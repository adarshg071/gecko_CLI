import { defineConfig, Plugin } from 'vitest/config';
import path from 'path';
import fs from 'fs';

/**
 * Vite plugin: resolve .js imports to .ts when the .ts file exists.
 * This is needed because TypeScript ESM convention uses .js extensions in imports,
 * but the actual files are .ts when running under Vitest without a build step.
 */
function resolveJsToTs(): Plugin {
  return {
    name: 'resolve-js-to-ts',
    enforce: 'pre',
    resolveId(source: string, importer?: string) {
      if (!source.endsWith('.js') || !importer) return null;
      const tsPath = path.resolve(path.dirname(importer), source.replace(/\.js$/, '.ts'));
      if (fs.existsSync(tsPath)) return tsPath;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [resolveJsToTs()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  optimizeDeps: {
    exclude: ['node:sqlite'],
  },
});
