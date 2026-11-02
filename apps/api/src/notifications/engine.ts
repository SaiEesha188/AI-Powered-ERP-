import {
  and,
  asc,
  automationRules,
  type Db,
  eq,
  gte,
  inArray,
  institutes,
  isNull,
  lt,
  lte,
  messageDeliveries,
  messages,
  notificationEvents,
  notInArray,
  organizations,
  plans,
  sql,
  type Executor,
  type Tx,
  withTenant,
} from '@erp/db';
import { MESSAGE_TEMPLATES, NOTIFICATION_EVENTS, type NotificationEventType, renderTemplate } from '@erp/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SmsSender } from '../auth/sms.js';
import { loadInstitute, localDate, nextLocalTime } from '../common/institute.js';
import { APP_DB, SYSTEM_DB } from '../core/core.module.js';
import { HANDLERS } from './recipients.js';
import { SendError, WhatsAppSender } from './whatsapp.js';

const MAX_ATTEMPTS = 3;
const BATCH = 100;
type Delivery = typeof messageDeliveries.$inferSelect;

/** Effective automation for an event: the institute's override, else the platform default. */
export async function ruleFor(tx: Tx, type: NotificationEventType) {
  const [row] = await tx.select({ enabled: automationRules.enabled, timing: automationRules.timing }).from(automationRules).where(eq(automationRules.event, type));
  return row ?? { enabled: true, timing: NOTIFICATION_EVENTS[type].defaultTiming };
}

/**
 * BRD §9.9. Events → (rules, recipients, language) → deliveries → WhatsApp or SMS, with retries,
 * SMS fallback, digests and quota checks. Safe to run from several processes: rows are claimed
 * with SKIP LOCKED.
 */
@Injectable()
export class NotificationEngine {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
    @Inject(APP_DB) private readonly appDb: Db,
    private readonly whatsapp: WhatsAppSender,
    private readonly sms: SmsSender,
  ) {}

  async runOnce(now = new Date()) {
    const events = await this.processEvents(now);
    const deliveries = await this.processDeliveries(now);
    return { events, deliveries };
  }

  async processEvents(now: Date): Promise<number> {
    return this.systemDb.transaction(async (stx) => {
      // NO KEY UPDATE (not UPDATE) so inserting messages that reference the event is not blocked.
      const batch = await stx
        .select()
        .from(notificationEvents)
        .where(isNull(notificationEvents.processedAt))
        .orderBy(asc(notificationEvents.createdAt))
        .limit(BATCH)
        .for('no key update', { skipLocked: true });
      for (const event of batch) {
        let error: string | null = null;
        try {
          await withTenant(this.appDb, { instituteId: event.instituteId, userId: event.actorId }, (tx) => this.expand(tx, event, now));
        } catch (e) {
          error = (e as Error).message;
          this.logger.error(`event ${event.id} (${event.type}) failed: ${error}`);
        }
        await stx.update(notificationEvents).set({ processedAt: now, error }).where(eq(notificationEvents.id, event.id));
      }
      return batch.length;
    });
  }

  private async expand(tx: Tx, event: typeof notificationEvents.$inferSelect, now: Date) {
    const type = event.type as NotificationEventType;
    const handler = HANDLERS[type];
    if (!handler) throw new Error(`No handler for event type ${event.type}`);
    const rule = await ruleFor(tx, type);
    if (!rule.enabled) return;

    const institute = await loadInstitute(tx, event.instituteId);
    const plan = await handler(tx, event.payload, institute);
    if (!plan.recipients.length) return;

    const timing = plan.forceImmediate ? 'immediate' : rule.timing;
    const scheduledFor = timing === 'digest' ? nextLocalTime(now, institute.settings.homeworkDigestTime, institute.timezone) : now;
    const day = localDate(institute.timezone, scheduledFor);
    const templateKey = NOTIFICATION_EVENTS[type].template;
    const [message] = await tx
      .insert(messages)
      .values({ instituteId: event.instituteId, eventId: event.id, eventType: type, templateKey, sourceType: plan.sourceType, sourceId: plan.sourceId })
      .returning({ id: messages.id });
    await tx.insert(messageDeliveries).values(
      plan.recipients.map((r) => ({
        instituteId: event.instituteId,
        messageId: message!.id,
        recipientUserId: r.userId,
        channel: r.channel,
        toAddress: r.phone,
        language: r.language,
        templateKey,
        variables: r.variables,
        // Only digests combine; the key is per recipient, per day, per channel.
        digestKey: timing === 'digest' && r.digestKey ? `${r.digestKey}:${day}:${r.channel}` : null,
        scheduledFor,
      })),
    );
  }

  async processDeliveries(now: Date): Promise<number> {
    return this.systemDb.transaction(async (stx) => {
      const due = await stx
        .select()
        .from(messageDeliveries)
        .where(and(eq(messageDeliveries.status, 'queued'), lte(messageDeliveries.scheduledFor, now)))
        .orderBy(asc(messageDeliveries.scheduledFor))
        .limit(BATCH)
        .for('update', { skipLocked: true });
      const groups = new Map<string, Delivery[]>();
      for (const d of due) {
        const key = d.digestKey ? `${d.recipientUserId}|${d.digestKey}` : d.id;
        groups.set(key, [...(groups.get(key) ?? []), d]);
      }
      const quota = new QuotaTracker(stx, now);
      for (const rows of groups.values()) {
        const first = rows[0]!;
        if (first.digestKey) {
          // Pull in digest items that did not fit in this batch, so one digest goes out, not two.
          rows.push(
            ...(await stx
              .select()
              .from(messageDeliveries)
              .where(
                and(
                  eq(messageDeliveries.status, 'queued'),
                  eq(messageDeliveries.digestKey, first.digestKey),
                  eq(messageDeliveries.recipientUserId, first.recipientUserId),
                  lte(messageDeliveries.scheduledFor, now),
                  notInArray(messageDeliveries.id, rows.map((r) => r.id)),
                ),
              )
              .for('update', { skipLocked: true })),
          );
        }
        await this.send(stx, rows, now, quota);
      }
      return due.length;
    });
  }

  private async send(stx: Tx, rows: Delivery[], now: Date, quota: QuotaTracker) {
    const first = rows[0]!;
    const template = MESSAGE_TEMPLATES[first.templateKey]!;
    const variables: Record<string, string> = { ...first.variables };
    if (rows.some((r) => r.variables.item)) {
      variables.items = rows.map((r, i) => (rows.length > 1 ? `${i + 1}) ${r.variables.item}` : r.variables.item)).join('; ');
    }
    const text = renderTemplate(first.templateKey, first.language, variables);
    const ids = rows.map((r) => r.id);
    const attempts = first.attempts + 1;
    try {
      let ref: string;
      if (first.channel === 'whatsapp') {
        if (!(await quota.take(first.instituteId))) throw new SendError('Monthly WhatsApp quota reached', true);
        ref = await this.whatsapp.send({ to: first.toAddress, template: template.whatsappName, language: first.language, params: template.params.map((p) => variables[p] ?? ''), text });
      } else {
        ref = await this.sms.sendText(first.toAddress, text);
      }
      await stx.update(messageDeliveries).set({ status: 'sent', providerRef: ref, sentAt: now, attempts, error: null }).where(inArray(messageDeliveries.id, ids));
    } catch (e) {
      const permanent = e instanceof SendError && e.permanent;
      const error = (e as Error).message;
      if (!permanent && attempts < MAX_ATTEMPTS) {
        const retryAt = new Date(now.getTime() + 2 ** attempts * 60_000);
        await stx.update(messageDeliveries).set({ attempts, error, scheduledFor: retryAt }).where(inArray(messageDeliveries.id, ids));
        return;
      }
      await stx.update(messageDeliveries).set({ status: 'failed', attempts, error }).where(inArray(messageDeliveries.id, ids));
      if (first.channel === 'whatsapp') {
        // §9.9: undelivered WhatsApp falls back to SMS.
        await stx.insert(messageDeliveries).values(
          rows.map((r) => ({
            instituteId: r.instituteId,
            messageId: r.messageId,
            recipientUserId: r.recipientUserId,
            channel: 'sms' as const,
            toAddress: r.toAddress,
            language: r.language,
            templateKey: r.templateKey,
            variables: r.variables,
            digestKey: r.digestKey ? `${r.digestKey}:fallback` : null,
            scheduledFor: now,
          })),
        );
      }
    }
  }
}

/** PLT-04: WhatsApp messages sent this calendar month per organization, against the plan quota. */
class QuotaTracker {
  private readonly orgOf = new Map<string, string>();
  private readonly orgs = new Map<string, { quota: number; used: number }>();

  constructor(
    private readonly stx: Tx,
    private readonly now: Date,
  ) {}

  /** Reserves one message; false when the organization's quota is used up. */
  async take(instituteId: string): Promise<boolean> {
    let orgId = this.orgOf.get(instituteId);
    if (!orgId) {
      const [plan] = await this.stx
        .select({ orgId: organizations.id, quota: plans.messageQuota })
        .from(institutes)
        .innerJoin(organizations, eq(organizations.id, institutes.organizationId))
        .leftJoin(plans, eq(plans.id, organizations.planId))
        .where(eq(institutes.id, instituteId));
      if (!plan) return false;
      orgId = plan.orgId;
      this.orgOf.set(instituteId, orgId);
      if (!this.orgs.has(orgId)) {
        this.orgs.set(orgId, { quota: plan.quota ?? Number.POSITIVE_INFINITY, used: await whatsappSent(this.stx, orgId, this.now) });
      }
    }
    const entry = this.orgs.get(orgId)!;
    if (entry.used >= entry.quota) return false;
    entry.used += 1;
    return true;
  }
}

/** WhatsApp messages an organization has sent in the calendar month containing `at`. */
export async function whatsappSent(tx: Executor, organizationId: string, at: Date): Promise<number> {
  const { from, to } = monthBounds(at);
  const [usage] = await tx
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(messageDeliveries)
    .innerJoin(institutes, eq(institutes.id, messageDeliveries.instituteId))
    .where(
      and(
        eq(institutes.organizationId, organizationId),
        eq(messageDeliveries.channel, 'whatsapp'),
        inArray(messageDeliveries.status, ['sent', 'delivered', 'read']),
        gte(messageDeliveries.sentAt, from),
        lt(messageDeliveries.sentAt, to),
      ),
    );
  return usage?.n ?? 0;
}

export function monthBounds(at: Date) {
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { from, to };
}
