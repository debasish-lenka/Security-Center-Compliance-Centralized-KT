import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('⚠️  Resetting database... This will delete all data!');

  // Confirm in non-CI environments
  if (process.env.NODE_ENV !== 'test' && !process.env.CI) {
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  try {
    // Drop and recreate database
    execSync('npx prisma migrate reset --force --skip-seed', {
      cwd: resolve(__dirname, '../../'),
      stdio: 'inherit',
      env: process.env,
    });

    // Run seed
    execSync('npx prisma db seed', {
      cwd: resolve(__dirname, '../../'),
      stdio: 'inherit',
      env: process.env,
    });

    console.log('✅ Database reset completed successfully');
  } catch (error) {
    console.error('❌ Reset failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();