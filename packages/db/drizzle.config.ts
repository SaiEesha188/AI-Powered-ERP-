import { defineConfig } from 'drizzle-kit';

// Reads the compiled schema so drizzle-kit does not need to resolve ESM ".js" imports in TS sources.
export default defineConfig({
  dialect: 'postgresql',
  schema: './dist/schema/index.js',
  out: './drizzle',
});
