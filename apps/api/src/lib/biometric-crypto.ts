import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../env.js';

// Biometric templates are encrypted at rest with AES-256-GCM.
// Key: BIOMETRIC_ENCRYPTION_KEY (any string), falling back to JWT_SECRET.
// Stored format: v1:<keyId>:<iv>:<tag>:<ciphertext> (base64 parts). The key id lets us
// report a clear error if the key is changed after templates were stored.

function keyMaterial(): { key: Buffer; keyId: string } {
  const secret = env.biometricKey ?? env.jwtSecret;
  const key = createHash('sha256').update(`attendiq-biometric:${secret}`).digest();
  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return { key, keyId };
}

export function encryptTemplate(plain: string): string {
  const { key, keyId } = keyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', keyId, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptTemplate(stored: string): string {
  const [version, keyId, iv, tag, ct] = stored.split(':');
  if (version !== 'v1' || !keyId || !iv || !tag || !ct) throw new Error('Unrecognised template format');
  const material = keyMaterial();
  if (material.keyId !== keyId) {
    throw new Error('Template was encrypted with a different key (BIOMETRIC_ENCRYPTION_KEY / JWT_SECRET changed)');
  }
  const decipher = createDecipheriv('aes-256-gcm', material.key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}

export function templateHash(plain: string): string {
  return createHash('sha256').update(plain).digest('hex').slice(0, 16);
}
