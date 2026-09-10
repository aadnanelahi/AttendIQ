import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  jwtRefreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30),
  resendApiKey: process.env.RESEND_API_KEY,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  ttSmartClientId: process.env.TTSMART_CLIENT_ID,
  ttSmartClientSecret: process.env.TTSMART_CLIENT_SECRET,
  ttSmartUsername: process.env.TTSMART_USERNAME,
  ttSmartPassword: process.env.TTSMART_PASSWORD,
  ttSmartAccessToken: process.env.TTSMART_ACCESS_TOKEN,
  ttSmartApiBase: process.env.TTSMART_API_BASE,
  zkConnectorBaseUrl: process.env.ZK_CONNECTOR_BASE_URL,
  zkConnectorDeviceId: process.env.ZK_CONNECTOR_DEVICE_ID,
  zkConnectorSyncIntervalMs: Number(process.env.ZK_CONNECTOR_SYNC_INTERVAL_MS ?? 30000),
};