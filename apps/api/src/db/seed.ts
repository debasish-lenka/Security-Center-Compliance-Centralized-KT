import { PrismaClient, type PermissionScope } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

interface PermissionSeed {
  resource: string;
  action: string;
  scope: PermissionScope;
  description: string;
}

// Permission name is always `${resource}.${action}`
const PERMISSIONS: PermissionSeed[] = [
  { resource: 'project', action: 'create', scope: 'GLOBAL', description: 'Create new projects' },
  { resource: 'project', action: 'edit', scope: 'PROJECT', description: 'Edit existing projects' },
  { resource: 'project', action: 'delete', scope: 'PROJECT', description: 'Delete projects' },
  { resource: 'project', action: 'assign', scope: 'PROJECT', description: 'Assign users to projects' },
  { resource: 'project', action: 'view', scope: 'PROJECT', description: 'View projects' },
  { resource: 'report', action: 'submit', scope: 'PROJECT', description: 'Submit daily KT reports' },
  { resource: 'report', action: 'view', scope: 'PROJECT', description: 'View daily KT reports' },
  { resource: 'report', action: 'approve', scope: 'PROJECT', description: 'Approve/reject KT reports' },
  { resource: 'document', action: 'upload', scope: 'PROJECT', description: 'Upload documents' },
  { resource: 'document', action: 'view', scope: 'PROJECT', description: 'View documents' },
  { resource: 'document', action: 'download', scope: 'PROJECT', description: 'Download documents' },
  { resource: 'document', action: 'delete', scope: 'PROJECT', description: 'Delete documents' },
  { resource: 'user', action: 'manage', scope: 'GLOBAL', description: 'Manage users' },
  { resource: 'role', action: 'manage', scope: 'GLOBAL', description: 'Manage roles and permissions' },
  { resource: 'compliance', action: 'manage', scope: 'GLOBAL', description: 'Manage compliance controls' },
  { resource: 'audit', action: 'view', scope: 'GLOBAL', description: 'View audit logs' },
  { resource: 'settings', action: 'manage', scope: 'GLOBAL', description: 'Manage system settings' },
];

const ADMIN_EXCLUDED = ['user.manage', 'role.manage', 'settings.manage'];
const MEMBER_PERMISSIONS = [
  'project.view',
  'report.submit',
  'report.view',
  'document.upload',
  'document.view',
  'document.download',
];

async function main() {
  console.log('🌱 Seeding database...');

  const permissions = await Promise.all(
    PERMISSIONS.map(({ resource, action, scope, description }) =>
      prisma.permission.upsert({
        where: { name: `${resource}.${action}` },
        update: { description, resource, action, scope },
        create: { name: `${resource}.${action}`, description, resource, action, scope },
      })
    )
  );

  const idsWhere = (predicate: (name: string) => boolean) =>
    permissions.filter((p) => predicate(p.name)).map((p) => ({ id: p.id }));

  // `set` keeps role permissions in sync on re-seed
  const upsertRole = (name: string, description: string, permissionIds: { id: string }[]) =>
    prisma.role.upsert({
      where: { name },
      update: { description, permissions: { set: permissionIds } },
      create: { name, description, permissions: { connect: permissionIds } },
    });

  const superAdminRole = await upsertRole('Super Admin', 'Full system access', idsWhere(() => true));
  await upsertRole(
    'Admin',
    'Project and team management',
    idsWhere((n) => !ADMIN_EXCLUDED.includes(n))
  );
  await upsertRole('Project Member', 'Project collaboration access', idsWhere((n) => MEMBER_PERMISSIONS.includes(n)));

  // Default super admin (development only)
  if (process.env.NODE_ENV === 'development') {
    const adminEmail = 'admin@dbi.example.com';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

    let admin = await prisma.profile.findUnique({ where: { email: adminEmail } });

    if (!admin) {
      const passwordHash = await argon2.hash(adminPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });

      const department = await prisma.department.upsert({
        where: { name: 'IT Security' },
        update: {},
        create: { name: 'IT Security' },
      });

      admin = await prisma.profile.create({
        data: {
          email: adminEmail,
          passwordHash,
          fullName: 'System Administrator',
          departmentId: department.id,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        },
      });

      console.log(`✅ Created default super admin: ${adminEmail} / ${adminPassword}`);
    }

    // The assigner is a required FK, so the admin must exist first (self-assigned)
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: superAdminRole.id } },
      update: {},
      create: { userId: admin.id, roleId: superAdminRole.id, assignedBy: admin.id },
    });
  }

  console.log('✅ Seeding completed successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
