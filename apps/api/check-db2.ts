import { PrismaClient } from '@attendiq/db';

const prisma = new PrismaClient();

async function main() {
  const transactions = await prisma.attendanceTransaction.findMany({
    where: { deviceId: 'bd43ece2-079b-4277-beb7-54887a6aa6f1' },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });
  console.log('Attendance transactions:', JSON.stringify(transactions, null, 2));
  
  const events = await prisma.deviceEvent.findMany({
    where: { deviceId: 'bd43ece2-079b-4277-beb7-54887a6aa6f1' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('Device events:', JSON.stringify(events, null, 2));
}

main().finally(() => prisma.$disconnect());