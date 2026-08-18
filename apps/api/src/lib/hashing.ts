import { argon2id, hash as argon2Hash, verify as argon2Verify } from 'argon2';
import { randomBytes } from 'node:crypto';

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { type: argon2id });
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export async function generateTokenHash(): Promise<{ token: string; hash: string }> {
  const token = generateOpaqueToken();
  return { token, hash: await argon2Hash(token, { type: argon2id }) };
}