import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '@attendiq/shared';
import { prisma } from '../lib/db.js';

/** Creates the system role set for a tenant (idempotent). */
export async function ensureTenantRoles(tenantId: string): Promise<void> {
  for (const code of ROLES) {
    await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: {},
      create: {
        tenantId,
        name: code.replaceAll('_', ' '),
        code,
        isSystem: true,
        permissions: DEFAULT_ROLE_PERMISSIONS[code],
      },
    });
  }
}