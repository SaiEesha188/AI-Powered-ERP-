import {
  and,
  asc,
  automationRules,
  type Db,
  desc,
  eq,
  gte,
  inArray,
  institutes,

  lt,
  messageDeliveries,
  messages,
  ne,
  organizations,
  plans,
  sql,
  users,
} from '@erp/db';
import {
  AppError,
  type ListDeliveriesQuery,
  listDeliveriesQuerySchema,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_EVENTS,
  type NotificationEventType,
  type UpdateAutomationRuleInput,
  updateAutomationRuleSchema,
  usageQuerySchema,
} from '@erp/shared';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  type RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { z } from 'zod';
import { PlatformAdmin, Public, RequirePermissions } from '../common/decorators.js';
import { currentTenant } from '../common/request-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CONFIG, type Config } from '../config.js';
import { AuditService, SYSTEM_DB, TenantDb } from '../core/core.module.js';
import { monthBounds, ruleFor, whatsappSent } from './engine.js';

const monthStart = (month: string) => new Date(`${month}-01T00:00:00Z`);

/** COM-08: what was sent to whom, and how far it got. */
@Controller('messages')
export class MessagesController {
  constructor(private readonly tenantDb: TenantDb) {}

  @Get()
  @RequirePermissions('comms.view')
  list(@Query(new ZodPipe(listDeliveriesQuerySchema)) q: ListDeliveriesQuery) {
    return this.tenantDb.run((tx) =>
      tx
        .select({
          id: messageDeliveries.id,
          eventType: messages.eventType,
          sourceType: messages.sourceType,
          sourceId: messages.sourceId,
          recipientUserId: messageDeliveries.recipientUserId,
          recipientName: users.name,
          channel: messageDeliveries.channel,
          toAddress: messageDeliveries.toAddress,
          templateKey: messageDeliveries.templateKey,
          variables: messageDeliveries.variables,
          status: messageDeliveries.status,
          attempts: messageDeliveries.attempts,
          error: messageDeliveries.error,
          scheduledFor: messageDeliveries.scheduledFor,
          sentAt: messageDeliveries.sentAt,
          deliveredAt: messageDeliveries.deliveredAt,
          readAt: messageDeliveries.readAt,
          createdAt: messageDeliveries.createdAt,
        })
        .from(messageDeliveries)
        .innerJoin(messages, eq(messages.id, messageDeliveries.messageId))
        .innerJoin(users, eq(users.id, messageDeliveries.recipientUserId))
        .where(
          and(
            q.eventType ? eq(messages.eventType, q.eventType) : undefined,
            q.status ? eq(messageDeliveries.status, q.status) : undefined,
            q.before ? lt(messageDeliveries.createdAt, new Date(q.before)) : undefined,
          ),
        )
        .orderBy(desc(messageDeliveries.createdAt))
        .limit(q.limit),
    );
  }

  /** Delivery counts by channel and status for a month, plus the organization's WhatsApp quota. */
  @Get('usage')
  @RequirePermissions('comms.view')
  usage(@Query(new ZodPipe(usageQuerySchema)) q: z.infer<typeof usageQuerySchema>) {
    return this.tenantDb.run(async (tx) => {
      const { from, to } = monthBounds(monthStart(q.month));
      const rows = await tx
        .select({ channel: messageDeliveries.channel, status: messageDeliveries.status, n: sql<number>`count(*)`.mapWith(Number) })
        .from(messageDeliveries)
        .where(and(gte(messageDeliveries.createdAt, from), lt(messageDeliveries.createdAt, to)))
        .groupBy(messageDeliveries.channel, messageDeliveries.status);
      const [plan] = await tx
        .select({ quota: plans.messageQuota })
        .from(institutes)
        .innerJoin(organizations, eq(organizations.id, institutes.organizationId))
        .innerJoin(plans, eq(plans.id, organizations.planId))
        .where(eq(institutes.id, currentTenant().instituteId));
      return { month: q.month, byChannel: rows, whatsappQuota: plan?.quota ?? null };
    });
  }
}

/** COM-04: switch default automations on or off, or move them to the daily digest. */
@Controller('automation-rules')
export class AutomationRulesController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('comms.view')
  list() {
    return this.tenantDb.run(async (tx) => {
      // Sequential: a transaction is one connection, which runs one query at a time.
      const rules = [];
      for (const event of NOTIFICATION_EVENT_TYPES) {
        rules.push({ event, label: NOTIFICATION_EVENTS[event].label, defaultTiming: NOTIFICATION_EVENTS[event].defaultTiming, ...(await ruleFor(tx, event)) });
      }
      return rules;
    });
  }

  @Put(':event')
  @RequirePermissions('institute.settings.manage')
  update(@Param('event') event: string, @Body(new ZodPipe(updateAutomationRuleSchema)) body: UpdateAutomationRuleInput) {
    if (!(NOTIFICATION_EVENT_TYPES as string[]).includes(event)) throw new AppError('not_found', 'Unknown event');
    return this.tenantDb.run(async (tx) => {
      const before = await ruleFor(tx, event as NotificationEventType);
      await tx
        .insert(automationRules)
        .values({ instituteId: currentTenant().instituteId, event, ...body })
        .onConflictDoUpdate({ target: [automationRules.instituteId, automationRules.event], set: { ...body, updatedAt: new Date() } });
      await this.audit.record(tx, { action: 'automation_rule.update', entity: 'automation_rule', before: { event, ...before }, after: { event, ...body } });
      return { event, ...body };
    });
  }
}

const STATUS_RANK = { queued: 0, sent: 1, delivered: 2, read: 3 } as const;

interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: string;
  errors?: { title?: string; message?: string }[];
}

/** WhatsApp Cloud API webhook: delivery and read receipts (COM-08). */
@Public()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(SYSTEM_DB) private readonly db: Db,
  ) {}

  /** Meta's subscription handshake. */
  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    if (!this.config.WHATSAPP_VERIFY_TOKEN || mode !== 'subscribe' || token !== this.config.WHATSAPP_VERIFY_TOKEN) throw new ForbiddenException();
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>) {
    const secret = this.config.WHATSAPP_APP_SECRET;
    if (!secret) throw new ServiceUnavailableException('WhatsApp webhook is not configured');
    const signature = req.get('x-hub-signature-256') ?? '';
    const expected = `sha256=${createHmac('sha256', secret).update(req.rawBody ?? Buffer.alloc(0)).digest('hex')}`;
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new ForbiddenException('Bad signature');

    const body = req.body as { entry?: { changes?: { value?: { statuses?: MetaStatus[] } }[] }[] };
    const statuses = (body.entry ?? []).flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.statuses ?? []);
    for (const s of statuses) await this.apply(s);
    return { received: statuses.length };
  }

  private async apply(s: MetaStatus) {
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
    if (s.status === 'failed') {
      // A failure reported after delivery is noise; only fail messages not yet delivered.
      await this.db
        .update(messageDeliveries)
        .set({ status: 'failed', error: s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? 'failed' })
        .where(and(eq(messageDeliveries.providerRef, s.id), inArray(messageDeliveries.status, ['queued', 'sent'])));
      return;
    }
    // Receipts can arrive out of order; never move a message backwards (read → delivered).
    const status = s.status;
    const lower = (Object.keys(STATUS_RANK) as (keyof typeof STATUS_RANK)[]).filter((k) => STATUS_RANK[k] < STATUS_RANK[status]);
    await this.db
      .update(messageDeliveries)
      .set({
        status,
        deliveredAt: status === 'delivered' || status === 'read' ? sql`coalesce(${messageDeliveries.deliveredAt}, ${at})` : undefined,
        readAt: status === 'read' ? at : undefined,
      })
      .where(and(eq(messageDeliveries.providerRef, s.id), inArray(messageDeliveries.status, lower), ne(messageDeliveries.channel, 'sms')));
  }
}

/** PLT-04: WhatsApp usage against quota for every organization; warn at 80%, stop at 100%. */
@PlatformAdmin()
@Controller('platform/usage')
export class PlatformUsageController {
  constructor(@Inject(SYSTEM_DB) private readonly db: Db) {}

  @Get()
  async list(@Query(new ZodPipe(usageQuerySchema)) q: z.infer<typeof usageQuerySchema>) {
    const orgs = await this.db
      .select({ id: organizations.id, name: organizations.name, plan: plans.code, quota: plans.messageQuota })
      .from(organizations)
      .leftJoin(plans, eq(plans.id, organizations.planId))
      .orderBy(asc(organizations.name));
    return Promise.all(
      orgs.map(async (o) => {
        const used = await whatsappSent(this.db, o.id, monthStart(q.month));
        const percent = o.quota ? Math.round((used / o.quota) * 1000) / 10 : null;
        return { ...o, used, percent, alert: percent === null ? null : percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : null };
      }),
    );
  }
}
