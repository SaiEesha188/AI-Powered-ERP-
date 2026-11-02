import { Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { NotificationEngine } from './engine.js';
import {
  AutomationRulesController,
  MessagesController,
  PlatformUsageController,
  WhatsAppWebhookController,
} from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { ConsoleWhatsAppSender, MetaWhatsAppSender, WhatsAppSender } from './whatsapp.js';
import { NotificationWorker } from './worker.js';

@Global()
@Module({
  controllers: [MessagesController, AutomationRulesController, WhatsAppWebhookController, PlatformUsageController],
  providers: [
    NotificationsService,
    NotificationEngine,
    NotificationWorker,
    {
      provide: WhatsAppSender,
      inject: [CONFIG],
      useFactory: (config: Config) => (config.WHATSAPP_PROVIDER === 'meta' ? new MetaWhatsAppSender(config) : new ConsoleWhatsAppSender()),
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
