import { Injectable, Logger } from '@nestjs/common';
import type { Config } from '../config.js';

export interface WhatsAppMessage {
  /** E.164, e.g. +919876543210. */
  to: string;
  template: string;
  language: string;
  /** Values for the template's positional parameters. */
  params: string[];
  /** The rendered text, for logs and the console sender. */
  text: string;
}

/** permanent = retrying will not help (bad number, template not approved); fall back to SMS. */
export class SendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export abstract class WhatsAppSender {
  /** Returns the provider's message id, used to match delivery webhooks. */
  abstract send(message: WhatsAppMessage): Promise<string>;
}

@Injectable()
export class ConsoleWhatsAppSender extends WhatsAppSender {
  private readonly logger = new Logger('WhatsApp');

  async send(message: WhatsAppMessage) {
    this.logger.log(`To ${message.to} [${message.template}/${message.language}]: ${message.text}`);
    return `console-wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** WhatsApp Business Cloud API (Meta). Template messages only, as required outside a 24h chat window. */
export class MetaWhatsAppSender extends WhatsAppSender {
  constructor(
    private readonly config: Pick<Config, 'WHATSAPP_TOKEN' | 'WHATSAPP_PHONE_NUMBER_ID' | 'WHATSAPP_GRAPH_VERSION'>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  async send(message: WhatsAppMessage) {
    const url = `https://graph.facebook.com/${this.config.WHATSAPP_GRAPH_VERSION}/${this.config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.config.WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: message.template,
            language: { code: message.language },
            components: [{ type: 'body', parameters: message.params.map((text) => ({ type: 'text', text: sanitiseParam(text) })) }],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new SendError(`WhatsApp request failed: ${(e as Error).message}`, false);
    }
    const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) {
      // 429 and 5xx are worth retrying; other 4xx (bad number, unapproved template) are not.
      throw new SendError(`WhatsApp ${res.status}: ${body.error?.message ?? 'error'}`, res.status < 500 && res.status !== 429);
    }
    const id = body.messages?.[0]?.id;
    if (!id) throw new SendError('WhatsApp response had no message id', false);
    return id;
  }
}

/** Template parameters may not contain newlines, tabs or more than four consecutive spaces. */
export function sanitiseParam(text: string) {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').slice(0, 1000);
}
