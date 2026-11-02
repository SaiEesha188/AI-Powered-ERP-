// Notification engine (M15, ERD 5, BRD §9.9). Modules write events to an outbox in the same
// transaction as the change; a worker turns events into deliveries and sends them. The
// deliveries table is itself the job queue (claimed with FOR UPDATE SKIP LOCKED).
import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';

export const notificationTiming = pgEnum('notification_timing', ['immediate', 'digest']);
export const deliveryChannel = pgEnum('delivery_channel', ['whatsapp', 'sms', 'push']);
export const deliveryStatus = pgEnum('delivery_status', ['queued', 'sent', 'delivered', 'read', 'failed', 'skipped']);

export const notificationEvents = pgTable(
  'notification_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text(),
  },
  (t) => [index('notification_events_pending').on(t.createdAt).where(sql`processed_at is null`)],
);

/** Per-institute overrides of the default automations (COM-04). No row = platform default. */
export const automationRules = pgTable(
  'automation_rules',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    event: text().notNull(),
    enabled: boolean().notNull(),
    timing: notificationTiming().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('automation_rules_institute_event').on(t.instituteId, t.event)],
);

/** One message per event (e.g. one circular), fanned out to many deliveries. */
export const messages = pgTable(
  'messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => notificationEvents.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    templateKey: text('template_key').notNull(),
    /** What the message is about, e.g. ('circular', id), for reach reports. */
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('messages_id_institute').on(t.id, t.instituteId), index('messages_source').on(t.sourceType, t.sourceId)],
);

export const messageDeliveries = pgTable(
  'message_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id),
    channel: deliveryChannel().notNull(),
    toAddress: text('to_address').notNull(),
    language: text().notNull(),
    templateKey: text('template_key').notNull(),
    variables: jsonb().$type<Record<string, string>>().notNull(),
    /** Deliveries sharing a key are combined into one message (BR-12 digests). */
    digestKey: text('digest_key'),
    status: deliveryStatus().notNull().default('queued'),
    attempts: integer().notNull().default(0),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
    providerRef: text('provider_ref'),
    error: text(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({ name: 'message_deliveries_message_fk', columns: [t.messageId, t.instituteId], foreignColumns: [messages.id, messages.instituteId] }).onDelete('cascade'),
    index('message_deliveries_due').on(t.scheduledFor).where(sql`status = 'queued'`),
    index('message_deliveries_provider_ref').on(t.providerRef),
    index('message_deliveries_institute_created').on(t.instituteId, t.createdAt),
    index('message_deliveries_digest').on(t.digestKey),
  ],
);
