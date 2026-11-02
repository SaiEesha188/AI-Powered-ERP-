// Domain errors thrown by services; the API maps each kind to an HTTP status.
export type AppErrorKind = 'invalid' | 'not_found' | 'conflict' | 'forbidden' | 'unauthorized' | 'rate_limited';

export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
