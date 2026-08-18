import 'dotenv/config';
import { argon2id, hash } from 'argon2';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '@attendiq/shared';
import { prisma } from '../src/index.js';

async function upsertRole(tenantId: string | null, code: string, name: string, permissions: string[]): Promise<{ id: string }> {
  const existing = await prisma.role.findFirst({ where: { tenantId, code } });
  if (existing) return existing;
  return prisma.role.create({
    data: { tenantId, code, name, isSystem: true, permissions },
  });
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@attendiq.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await hash(adminPassword, { type: argon2id });

  // Platform super admin (no tenant).
  const platformAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, passwordHash, name: 'Platform Super Admin' },
  });
  await prisma.userRole.deleteMany({ where: { userId: platformAdmin.id } });
  const platformRole = await upsertRole(
    null,
    'PLATFORM_SUPER_ADMIN',
    'Platform Super Admin',
    DEFAULT_ROLE_PERMISSIONS.PLATFORM_SUPER_ADMIN,
  );
  await prisma.userRole.create({
    data: { userId: platformAdmin.id, roleId: platformRole.id },
  });

  // Demo tenant.
  const slug = process.env.SEED_TENANT_SLUG ?? 'demo';
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { name: 'Demo Organization', slug, locale: 'en', timezone: 'UTC' },
  });

  for (const roleCode of ROLES) {
    await upsertRole(
      tenant.id,
      roleCode,
      roleCode.replaceAll('_', ' '),
      DEFAULT_ROLE_PERMISSIONS[roleCode],
    );
  }

  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.local',
      passwordHash,
      name: 'Demo Admin',
    },
  });
  await prisma.userRole.deleteMany({ where: { userId: tenantAdmin.id } });
  const tenantAdminRole = await prisma.role.findFirstOrThrow({
    where: { tenantId: tenant.id, code: 'TENANT_ADMIN' },
  });
  await prisma.userRole.create({
    data: { userId: tenantAdmin.id, roleId: tenantAdminRole.id },
  });

  const existingOrg = await prisma.organization.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!existingOrg) {
    await prisma.organization.create({
      data: { tenantId: tenant.id, name: 'Demo Org' },
    });
  }

  console.log('Seed complete.');
  console.log(`  Platform admin: ${adminEmail}`);
  console.log(`  Tenant admin:   admin@demo.local`);
  console.log(`  Password:       ${adminPassword}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});