import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { CONFIG, type Config } from '../config.js';
import { NotificationEngine } from './engine.js';

/** Runs the engine every few seconds inside the API process. Split into its own process when load requires. */
@Injectable()
export class NotificationWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('NotificationWorker');
  private timer?: NodeJS.Timeout;
  private running?: Promise<unknown>;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly engine: NotificationEngine,
  ) {}

  onApplicationBootstrap() {
    if (this.config.NOTIFICATIONS_WORKER === 'off') return;
    this.timer = setInterval(() => void this.tick(), 2_000);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
  }

  private async tick() {
    if (this.running) return;
    this.running = this.engine.runOnce().catch((e: Error) => this.logger.error(e.stack ?? e.message));
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }
}
