import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { setupDatabase } from '@erp/db';

declare module 'vitest' {
  export interface ProvidedContext {
    testEnv: Record<string, string>;
  }
}

/** Points every URL at a separate <name>_test database, recreated on each run. */
function testUrl(url: string) {
  const u = new URL(url);
  u.pathname = `${u.pathname}_test`;
  return u.toString();
}

export default async function setup(project: TestProject) {
  if (existsSync('../../.env')) process.loadEnvFile('../../.env');
  const { ADMIN_DATABASE_URL, DATABASE_URL, SYSTEM_DATABASE_URL } = process.env;
  if (!ADMIN_DATABASE_URL || !DATABASE_URL || !SYSTEM_DATABASE_URL) {
    throw new Error('Database URLs missing; copy .env.example to .env at the repo root');
  }
  const testEnv = {
    NODE_ENV: 'test',
    DATABASE_URL: testUrl(DATABASE_URL),
    SYSTEM_DATABASE_URL: testUrl(SYSTEM_DATABASE_URL),
    JWT_SECRET: 'test-secret-that-is-at-least-thirty-two-characters',
    SMS_PROVIDER: 'console',
    NOTIFICATIONS_WORKER: 'off',
    WHATSAPP_APP_SECRET: 'test-whatsapp-app-secret',
    WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
    FILE_STORAGE_DIR: join(tmpdir(), 'erp-test-files'),
  };
  await setupDatabase({
    adminUrl: ADMIN_DATABASE_URL,
    appUrl: testEnv.DATABASE_URL,
    systemUrl: testEnv.SYSTEM_DATABASE_URL,
    reset: true,
  });
  project.provide('testEnv', testEnv);
}
