import { PrismaClient } from '@prismaClient';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 環境変数から認証情報を取得
  const adminUsername = process.env._DEVELOPER_USERNAME || 'admin';
  const adminPassword = process.env._DEVELOPER_PASSWORD || 'admin123';
  const viewerCode = process.env._DEVELOPER_VIEWER_CODE || 'view123';

  // 既存のデータをクリア
  await prisma.admin.deleteMany();
  await prisma.viewerAuth.deleteMany();
  await prisma.skillSheet.deleteMany();

  // 管理者ユーザーを作成
  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.admin.create({
    data: {
      username: adminUsername,
      password: hashedPassword,
    },
  });
  console.log('✅ Created admin user:', { username: admin.username });

  // 初期認証コードを作成
  const hashedCode = await bcrypt.hash(viewerCode, 10);
  const viewerAuth = await prisma.viewerAuth.create({
    data: {
      code: hashedCode,
    },
  });
  console.log('✅ Created viewer auth code');

  // サンプルスキルシートを作成
  const skillSheet = await prisma.skillSheet.create({
    data: {
      title: 'スキルシート',
      content: `# プロフィール

## 基本情報

| 項目 | 内容 |
|------|------|
| 名前 | 山田太郎 |
| 職種 | ソフトウェアエンジニア |
| 経験年数 | 5年 |

## スキル

### フロントエンド
- React / Next.js
- TypeScript
- Tailwind CSS

### バックエンド
- Node.js
- Python
- PostgreSQL

## 職務経歴

### 株式会社ABC（2020年〜現在）

- Webアプリケーション開発
- チームリード

### 株式会社XYZ（2018年〜2020年）

- フロントエンド開発
- UI/UX改善

## プロジェクト実績

1. ECサイトのリニューアル
2. 社内業務システムの開発
3. モバイルアプリの開発
`,
    },
  });
  console.log('✅ Created sample skill sheet:', { title: skillSheet.title });

  console.log('');
  console.log('🎉 Seeding completed!');
  console.log('');
  console.log('📝 Initial credentials:');
  console.log('   Admin login:');
  console.log(`     Username: ${adminUsername}`);
  console.log(`     Password: ${adminPassword}`);
  console.log('');
  console.log(`   Viewer auth code: ${viewerCode}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
