import {
  hashSeedPassword,
  PERMISSION_CATALOG,
  SYSTEM_ROLE_DEFINITIONS,
} from '../../../../../../prisma/seeds/identity.seed';
import { SYSTEM_ROLE_PERMISSIONS } from '../authorization/permissions';

describe('Identity Database Seed Specification', () => {
  describe('hashSeedPassword', () => {
    it('should generate a valid PBKDF2 hash string format', () => {
      const password = 'OwnerPassword123!';
      const hash = hashSeedPassword(password);

      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$pbkdf2-sha512\$i=100000\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    });

    it('should produce unique salts for password hashing', () => {
      const hash1 = hashSeedPassword('Password123!');
      const hash2 = hashSeedPassword('Password123!');

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('PERMISSION_CATALOG', () => {
    it('should contain all required module permission groups including Sales, Payments, and Receipts', () => {
      const groups = Object.keys(PERMISSION_CATALOG);

      expect(groups).toContain('Users');
      expect(groups).toContain('Clients');
      expect(groups).toContain('Appointments');
      expect(groups).toContain('Kitchen');
      expect(groups).toContain('Inventory');
      expect(groups).toContain('Assets');
      expect(groups).toContain('Billing');
      expect(groups).toContain('Sales');
      expect(groups).toContain('Payments');
      expect(groups).toContain('Receipts');
      expect(groups).toContain('Reports');
      expect(groups).toContain('Settings');
      expect(groups).toContain('Identity');
      expect(groups.length).toBe(13);
    });

    it('should have unique permission codes across all modules (registered exactly once)', () => {
      const codes = new Set<string>();
      const allPermissions = Object.values(PERMISSION_CATALOG).flat();

      for (const perm of allPermissions) {
        expect(codes.has(perm.code)).toBe(false);
        codes.add(perm.code);
      }
      expect(allPermissions.length).toBe(34);
    });

    it('should register approved Sales permissions conforming to hierarchical dot-notation', () => {
      const salesPermissions = PERMISSION_CATALOG['Sales']?.map((p) => p.code);
      expect(salesPermissions).toEqual([
        'sales.read',
        'sales.create',
        'sales.manage',
        'sales.cancel',
      ]);
      expect(salesPermissions?.length).toBe(4);
    });

    it('should register approved Payments permissions conforming to hierarchical dot-notation', () => {
      const paymentsPermissions = PERMISSION_CATALOG['Payments']?.map((p) => p.code);
      expect(paymentsPermissions).toEqual(['payments.read', 'payments.create', 'payments.manage']);
      expect(paymentsPermissions?.length).toBe(3);
    });

    it('should register approved Receipts permissions conforming to hierarchical dot-notation', () => {
      const receiptsPermissions = PERMISSION_CATALOG['Receipts']?.map((p) => p.code);
      expect(receiptsPermissions).toEqual(['receipts.read', 'receipts.manage']);
      expect(receiptsPermissions?.length).toBe(2);
    });

    it('should enforce that all permission codes strictly follow dot-notation convention without uppercase or colons', () => {
      const allPermissions = Object.values(PERMISSION_CATALOG).flat();
      const dotNotationPattern = /^[a-z]+(\.[a-z]+)+$/;

      for (const perm of allPermissions) {
        expect(perm.code).toMatch(dotNotationPattern);
        expect(perm.code).not.toContain(':');
        expect(perm.code).toEqual(perm.code.toLowerCase());
        expect(perm.description.trim().length).toBeGreaterThan(5);
      }
    });
  });

  describe('SYSTEM_ROLE_DEFINITIONS', () => {
    it('should define Owner, Trainer, Kitchen Staff, and Receptionist roles', () => {
      const roleNames = SYSTEM_ROLE_DEFINITIONS.map((r) => r.name);
      expect(roleNames).toContain('Owner');
      expect(roleNames).toContain('Trainer');
      expect(roleNames).toContain('Kitchen Staff');
      expect(roleNames).toContain('Receptionist');
    });

    it('should assign Owner full system permissions', () => {
      const owner = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Owner');
      const allCodes = Object.values(PERMISSION_CATALOG)
        .flat()
        .map((p) => p.code);

      expect(owner?.permissionCodes.length).toEqual(allCodes.length);
    });

    it('should assign approved permissions matching authoritative SYSTEM_ROLE_PERMISSIONS exactly', () => {
      const trainer = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Trainer');
      const kitchen = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Kitchen Staff');
      const receptionist = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Receptionist');

      expect(trainer?.permissionCodes).toEqual(SYSTEM_ROLE_PERMISSIONS['Trainer']);
      expect(kitchen?.permissionCodes).toEqual(SYSTEM_ROLE_PERMISSIONS['Kitchen Staff']);
      expect(receptionist?.permissionCodes).toEqual(SYSTEM_ROLE_PERMISSIONS['Receptionist']);
    });

    it('should enforce least privilege and segregation of duties for Phase 7 financial capabilities', () => {
      const trainer = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Trainer');
      const kitchen = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Kitchen Staff');
      const receptionist = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Receptionist');

      // Receptionist: Front desk commercial checkout and settlement
      expect(receptionist?.permissionCodes).toContain('sales.read');
      expect(receptionist?.permissionCodes).toContain('sales.create');
      expect(receptionist?.permissionCodes).toContain('sales.cancel');
      expect(receptionist?.permissionCodes).toContain('payments.read');
      expect(receptionist?.permissionCodes).toContain('payments.create');
      expect(receptionist?.permissionCodes).toContain('payments.manage');
      expect(receptionist?.permissionCodes).toContain('receipts.read');
      expect(receptionist?.permissionCodes).toContain('receipts.manage');
      expect(receptionist?.permissionCodes).not.toContain('sales.manage'); // Manager/Owner only

      // Kitchen Staff: POS food checkout and tender capture only
      expect(kitchen?.permissionCodes).toContain('sales.read');
      expect(kitchen?.permissionCodes).toContain('sales.create');
      expect(kitchen?.permissionCodes).toContain('payments.create');
      expect(kitchen?.permissionCodes).toContain('receipts.read');
      expect(kitchen?.permissionCodes).not.toContain('sales.cancel');
      expect(kitchen?.permissionCodes).not.toContain('sales.manage');
      expect(kitchen?.permissionCodes).not.toContain('payments.read');
      expect(kitchen?.permissionCodes).not.toContain('payments.manage');
      expect(kitchen?.permissionCodes).not.toContain('receipts.manage');

      // Trainer: Read-only session validation only
      expect(trainer?.permissionCodes).toContain('sales.read');
      expect(trainer?.permissionCodes).toContain('receipts.read');
      expect(trainer?.permissionCodes).not.toContain('sales.create');
      expect(trainer?.permissionCodes).not.toContain('sales.manage');
      expect(trainer?.permissionCodes).not.toContain('sales.cancel');
      expect(trainer?.permissionCodes).not.toContain('payments.read');
      expect(trainer?.permissionCodes).not.toContain('payments.create');
      expect(trainer?.permissionCodes).not.toContain('payments.manage');
      expect(trainer?.permissionCodes).not.toContain('receipts.manage');
    });

    it('should restrict permissions for non-owner roles according to least privilege across unrelated modules', () => {
      const trainer = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Trainer');
      const kitchen = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Kitchen Staff');
      const receptionist = SYSTEM_ROLE_DEFINITIONS.find((r) => r.name === 'Receptionist');

      expect(trainer?.permissionCodes).toContain('clients.read');
      expect(trainer?.permissionCodes).not.toContain('billing.write');

      expect(kitchen?.permissionCodes).toContain('kitchen.read');
      expect(kitchen?.permissionCodes).not.toContain('users.delete');

      expect(receptionist?.permissionCodes).toContain('billing.read');
      expect(receptionist?.permissionCodes).not.toContain('settings.write');
    });
  });
});
