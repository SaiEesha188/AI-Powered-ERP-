export * from './schema/index.js';
export * from './client.js';
export * from './provisioning.js';
export { setupDatabase, type SetupOptions } from './setup.js';
// Query helpers re-exported so consumers share this package's drizzle-orm instance.
export { and, asc, count, desc, eq, exists, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, notExists, notInArray, or, sql } from 'drizzle-orm';
