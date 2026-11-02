import { notificationEvents, type Tx } from '@erp/db';
import type { NotificationEventType } from '@erp/shared';
import { Injectable } from '@nestjs/common';
import { currentTenant } from '../common/request-context.js';

/**
 * The outbox. Call inside the transaction that makes the change, so a notification is queued
 * if and only if the change commits. The worker does the rest.
 */
@Injectable()
export class NotificationsService {
  async emit(tx: Tx, type: NotificationEventType, payload: Record<string, unknown>) {
    const { instituteId, userId } = currentTenant();
    await tx.insert(notificationEvents).values({ instituteId, actorId: userId, type, payload });
  }
}
