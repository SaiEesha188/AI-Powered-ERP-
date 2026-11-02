// Append-only audit log (USR-08, NFR auditability). The app role can insert and read but never
// update or delete; see the grants in the RLS migration.
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { institutes } from './platform.js';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Null for platform-level events such as logins and tenant creation.
    instituteId: uuid('institute_id').references(() => institutes.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: uuid('entity_id'),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_institute_at').on(t.instituteId, t.at), index('audit_logs_entity').on(t.entity, t.entityId)],
);
