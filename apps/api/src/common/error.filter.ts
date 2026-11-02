import { AppError, type AppErrorKind } from '@erp/shared';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

const STATUS: Record<AppErrorKind, number> = {
  invalid: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
};

// Postgres error codes that are caused by the request rather than by a bug.
const PG_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'A record with these values already exists' },
  '23503': { status: 409, message: 'A related record is missing or still in use' },
  '23514': { status: 400, message: 'The values break a validation rule' },
  '22P02': { status: 400, message: 'Malformed identifier' },
  // Raised when a write fails an RLS WITH CHECK, i.e. targets another institute.
  '42501': { status: 403, message: 'Not allowed' },
};

function pgCode(err: unknown): string | undefined {
  for (let e: any = err; e; e = e.cause) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (err instanceof HttpException) {
      const body = err.getResponse();
      res.status(err.getStatus()).json(typeof body === 'string' ? { message: body } : body);
      return;
    }
    if (err instanceof AppError) {
      res.status(STATUS[err.kind]).json({ message: err.message });
      return;
    }
    const mapped = PG_ERRORS[pgCode(err) ?? ''];
    if (mapped) {
      res.status(mapped.status).json({ message: mapped.message });
      return;
    }
    this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    res.status(500).json({ message: 'Internal server error' });
  }
}
