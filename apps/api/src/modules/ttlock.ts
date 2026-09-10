import { env } from '../env.js';

// TTLock (Sciener) Open Platform API client — isolated probe module.
// Credentials are env-driven (TTSMART_*); see docs/integrations/ttlock.md.
// API contract: POST application/x-www-form-urlencoded, every call carries
// clientId + accessToken + date (ms timestamp). Responses are JSON with
// errcode 0 == success (10004 == token expired).

export interface TtlockLock {
  lockId: number;
  lockName: string;
  lockAlias?: string;
  modelNum?: string;
}

export interface TtlockUnlockRecord {
  lockId: number;
  recordType: number;
  recordTypeName: string;
  success: boolean;
  username?: string;
  keyboardPwd?: string;
  lockDate: string;
  serverDate: string;
}

export interface TtlockConfig {
  configured: boolean;
  apiBase: string;
  missing: string[];
}

export class TtlockError extends Error {
  readonly errcode?: number;
  constructor(message: string, errcode?: number) {
    super(message);
    this.name = 'TtlockError';
    this.errcode = errcode;
  }
}

const RECORD_TYPES: Record<number, string> = {
  1: 'App unlock',
  2: 'Touch parking lock',
  3: 'Gateway unlock',
  4: 'Passcode unlock',
  5: 'Parking lock raise',
  6: 'Parking lock lower',
  7: 'IC card unlock',
  8: 'Fingerprint unlock',
  9: 'Wristband unlock',
  10: 'Mechanical key unlock',
  11: 'Bluetooth unlock',
  12: 'Gateway unlock',
  29: 'Unexpected unlock',
  30: 'Door magnet close',
  31: 'Door magnet open',
  32: 'Open from inside',
  33: 'Lock by fingerprint',
  34: 'Lock by passcode',
  35: 'Lock by IC card',
  36: 'Lock by mechanical key',
  37: 'Remote control',
  44: 'Tamper alert',
  45: 'Auto lock',
  46: 'Unlock by unlock key',
  47: 'Lock by lock key',
  48: 'Invalid passcode used repeatedly',
};

interface TokenCache {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function now(): number {
  return Date.now();
}

function millisToIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function ttlockConfig(): TtlockConfig {
  const apiBase = env.ttSmartApiBase ?? 'https://euapi.ttlock.com';
  const hasClientId = Boolean(env.ttSmartClientId);
  const hasClientSecret = Boolean(env.ttSmartClientSecret);
  const hasConfiguredAccount = Boolean(env.ttSmartUsername) && Boolean(env.ttSmartPassword);
  const hasToken = Boolean(env.ttSmartAccessToken);
  const missing: string[] = [];
  if (!hasClientId) missing.push('TTSMART_CLIENT_ID');
  if (!hasClientSecret) missing.push('TTSMART_CLIENT_SECRET');
  const credentialSourcePresent = hasToken || hasConfiguredAccount;
  if (!credentialSourcePresent) {
    missing.push('TTSMART_ACCESS_TOKEN or TTSMART_USERNAME + TTSMART_PASSWORD');
  }
  return { configured: hasClientId && hasClientSecret && credentialSourcePresent, apiBase, missing };
}

async function formPost(path: string, body: Record<string, string | number>): Promise<unknown> {
  const config = ttlockConfig();
  let res: Response;
  try {
    res = await fetch(`${config.apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body as Record<string, string>),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new TtlockError(`Cannot reach TTLock API at ${config.apiBase}. Check network/API base.`);
  }
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new TtlockError(`TTLock API returned non-JSON response (HTTP ${res.status}).`);
  }
  return json;
}

function raiseIfErrcode(json: Record<string, unknown>): void {
  const errcode = json.errcode;
  if (errcode === undefined || errcode === 0) return;
  const errmsg = String(json.errmsg ?? json.error ?? 'TTLock API error');
  throw new TtlockError(`TTLock API error ${errcode}: ${errmsg}`, errcode as number);
}

async function passwordGrant(): Promise<TokenCache> {
  const json = (await formPost('/oauth2/token', {
    grant_type: 'password',
    clientId: env.ttSmartClientId ?? '',
    clientSecret: env.ttSmartClientSecret ?? '',
    username: env.ttSmartUsername ?? '',
    password: env.ttSmartPassword ?? '',
  })) as Record<string, unknown>;
  raiseIfErrcode(json);
  const accessToken = json.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new TtlockError('TTLock oauth2 response contained no access_token. Check the account credentials.');
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 1800;
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    expiresAt: now() + expiresIn * 1000 - 30_000,
  };
}

async function refreshGrant(refreshToken: string): Promise<TokenCache> {
  const json = (await formPost('/oauth2/token', {
    grant_type: 'refresh_token',
    clientId: env.ttSmartClientId ?? '',
    clientSecret: env.ttSmartClientSecret ?? '',
    refresh_token: refreshToken,
  })) as Record<string, unknown>;
  raiseIfErrcode(json);
  const accessToken = json.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new TtlockError('TTLock oauth2 refresh returned no access_token.');
  }
  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 1800;
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : refreshToken,
    expiresAt: now() + expiresIn * 1000 - 30_000,
  };
}

async function getAccessToken(): Promise<string> {
  if (env.ttSmartAccessToken) return env.ttSmartAccessToken;
  if (tokenCache && tokenCache.expiresAt > now()) return tokenCache.accessToken;
  tokenCache = env.ttSmartPassword ? await passwordGrant() : null;
  if (!tokenCache) throw new TtlockError('TTLock is not configured.');
  return tokenCache.accessToken;
}

async function ttCall(path: string, params: Record<string, string | number>, retried = false): Promise<Record<string, unknown>> {
  const json = (await formPost(path, {
    clientId: env.ttSmartClientId ?? '',
    accessToken: await getAccessToken(),
    date: now(),
    ...params,
  })) as Record<string, unknown>;
  if (json.errcode === 10004 && !retried && env.ttSmartPassword) {
    if (tokenCache?.refreshToken) {
      try {
        tokenCache = await refreshGrant(tokenCache.refreshToken);
      } catch {
        tokenCache = null;
      }
    }
    if (!tokenCache) tokenCache = await passwordGrant();
    return ttCall(path, params, true);
  }
  raiseIfErrcode(json);
  return json;
}

export async function listLocks(): Promise<TtlockLock[]> {
  const json = await ttCall('/v3/lock/list', { pageNo: 1, pageSize: 50 });
  const list = json.list as Record<string, unknown>[] | undefined;
  if (!Array.isArray(list)) {
    throw new TtlockError('TTLock lock/list response contained no list (are these credentials authorized for this account?).');
  }
  return list.map((lock) => ({
    lockId: Number(lock.lockId),
    lockName: String(lock.lockName ?? lock.lockAlias ?? `Lock ${lock.lockId}`),
    lockAlias: lock.lockAlias != null ? String(lock.lockAlias) : undefined,
    modelNum: lock.modelNum != null ? String(lock.modelNum) : undefined,
  }));
}

export async function listUnlockRecords(lockId: number, pageSize = 30): Promise<TtlockUnlockRecord[]> {
  const json = await ttCall('/v3/lockRecord/list', {
    lockId,
    startDate: 0,
    endDate: 0,
    pageNo: 1,
    pageSize: Math.min(Math.max(pageSize, 1), 100),
  });
  const list = json.list as Record<string, unknown>[] | undefined;
  if (!Array.isArray(list)) {
    throw new TtlockError('TTLock lockRecord/list response contained no list.');
  }
  return list.map((record) => {
    const recordType = Number(record.recordType ?? 0);
    return {
      lockId: Number(record.lockId ?? lockId),
      recordType,
      recordTypeName: RECORD_TYPES[recordType] ?? `Record ${recordType}`,
      success: Number(record.success ?? 0) === 1,
      username: record.username != null ? String(record.username) : undefined,
      keyboardPwd: record.keyboardPwd != null && String(record.keyboardPwd).length > 0 ? String(record.keyboardPwd) : undefined,
      lockDate: millisToIso(Number(record.lockDate ?? 0)),
      serverDate: millisToIso(Number(record.serverDate ?? 0)),
    };
  });
}