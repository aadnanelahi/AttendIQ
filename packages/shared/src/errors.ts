import type { ApiErrorCode } from './error-codes.js';
import { errorStatusCode } from './error-codes.js';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly fieldErrors?: Record<string, string>;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    opts: { statusCode?: number; fieldErrors?: Record<string, string>; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = opts.statusCode ?? errorStatusCode(code);
    this.fieldErrors = opts.fieldErrors;
    this.details = opts.details;
  }

  static auth(message = 'Authentication required'): AppError {
    return new AppError('AUTHENTICATION_ERROR', message);
  }

  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError('AUTHORIZATION_ERROR', message);
  }

  static tenantDenied(message = 'Tenant access denied'): AppError {
    return new AppError('TENANT_ACCESS_DENIED', message);
  }

  static validation(message: string, fieldErrors?: Record<string, string>): AppError {
    return new AppError('VALIDATION_ERROR', message, { fieldErrors });
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message);
  }

  static idempotencyConflicted(message = 'Idempotency key already used with a different request'): AppError {
    return new AppError('IDEMPOTENCY_CONFLICT', message);
  }
}