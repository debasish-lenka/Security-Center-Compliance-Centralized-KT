import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Running database migrations...');

  try {
    // Run prisma migrate deploy
    execSync('npx prisma migrate deploy', {
      cwd: resolve(__dirname, '../../'),
      stdio: 'inherit',
      env: process.env,
    });

    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();