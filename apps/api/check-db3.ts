import { PrismaClient } from '@attendiq/db';

const prisma = new PrismaClient();

async function main() {
  const days = await prisma.attendanceDay.findMany({
    where: { employeeId: 'b8711a26-2cac-4482-81b0-8de36773753b' },
    orderBy: { date: 'desc' },
    take: 5,
  });
  console.log('Attendance days:', JSON.stringify(days, null, 2));
}

main().finally(() => prisma.$disconnect());