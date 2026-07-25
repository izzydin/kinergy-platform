import { PrismaClient, RoleType, UserStatus } from '@prisma/client';
import { pbkdf2Sync, randomBytes } from 'crypto';

/**
 * Permission Definition Interface
 */
export interface PermissionDefinition {
  code: string;
  description: string;
}

/**
 * Well-Structured Permission Catalog Grouped by Module
 */
export const PERMISSION_CATALOG: Record<string, PermissionDefinition[]> = {
  Users: [
    { code: 'users.read', description: 'View user accounts' },
    { code: 'users.write', description: 'Create and update user accounts' },
    { code: 'users.delete', description: 'Deactivate or remove user accounts' },
  ],
  Clients: [
    { code: 'clients.read', description: 'View client profiles' },
    { code: 'clients.write', description: 'Create and update client profiles' },
    { code: 'clients.delete', description: 'Delete client profiles' },
  ],
  Appointments: [
    { code: 'appointments.read', description: 'View appointment schedules' },
    { code: 'appointments.create', description: 'Schedule new appointments' },
    { code: 'appointments.update', description: 'Modify existing appointments' },
    { code: 'appointments.delete', description: 'Cancel or delete appointments' },
  ],
  Kitchen: [
    { code: 'kitchen.read', description: 'View kitchen orders and menu items' },
    { code: 'kitchen.orders.manage', description: 'Update order status and manage kitchen queue' },
  ],
  Inventory: [
    { code: 'inventory.read', description: 'View stock levels and inventory items' },
    { code: 'inventory.write', description: 'Update stock levels and manage inventory' },
  ],
  Billing: [
    { code: 'billing.read', description: 'View invoices and payment history' },
    { code: 'billing.write', description: 'Process payments and issue invoices' },
  ],
  Reports: [
    { code: 'reports.read', description: 'View operational and business reports' },
    { code: 'reports.export', description: 'Export report data and analytics' },
  ],
  Settings: [
    { code: 'settings.read', description: 'View system configuration settings' },
    { code: 'settings.write', description: 'Modify system configuration settings' },
  ],
  Identity: [
    { code: 'identity.roles.read', description: 'View system roles and permissions' },
    { code: 'identity.roles.write', description: 'Manage system roles and permissions' },
    { code: 'identity.permissions.read', description: 'View permission catalog' },
  ],
};

/**
 * System Roles and Permission Assignment Mappings (Least Privilege)
 */
export const SYSTEM_ROLE_DEFINITIONS = [
  {
    name: 'Owner',
    description: 'Platform owner with full system access across all modules.',
    type: RoleType.SYSTEM,
    // Owner receives ALL permissions
    permissionCodes: Object.values(PERMISSION_CATALOG)
      .flat()
      .map((p) => p.code),
  },
  {
    name: 'Trainer',
    description: 'Training staff managing client progress and class schedules.',
    type: RoleType.SYSTEM,
    permissionCodes: [
      'clients.read',
      'clients.write',
      'appointments.read',
      'appointments.create',
      'appointments.update',
      'reports.read',
    ],
  },
  {
    name: 'Kitchen Staff',
    description: 'Kitchen operations staff managing orders and food inventory.',
    type: RoleType.SYSTEM,
    permissionCodes: ['kitchen.read', 'kitchen.orders.manage', 'inventory.read', 'inventory.write'],
  },
  {
    name: 'Receptionist',
    description: 'Front desk staff handling appointments, client intake, and billing.',
    type: RoleType.SYSTEM,
    permissionCodes: [
      'clients.read',
      'clients.write',
      'appointments.read',
      'appointments.create',
      'appointments.update',
      'appointments.delete',
      'billing.read',
      'billing.write',
    ],
  },
];

/**
 * Secure PBKDF2 Password Hasher for Database Seeding
 */
export function hashSeedPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `$pbkdf2-sha512$i=100000$${salt}$${derivedKey}`;
}

export interface SeedIdentityResult {
  permissionsCount: number;
  rolesCount: number;
  rolePermissionsCount: number;
  ownerEmail: string;
}

/**
 * Deterministic & Idempotent Identity Bounded Context Seed Function
 */
export async function seedIdentity(prisma: PrismaClient): Promise<SeedIdentityResult> {
  console.log('  🔒 Seeding Identity Module (Permissions, Roles, Default Owner)...');

  // 1. Seed Permissions (Idempotent Upsert)
  const permissionMap = new Map<string, string>(); // code -> permissionId
  let permissionsCount = 0;

  const allPermissions = Object.values(PERMISSION_CATALOG).flat();
  for (const permDef of allPermissions) {
    const permission = await prisma.permission.upsert({
      where: { code: permDef.code },
      update: { description: permDef.description },
      create: { code: permDef.code, description: permDef.description },
    });
    permissionMap.set(permission.code, permission.id);
    permissionsCount++;
  }

  // 2. Seed Roles and RolePermission Mappings (Idempotent)
  const roleMap = new Map<string, string>(); // roleName -> roleId
  let rolePermissionsCount = 0;

  for (const roleDef of SYSTEM_ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {
        description: roleDef.description,
        type: roleDef.type,
      },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        type: roleDef.type,
      },
    });
    roleMap.set(role.name, role.id);

    // Assign permissions for this role
    for (const code of roleDef.permissionCodes) {
      const permissionId = permissionMap.get(code);
      if (!permissionId) {
        throw new Error(
          `Permission code '${code}' not found in permission catalog during seeding.`,
        );
      }

      await prisma.rolePermission.upsert({
        where: {
          unique_role_permission: {
            roleId: role.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId,
        },
      });
      rolePermissionsCount++;
    }
  }

  // 3. Seed Default Owner Bootstrap Account (Idempotent)
  const ownerEmail = process.env.OWNER_EMAIL || 'owner@kinergy.platform';
  const rawOwnerPassword = process.env.OWNER_PASSWORD || 'OwnerPassword123!';
  const ownerRoleId = roleMap.get('Owner');

  if (!ownerRoleId) {
    throw new Error('Owner role was not initialized properly during seeding.');
  }

  const existingOwner = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  if (!existingOwner) {
    const passwordHash = hashSeedPassword(rawOwnerPassword);
    await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        status: UserStatus.ACTIVE,
        roleId: ownerRoleId,
      },
    });
    console.log(`  👤 Created default Owner account: ${ownerEmail}`);
  } else {
    await prisma.user.update({
      where: { email: ownerEmail },
      data: {
        status: UserStatus.ACTIVE,
        roleId: ownerRoleId,
      },
    });
    console.log(`  👤 Verified default Owner account state: ${ownerEmail}`);
  }

  return {
    permissionsCount,
    rolesCount: SYSTEM_ROLE_DEFINITIONS.length,
    rolePermissionsCount,
    ownerEmail,
  };
}
