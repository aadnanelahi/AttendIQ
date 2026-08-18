export const API_ERROR_CODES = [
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'TENANT_ACCESS_DENIED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'DEVICE_ERROR',
  'INTEGRATION_ERROR',
  'PROCESSING_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  fieldErrors?: Record<string, string>;
}

export function errorStatusCode(code: ApiErrorCode): number {
  switch (code) {
    case 'AUTHENTICATION_ERROR':
      return 401;
    case 'AUTHORIZATION_ERROR':
    case 'TENANT_ACCESS_DENIED':
      return 403;
    case 'VALIDATION_ERROR':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'IDEMPOTENCY_CONFLICT':
      return 409;
    case 'RATE_LIMITED':
      return 429;
    case 'DEVICE_ERROR':
    case 'INTEGRATION_ERROR':
    case 'PROCESSING_ERROR':
      return 422;
    case 'INTERNAL_ERROR':
      return 500;
  }
}