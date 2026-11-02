import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().startsWith('postgres'),
    SYSTEM_DATABASE_URL: z.string().startsWith('postgres'),
    JWT_SECRET: z.string().min(32),
    SMS_PROVIDER: z.enum(['console']).default('console'),
    /** console = log messages (development); meta = WhatsApp Cloud API. */
    WHATSAPP_PROVIDER: z.enum(['console', 'meta']).default('console'),
    WHATSAPP_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_GRAPH_VERSION: z.string().default('v23.0'),
    /** Verifies status webhooks (X-Hub-Signature-256). Webhooks are refused while unset. */
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    /** off in tests, which drive the worker by hand. */
    NOTIFICATIONS_WORKER: z.enum(['on', 'off']).default('on'),
    /** Base URL for links sent to families (report cards, files, circulars). */
    PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
    /** Local folder for uploaded files (development). Production swaps FileStorage for S3. */
    FILE_STORAGE_DIR: z.string().optional(),
  })
  .refine((env) => env.WHATSAPP_PROVIDER !== 'meta' || (env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID), {
    message: 'WHATSAPP_PROVIDER=meta needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID',
  })
  .refine((env) => !(env.NODE_ENV === 'production' && env.SMS_PROVIDER === 'console'), {
    message: 'SMS_PROVIDER=console prints OTPs to the log and must not be used in production',
  });

export type Config = z.infer<typeof envSchema>;

export const CONFIG = Symbol('CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.') || 'env'}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}
