// Usage (from the repo root): pnpm db:setup
import { existsSync } from 'node:fs';
import { setupDatabase } from '../setup.js';

if (existsSync('.env')) process.loadEnvFile('.env');

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

await setupDatabase({
  adminUrl: required('ADMIN_DATABASE_URL'),
  appUrl: required('DATABASE_URL'),
  systemUrl: required('SYSTEM_DATABASE_URL'),
  log: (msg) => console.log(msg),
});
console.log('database ready');
