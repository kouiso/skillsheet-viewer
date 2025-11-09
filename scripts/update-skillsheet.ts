import { PrismaClient } from '@prismaClient';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const skillSheetContent = fs.readFileSync('./scripts/skillsheet-data.md', 'utf-8');

  await prisma.skillSheet.deleteMany();

  const skillSheet = await prisma.skillSheet.create({
    data: {
      title: 'I・K スキルシート',
      content: skillSheetContent,
    },
  });

  console.log('✅ Skill sheet updated:', { id: skillSheet.id, title: skillSheet.title });
  await prisma.$disconnect();
}

main();
