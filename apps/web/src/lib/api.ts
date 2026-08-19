export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const TOKEN_COOKIE = 'attendiq_token';
const REFRESH_COOKIE = 'attendiq_refresh';

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setTokens(accessToken: string, refreshToken: string): void {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(accessToken)};path=/;max-age=3600;samesite=lax`;
  document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)};path=/;max-age=2592000;samesite=lax`;
}

export function clearTokens(): void {
  document.cookie = `${TOKEN_COOKIE}=;path=/;max-age=0`;
  document.cookie = `${REFRESH_COOKIE}=;path=/;max-age=0`;
}

export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const envelope = payload as { code?: string; message?: string; fieldErrors?: Record<string, unknown> } | null;
    throw new ApiError(res.status, envelope?.code ?? 'ERROR', envelope?.message ?? 'Request failed', envelope?.fieldErrors);
  }

  const data = (payload as { data?: T })?.data;
  return data as T;
}

export async function apiEnvelope<T>(path: string, options: RequestOptions = {}): Promise<{ data: T } & Record<string, unknown>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const envelope = payload as { code?: string; message?: string; fieldErrors?: Record<string, unknown> } | null;
    throw new ApiError(res.status, envelope?.code ?? 'ERROR', envelope?.message ?? 'Request failed', envelope?.fieldErrors);
  }

  return (payload ?? {}) as { data: T } & Record<string, unknown>;
}
