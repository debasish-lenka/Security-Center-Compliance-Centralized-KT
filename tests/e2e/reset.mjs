// Puts the local test database back to a known state before a test: removes the test people and projects the
// tests create (@test.local users, their projects), the settings the tests change, and the admin's 2FA enrolment.
import { createRequire } from 'module';
import { ADMIN_EMAIL, API_PKG, DB_URL } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
try {
  await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
  const ids = (await db.profile.findMany({ where: { email: { endsWith: '@test.local' } }, select: { id: true } })).map((u) => u.id);
  await db.workSession.deleteMany({ where: { userId: { in: ids } } });
  await db.project.deleteMany({ where: { OR: [{ createdById: { in: ids } }, { ownerId: { in: ids } }, { name: { startsWith: 'TWO USER TEST' } }] } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.profile.deleteMany({ where: { id: { in: ids } } });
  await db.workSettings.deleteMany({});
  await db.reminderSettings.deleteMany({});
} finally {
  await db.$disconnect();
}
