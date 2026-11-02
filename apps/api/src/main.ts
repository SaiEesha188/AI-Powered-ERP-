import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule, configureApp } from './app.module.js';
import { loadConfig } from './config.js';

// Run from the repo root or apps/api; the .env file lives at the repo root.
for (const path of ['.env', '../../.env']) {
  if (existsSync(path)) {
    process.loadEnvFile(path);
    break;
  }
}

const config = loadConfig();
const app = configureApp(await NestFactory.create(AppModule, { rawBody: true }));
await app.listen(config.PORT);
console.log(`API listening on http://localhost:${config.PORT}`);
