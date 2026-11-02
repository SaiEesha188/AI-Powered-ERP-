import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // esbuild cannot emit decorator metadata, which Nest's dependency injection needs.
  plugins: [swc.vite({ jsc: { target: 'es2023' }, module: { type: 'es6' } })],
  resolve: {
    alias: {
      '@erp/shared': src('../../packages/shared/src/index.ts'),
      '@erp/db': src('../../packages/db/src/index.ts'),
    },
  },
  test: {
    globalSetup: ['test/global-setup.ts'],
    // Test files share one database; each creates its own tenants, but running files one at a
    // time keeps failures easy to read.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
