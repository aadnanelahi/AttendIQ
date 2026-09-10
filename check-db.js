const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const device = await prisma.device.findFirst({ where: { deviceId: 'ZK-2002' } });
  console.log('Device:', JSON.stringify(device, null, 2));
  const employee = await prisma.employee.findFirst({ where: { deviceUserId: '1' } });
  console.log('Employee:', JSON.stringify(employee, null, 2));
}

main().finally(() => prisma.$disconnect());