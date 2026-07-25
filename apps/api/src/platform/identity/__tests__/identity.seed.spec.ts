import {
  hashSeedPassword,
  PERMISSION_CATALOG,
  SYSTEM_ROLE_DEFINITIONS,
} from '../../../../../../prisma/seeds/identity.seed';

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
    it('should contain all required module permission groups', () => {
      const groups = Object.keys(PERMISSION_CATALOG);

      expect(groups).toContain('Users');
      expect(groups).toContain('Clients');
      expect(groups).toContain('Appointments');
      expect(groups).toContain('Kitchen');
      expect(groups).toContain('Inventory');
      expect(groups).toContain('Billing');
      expect(groups).toContain('Reports');
      expect(groups).toContain('Settings');
      expect(groups).toContain('Identity');
    });

    it('should have unique permission codes across all modules', () => {
      const codes = new Set<string>();
      const allPermissions = Object.values(PERMISSION_CATALOG).flat();

      for (const perm of allPermissions) {
        expect(codes.has(perm.code)).toBe(false);
        codes.add(perm.code);
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

    it('should restrict permissions for non-owner roles according to least privilege', () => {
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
