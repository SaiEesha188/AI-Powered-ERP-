import {
  and,
  announcementAttachments,
  announcementAudiences,
  announcementRecipients,
  announcements,
  asc,
  classes,
  desc,
  eq,
  inArray,
  sections,
  sql,
  staff,
  type Tx,
  userRoles,
  users,
} from '@erp/db';
import { type AudienceInput, AppError, type CreateCircularInput, createCircularSchema, decideEventSchema, listCircularsQuerySchema } from '@erp/shared';
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { AcademicsModule } from '../academics/academics.module.js';
import { TeachingScope } from '../academics/teaching-scope.js';
import { RequireInstitute, RequirePermissions } from '../common/decorators.js';
import { loadInstitute } from '../common/institute.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { CONFIG, type Config } from '../config.js';
import { AuditService, TenantDb } from '../core/core.module.js';
import { FilesService } from '../files/files.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { enrolledStudentIds, guardiansOfStudents } from '../notifications/recipients.js';

const columns = {
  id: announcements.id,
  type: announcements.type,
  title: announcements.title,
  body: announcements.body,
  requiresAck: announcements.requiresAck,
  status: announcements.status,
  createdBy: announcements.createdBy,
  publishedAt: announcements.publishedAt,
  createdAt: announcements.createdAt,
};

/** Circulars and notices (COM-01) with read receipts and acknowledgement (COM-03). */
@Injectable()
export class CircularsService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly tenantDb: TenantDb,
    private readonly scope: TeachingScope,
    private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  create(input: CreateCircularInput) {
    return this.tenantDb.run(async (tx) => {
      const { instituteId, userId } = currentTenant();
      await this.assertAudiences(tx, input.audiences);
      await this.files.assertExist(tx, input.fileIds);
      const [row] = await tx
        .insert(announcements)
        .values({ instituteId, type: input.type, title: input.title, body: input.body, requiresAck: input.requiresAck, createdBy: userId })
        .returning({ id: announcements.id });
      const id = row!.id;
      await tx.insert(announcementAudiences).values(input.audiences.map((a) => ({ instituteId, announcementId: id, audienceType: a.type, refId: a.refId ?? null })));
      if (input.fileIds.length) {
        await tx.insert(announcementAttachments).values([...new Set(input.fileIds)].map((fileId) => ({ instituteId, announcementId: id, fileId })));
      }
      await this.audit.record(tx, { action: 'circular.create', entity: 'circular', entityId: id, after: input });
      if (input.publish) await this.submit(tx, id);
      return this.detail(tx, id);
    });
  }

  publish(id: string) {
    return this.tenantDb.run(async (tx) => {
      const circular = await this.find(tx, id);
      if (circular.createdBy !== currentTenant().userId && !currentContext().permissions.has('comms.approve')) {
        throw new AppError('forbidden', 'Only the author or an approver can publish this');
      }
      if (circular.status !== 'draft') throw new AppError('conflict', `Already ${circular.status.replace('_', ' ')}`);
      await this.submit(tx, id);
      return this.detail(tx, id);
    });
  }

  decide(id: string, decision: 'approve' | 'reject') {
    return this.tenantDb.run(async (tx) => {
      const circular = await this.find(tx, id);
      if (circular.status !== 'pending_approval') throw new AppError('conflict', 'Not waiting for approval');
      if (decision === 'approve') await this.release(tx, id, currentTenant().userId);
      else await tx.update(announcements).set({ status: 'draft' }).where(eq(announcements.id, id));
      await this.audit.record(tx, { action: `circular.${decision}`, entity: 'circular', entityId: id });
      return this.detail(tx, id);
    });
  }

  list(status?: string) {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({
          ...columns,
          recipients: sql<number>`(select count(*) from announcement_recipients r where r.announcement_id = ${announcements.id})`.mapWith(Number),
          read: sql<number>`(select count(*) from announcement_recipients r where r.announcement_id = ${announcements.id} and r.read_at is not null)`.mapWith(Number),
          acknowledged: sql<number>`(select count(*) from announcement_recipients r where r.announcement_id = ${announcements.id} and r.acknowledged_at is not null)`.mapWith(Number),
        })
        .from(announcements)
        .where(status ? eq(announcements.status, status as 'draft') : undefined)
        .orderBy(desc(announcements.createdAt));
      return rows;
    });
  }

  get(id: string) {
    return this.tenantDb.run((tx) => this.detail(tx, id));
  }

  /** Everything published to the caller, staff or parent alike. */
  inbox() {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ ...columns, readAt: announcementRecipients.readAt, acknowledgedAt: announcementRecipients.acknowledgedAt })
        .from(announcementRecipients)
        .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
        .where(and(eq(announcementRecipients.userId, currentTenant().userId), eq(announcements.status, 'published')))
        .orderBy(desc(announcements.publishedAt));
      const out = [];
      for (const r of rows) out.push({ ...r, attachments: await this.attachments(tx, r.id) });
      return out;
    });
  }

  markRead(id: string, acknowledge: boolean) {
    return this.tenantDb.run(async (tx) => {
      const { userId } = currentTenant();
      const [row] = await tx
        .select({ requiresAck: announcements.requiresAck, readAt: announcementRecipients.readAt })
        .from(announcementRecipients)
        .innerJoin(announcements, eq(announcements.id, announcementRecipients.announcementId))
        .where(and(eq(announcementRecipients.announcementId, id), eq(announcementRecipients.userId, userId), eq(announcements.status, 'published')));
      if (!row) throw new AppError('not_found', 'Circular not found');
      if (acknowledge && !row.requiresAck) throw new AppError('invalid', 'This circular does not ask for acknowledgement');
      const now = new Date();
      await tx
        .update(announcementRecipients)
        .set({ readAt: sql`coalesce(${announcementRecipients.readAt}, ${now})`, acknowledgedAt: acknowledge ? sql`coalesce(${announcementRecipients.acknowledgedAt}, ${now})` : undefined })
        .where(and(eq(announcementRecipients.announcementId, id), eq(announcementRecipients.userId, userId)));
      return { ok: true };
    });
  }

  /** Publish now, or queue for approval when the institute requires it. */
  private async submit(tx: Tx, id: string) {
    const { settings } = await loadInstitute(tx);
    if (settings.circularApprovalRequired && !currentContext().permissions.has('comms.approve')) {
      await tx.update(announcements).set({ status: 'pending_approval' }).where(eq(announcements.id, id));
      return;
    }
    await this.release(tx, id, null);
  }

  /** Fixes the recipient list, marks the circular published and queues the notification. */
  private async release(tx: Tx, id: string, approvedBy: string | null) {
    const { instituteId } = currentTenant();
    const audiences = await tx
      .select({ type: announcementAudiences.audienceType, refId: announcementAudiences.refId })
      .from(announcementAudiences)
      .where(eq(announcementAudiences.announcementId, id));
    const recipients = await this.resolve(tx, audiences.map((a) => ({ type: a.type, refId: a.refId ?? undefined })));
    if (recipients.size) {
      await tx
        .insert(announcementRecipients)
        .values([...recipients].map(([userId, kind]) => ({ instituteId, announcementId: id, userId, kind })))
        .onConflictDoNothing();
    }
    await tx.update(announcements).set({ status: 'published', publishedAt: new Date(), approvedBy }).where(eq(announcements.id, id));
    await this.notifications.emit(tx, 'circular.published', { announcementId: id, link: `${this.config.PUBLIC_APP_URL}/inbox/${id}` });
    await this.audit.record(tx, { action: 'circular.publish', entity: 'circular', entityId: id, after: { recipients: recipients.size } });
  }

  /** userId → "staff" | "parent". */
  private async resolve(tx: Tx, audiences: AudienceInput[]) {
    const out = new Map<string, string>();
    const addStaff = async (userIds?: string[]) => {
      const rows = await tx
        .select({ userId: staff.userId })
        .from(staff)
        .where(and(eq(staff.status, 'active'), userIds ? inArray(staff.userId, userIds) : undefined));
      for (const r of rows) out.set(r.userId, 'staff');
    };
    const addParents = async (filter: { classIds?: string[]; sectionIds?: string[] }) => {
      for (const g of await guardiansOfStudents(tx, await enrolledStudentIds(tx, filter))) if (!out.has(g.userId)) out.set(g.userId, 'parent');
    };
    for (const a of audiences) {
      if (a.type === 'all' || a.type === 'staff') await addStaff();
      if (a.type === 'all' || a.type === 'parents') await addParents({});
      if (a.type === 'class') await addParents({ classIds: [a.refId!] });
      if (a.type === 'section') await addParents({ sectionIds: [a.refId!] });
      if (a.type === 'user') {
        await addStaff([a.refId!]);
        if (!out.has(a.refId!)) out.set(a.refId!, 'parent');
      }
    }
    return out;
  }

  /** Refs must exist here; teachers may address only sections they teach. */
  private async assertAudiences(tx: Tx, audiences: AudienceInput[]) {
    const held = currentContext().permissions;
    const institutionWide = held.has('comms.approve') || held.has('academics.manage');
    for (const a of audiences) {
      if (!institutionWide && !(a.type === 'section' && (await this.scope.teachesSection(tx, a.refId!)))) {
        throw new AppError('forbidden', 'You can send circulars only to sections you teach');
      }
      if (a.type === 'class' && !(await tx.select({ id: classes.id }).from(classes).where(eq(classes.id, a.refId!))).length) throw new AppError('invalid', 'Unknown class');
      if (a.type === 'section' && !(await tx.select({ id: sections.id }).from(sections).where(eq(sections.id, a.refId!))).length) throw new AppError('invalid', 'Unknown section');
      if (a.type === 'user') {
        const [member] = await tx
          .select({ id: userRoles.id })
          .from(userRoles)
          .where(and(eq(userRoles.userId, a.refId!), eq(userRoles.instituteId, currentTenant().instituteId)))
          .limit(1);
        if (!member) throw new AppError('invalid', 'Unknown person');
      }
    }
  }

  private async detail(tx: Tx, id: string) {
    const circular = await this.find(tx, id);
    const audiences = await tx
      .select({ type: announcementAudiences.audienceType, refId: announcementAudiences.refId })
      .from(announcementAudiences)
      .where(eq(announcementAudiences.announcementId, id));
    const receipts = await tx
      .select({
        userId: announcementRecipients.userId,
        name: users.name,
        kind: announcementRecipients.kind,
        readAt: announcementRecipients.readAt,
        acknowledgedAt: announcementRecipients.acknowledgedAt,
      })
      .from(announcementRecipients)
      .innerJoin(users, eq(users.id, announcementRecipients.userId))
      .where(eq(announcementRecipients.announcementId, id))
      .orderBy(asc(users.name));
    return {
      ...circular,
      audiences,
      attachments: await this.attachments(tx, id),
      summary: {
        recipients: receipts.length,
        read: receipts.filter((r) => r.readAt).length,
        acknowledged: receipts.filter((r) => r.acknowledgedAt).length,
      },
      receipts,
    };
  }

  private async attachments(tx: Tx, id: string) {
    const rows = await tx.select({ fileId: announcementAttachments.fileId }).from(announcementAttachments).where(eq(announcementAttachments.announcementId, id));
    return this.files.links(tx, rows.map((r) => r.fileId));
  }

  private async find(tx: Tx, id: string) {
    const [row] = await tx.select(columns).from(announcements).where(eq(announcements.id, id));
    if (!row) throw new AppError('not_found', 'Circular not found');
    return row;
  }
}

@Controller('circulars')
export class CircularsController {
  constructor(private readonly circulars: CircularsService) {}

  @Get()
  @RequirePermissions('comms.view')
  list(@Query(new ZodPipe(listCircularsQuerySchema)) q: z.infer<typeof listCircularsQuerySchema>) {
    return this.circulars.list(q.status);
  }

  @Post()
  @RequirePermissions('comms.send')
  create(@Body(new ZodPipe(createCircularSchema)) body: CreateCircularInput) {
    return this.circulars.create(body);
  }

  @Get(':id')
  @RequirePermissions('comms.view')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.circulars.get(id);
  }

  @Post(':id/publish')
  @RequirePermissions('comms.send')
  @HttpCode(200)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.circulars.publish(id);
  }

  @Post(':id/decision')
  @RequirePermissions('comms.approve')
  @HttpCode(200)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(decideEventSchema)) body: z.infer<typeof decideEventSchema>) {
    return this.circulars.decide(id, body.decision);
  }
}

/** Every member's circulars: parents and staff alike. */
@Controller('inbox')
export class InboxController {
  constructor(private readonly circulars: CircularsService) {}

  @Get()
  @RequireInstitute()
  list() {
    return this.circulars.inbox();
  }

  @Post(':id/read')
  @RequireInstitute()
  @HttpCode(200)
  read(@Param('id', ParseUUIDPipe) id: string) {
    return this.circulars.markRead(id, false);
  }

  /** COM-03 consent: "I agree". */
  @Post(':id/acknowledge')
  @RequireInstitute()
  @HttpCode(200)
  acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.circulars.markRead(id, true);
  }
}

@Module({
  imports: [AcademicsModule],
  controllers: [CircularsController, InboxController],
  providers: [CircularsService],
})
export class CircularsModule {}

