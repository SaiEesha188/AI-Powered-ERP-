// Circulars and notices (COM-01, COM-03). Recipients are fixed when a circular is published, so
// read receipts and "I agree" acknowledgements can be tracked per person.
import { boolean, foreignKey, index, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { files } from './homework.js';
import { users } from './identity.js';
import { institutes, timestamps } from './platform.js';

export const announcementType = pgEnum('announcement_type', ['circular', 'notice']);
export const announcementStatus = pgEnum('announcement_status', ['draft', 'pending_approval', 'published']);
export const audienceType = pgEnum('audience_type', ['all', 'staff', 'parents', 'class', 'section', 'user']);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    type: announcementType().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    requiresAck: boolean('requires_ack').notNull().default(false),
    status: announcementStatus().notNull().default('draft'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique('announcements_id_institute').on(t.id, t.instituteId), index('announcements_institute_status').on(t.instituteId, t.status)],
);

export const announcementAudiences = pgTable(
  'announcement_audiences',
  {
    id: uuid().primaryKey().defaultRandom(),
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').notNull(),
    audienceType: audienceType('audience_type').notNull(),
    /** Class, section or user id, depending on audience_type. */
    refId: uuid('ref_id'),
  },
  (t) => [
    foreignKey({ name: 'announcement_audiences_announcement_fk', columns: [t.announcementId, t.instituteId], foreignColumns: [announcements.id, announcements.instituteId] }).onDelete('cascade'),
  ],
);

export const announcementAttachments = pgTable(
  'announcement_attachments',
  {
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').notNull(),
    fileId: uuid('file_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.fileId] }),
    foreignKey({ name: 'announcement_attachments_announcement_fk', columns: [t.announcementId, t.instituteId], foreignColumns: [announcements.id, announcements.instituteId] }).onDelete('cascade'),
    foreignKey({ name: 'announcement_attachments_file_fk', columns: [t.fileId, t.instituteId], foreignColumns: [files.id, files.instituteId] }),
  ],
);

export const announcementRecipients = pgTable(
  'announcement_recipients',
  {
    instituteId: uuid('institute_id')
      .notNull()
      .references(() => institutes.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** staff or parent: how this person was reached, for reports. */
    kind: text().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.announcementId, t.userId] }),
    foreignKey({ name: 'announcement_recipients_announcement_fk', columns: [t.announcementId, t.instituteId], foreignColumns: [announcements.id, announcements.instituteId] }).onDelete('cascade'),
    index('announcement_recipients_user').on(t.userId),
  ],
);
