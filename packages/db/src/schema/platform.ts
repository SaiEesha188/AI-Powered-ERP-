// Platform layer (ERD 1 + ERD 5 billing): plans, paying organizations and their institutes.
import type { InstituteSettings } from '@erp/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const organizationType = pgEnum('organization_type', ['trust', 'chain', 'coaching', 'college', 'company', 'other']);
export const organizationStatus = pgEnum('organization_status', ['trial', 'active', 'suspended', 'cancelled']);
export const vertical = pgEnum('vertical', ['school', 'coaching', 'college', 'skill', 'academy', 'corporate']);
export const instituteStatus = pgEnum('institute_status', ['active', 'suspended']);

export const plans = pgTable('plans', {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  name: text().notNull(),
  pricePerStudent: numeric('price_per_student', { precision: 10, scale: 2 }).notNull(),
  messageQuota: integer('message_quota').notNull(),
  aiCredits: integer('ai_credits').notNull().default(0),
  features: jsonb().$type<string[]>().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const organizations = pgTable('organizations', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  type: organizationType().notNull(),
  planId: uuid('plan_id').references(() => plans.id),
  status: organizationStatus().notNull().default('trial'),
  ...timestamps,
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    seats: integer().notNull(),
    startDate: date('start_date').notNull(),
    renewalDate: date('renewal_date').notNull(),
    ...timestamps,
  },
  (t) => [check('subscriptions_dates', sql`${t.renewalDate} > ${t.startDate}`)],
);

export const institutes = pgTable('institutes', {
  id: uuid().primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text().notNull(),
  vertical: vertical().notNull(),
  board: text(),
  subdomain: text().notNull().unique(),
  timezone: text().notNull().default('Asia/Kolkata'),
  settings: jsonb().$type<InstituteSettings>().notNull(),
  status: instituteStatus().notNull().default('active'),
  ...timestamps,
});
