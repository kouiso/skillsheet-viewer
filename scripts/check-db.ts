import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const viewerAuths = await prisma.viewerAuth.findMany();
  console.log('ViewerAuth records:', viewerAuths.length);

  for (const auth of viewerAuths) {
    console.log('\nViewerAuth ID:', auth.id);
    console.log('Code hash:', auth.code);

    // Test comparison
    const isValid = await bcrypt.compare('view123', auth.code);
    console.log('Does "view123" match?', isValid);
  }

  await prisma.$disconnect();
}

main();
