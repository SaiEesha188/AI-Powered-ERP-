import { Injectable, Logger } from '@nestjs/common';

/** SMS for login codes and as the fallback channel. A DLT-registered provider replaces the console sender in production. */
export abstract class SmsSender {
  abstract sendOtp(phone: string, code: string): Promise<void>;
  /** Returns the provider's message id. */
  abstract sendText(phone: string, text: string): Promise<string>;
}

@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  async sendOtp(phone: string, code: string) {
    this.logger.log(`OTP for ${phone}: ${code}`);
  }

  async sendText(phone: string, text: string) {
    this.logger.log(`To ${phone}: ${text}`);
    return `console-sms-${Date.now()}`;
  }
}
