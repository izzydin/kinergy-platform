import { DefaultPermissionResolver } from '../default-permission-resolver';
import { ALL_PERMISSION_CODES, PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from '../permissions';

describe('DefaultPermissionResolver', () => {
  let resolver: DefaultPermissionResolver;

  beforeEach(() => {
    resolver = new DefaultPermissionResolver();
  });

  describe('Legacy & Direct Permission Handling', () => {
    it('should consolidate and deduplicate direct permissions', async () => {
      const directPermissions = ['read:users', 'write:users', 'read:users'];

      const resolved = await resolver.resolvePermissions('usr_1', ['USER'], directPermissions);

      expect(resolved).toEqual(['read:users', 'write:users']);
    });

    it('should safely return empty array when user has unknown role and no direct permissions', async () => {
      const resolved = await resolver.resolvePermissions('usr_anon', ['UNKNOWN_ROLE'], []);
      expect(resolved).toEqual([]);
    });

    it('should safely handle empty or undefined roles and permissions', async () => {
      const resolvedEmpty = await resolver.resolvePermissions('usr_anon', [], []);
      expect(resolvedEmpty).toEqual([]);

      const resolvedUndefined = await resolver.resolvePermissions(
        'usr_anon',
        undefined as unknown as string[],
        undefined as unknown as string[],
      );
      expect(resolvedUndefined).toEqual([]);
    });
  });

  describe('Approved Role-to-Permission Mappings (Milestone 7.13 / ADR-0135)', () => {
    it('should grant Owner full platform capabilities across all 40 permissions', async () => {
      const resolved = await resolver.resolvePermissions('usr_owner', ['Owner'], []);

      expect(resolved.length).toBe(40);
      expect(resolved).toEqual(expect.arrayContaining([...ALL_PERMISSION_CODES]));

      // AI permissions verified
      expect(resolved).toContain(PERMISSIONS.AI.CONVERSATIONS_CREATE);
      expect(resolved).toContain(PERMISSIONS.AI.CONVERSATIONS_MANAGE);
      expect(resolved).toContain(PERMISSIONS.AI.CONVERSATIONS_AUDIT);
      expect(resolved).toContain(PERMISSIONS.AI.DOCUMENTS_UPLOAD);
      expect(resolved).toContain(PERMISSIONS.AI.DOCUMENTS_MANAGE);
      expect(resolved).toContain(PERMISSIONS.AI.KNOWLEDGE_QUERY);

      // Sales, Payments, Receipts verified
      expect(resolved).toContain(PERMISSIONS.SALES.READ);
      expect(resolved).toContain(PERMISSIONS.SALES.CREATE);
      expect(resolved).toContain(PERMISSIONS.SALES.MANAGE);
      expect(resolved).toContain(PERMISSIONS.SALES.CANCEL);
      expect(resolved).toContain(PERMISSIONS.PAYMENTS.READ);
      expect(resolved).toContain(PERMISSIONS.PAYMENTS.CREATE);
      expect(resolved).toContain(PERMISSIONS.PAYMENTS.MANAGE);
      expect(resolved).toContain(PERMISSIONS.RECEIPTS.READ);
      expect(resolved).toContain(PERMISSIONS.RECEIPTS.MANAGE);
    });

    it('should grant Receptionist approved point-of-sale, payment, and receipt capabilities', async () => {
      const resolved = await resolver.resolvePermissions('usr_recep', ['Receptionist'], []);

      expect(resolved.length).toBe(19);

      // Phase 7 approved permissions
      expect(resolved).toContain('sales.read');
      expect(resolved).toContain('sales.create');
      expect(resolved).toContain('sales.cancel');
      expect(resolved).toContain('payments.read');
      expect(resolved).toContain('payments.create');
      expect(resolved).toContain('payments.manage');
      expect(resolved).toContain('receipts.read');
      expect(resolved).toContain('receipts.manage');

      // Consumable inventory catalog reading (food and drinks POS sales)
      expect(resolved).toContain('inventory.read');
      expect(resolved).not.toContain('inventory.write');

      // Unrelated Phase 1 permissions preserved
      expect(resolved).toContain('clients.read');
      expect(resolved).toContain('clients.write');
      expect(resolved).toContain('appointments.read');
      expect(resolved).toContain('appointments.create');
      expect(resolved).toContain('appointments.update');
      expect(resolved).toContain('appointments.delete');
      expect(resolved).toContain('billing.read');
      expect(resolved).toContain('billing.write');

      // Explicit Denial: Receptionist cannot perform discretionary price overrides / sales management
      expect(resolved).not.toContain('sales.manage');
      // Explicit Denial: Unrelated privileged modules
      expect(resolved).not.toContain('users.write');
      expect(resolved).not.toContain('users.delete');
      expect(resolved).not.toContain('settings.write');
      expect(resolved).not.toContain('identity.roles.write');
    });

    it('should grant Kitchen Staff counter order and tender capture capabilities only', async () => {
      const resolved = await resolver.resolvePermissions('usr_kitchen', ['Kitchen Staff'], []);

      expect(resolved.length).toBe(10);

      // Phase 7 approved permissions
      expect(resolved).toContain('sales.read');
      expect(resolved).toContain('sales.create');
      expect(resolved).toContain('payments.create');
      expect(resolved).toContain('receipts.read');

      // Unrelated Phase 1 permissions preserved
      expect(resolved).toContain('kitchen.read');
      expect(resolved).toContain('kitchen.orders.manage');
      expect(resolved).toContain('inventory.read');
      expect(resolved).toContain('inventory.write');

      // Explicit Denial: Kitchen Staff cannot void sales, manage sales, or view payment ledgers
      expect(resolved).not.toContain('sales.cancel');
      expect(resolved).not.toContain('sales.manage');
      expect(resolved).not.toContain('payments.read');
      expect(resolved).not.toContain('payments.manage');
      expect(resolved).not.toContain('receipts.manage');

      // Explicit Denial: Unrelated modules
      expect(resolved).not.toContain('clients.read');
      expect(resolved).not.toContain('appointments.read');
      expect(resolved).not.toContain('billing.read');
    });

    it('should grant Trainer equivalent operational capabilities to Receptionist plus reports.read', async () => {
      const resolved = await resolver.resolvePermissions('usr_trainer', ['Trainer'], []);

      expect(resolved.length).toBe(21);

      // Operational POS, sales, payments, receipts capabilities (aligned with Receptionist)
      expect(resolved).toContain('sales.read');
      expect(resolved).toContain('sales.create');
      expect(resolved).toContain('sales.cancel');
      expect(resolved).toContain('payments.read');
      expect(resolved).toContain('payments.create');
      expect(resolved).toContain('payments.manage');
      expect(resolved).toContain('receipts.read');
      expect(resolved).toContain('receipts.manage');

      // Consumable inventory catalog reading (food and drinks POS sales)
      expect(resolved).toContain('inventory.read');
      expect(resolved).not.toContain('inventory.write');

      // Clients, appointments, billing operational capabilities
      expect(resolved).toContain('clients.read');
      expect(resolved).toContain('clients.write');
      expect(resolved).toContain('appointments.read');
      expect(resolved).toContain('appointments.create');
      expect(resolved).toContain('appointments.update');
      expect(resolved).toContain('appointments.delete');
      expect(resolved).toContain('billing.read');
      expect(resolved).toContain('billing.write');

      // Trainer-specific capability preserved
      expect(resolved).toContain('reports.read');

      // Explicit Denial: Trainer cannot perform administrative sales overrides or user administration
      expect(resolved).not.toContain('sales.manage');
      expect(resolved).not.toContain('users.write');
      expect(resolved).not.toContain('users.delete');
      expect(resolved).not.toContain('settings.write');
      expect(resolved).not.toContain('identity.roles.write');
    });
  });

  describe('Determinism, Deduplication, and Composability', () => {
    it('should match authoritative SYSTEM_ROLE_PERMISSIONS exactly for all defined roles', async () => {
      for (const [role, perms] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
        const resolved = await resolver.resolvePermissions('test_user', [role], []);
        expect(resolved).toEqual(perms);
      }
    });

    it('should evaluate permissions deterministically across multiple calls', async () => {
      const call1 = await resolver.resolvePermissions('usr_1', ['Receptionist'], []);
      const call2 = await resolver.resolvePermissions('usr_1', ['Receptionist'], []);

      expect(call1).toEqual(call2);
    });

    it('should deduplicate permissions when assigned both via role and direct permissions', async () => {
      const directPermissions = ['sales.read', 'sales.create', 'custom.direct.perm'];
      const resolved = await resolver.resolvePermissions(
        'usr_kitchen',
        ['Kitchen Staff'],
        directPermissions,
      );

      // Kitchen Staff has 10 permissions; custom.direct.perm adds 1 -> total 11 unique
      expect(resolved.length).toBe(11);
      expect(resolved).toContain('custom.direct.perm');
      expect(resolved.filter((p) => p === 'sales.read').length).toBe(1);
      expect(resolved.filter((p) => p === 'sales.create').length).toBe(1);
    });

    it('should union permissions when a user possesses multiple roles', async () => {
      const resolved = await resolver.resolvePermissions(
        'usr_multi',
        ['Trainer', 'Kitchen Staff'],
        [],
      );

      // Trainer (18) + Kitchen Staff (8) - unioned and deduplicated
      expect(resolved).toContain('sales.read');
      expect(resolved).toContain('receipts.read');
      expect(resolved).toContain('kitchen.read');
      expect(resolved).toContain('clients.read');
      expect(resolved).toContain('payments.create');
      expect(resolved).toContain('payments.manage');
      expect(resolved).not.toContain('sales.manage');
      expect(resolved).not.toContain('users.write');
      expect(new Set(resolved).size).toBe(resolved.length);
    });
  });

  describe('AI Conversation Audit RBAC Isolation (AI-09.3-BE.02.01 & AI-10.1)', () => {
    it('should grant ai.conversations.audit exclusively to Owner', async () => {
      const ownerPerms = await resolver.resolvePermissions('u_owner', ['Owner'], []);
      expect(ownerPerms).toContain(PERMISSIONS.AI.CONVERSATIONS_AUDIT);
      expect(ownerPerms).toContain('ai.conversations.audit');
    });

    it('should NOT grant ai.conversations.audit to any standard operational roles', async () => {
      const rolesToTest = ['Receptionist', 'Kitchen Staff', 'Trainer', 'Therapist'];
      for (const role of rolesToTest) {
        const perms = await resolver.resolvePermissions(`u_${role}`, [role], []);
        expect(perms).not.toContain(PERMISSIONS.AI.CONVERSATIONS_AUDIT);
        expect(perms).not.toContain('ai.conversations.audit');
      }
    });

    it('should grant ai.documents.upload only to Owner, Trainer, and Therapist', async () => {
      const trainer = await resolver.resolvePermissions('u_t', ['Trainer'], []);
      expect(trainer).toContain(PERMISSIONS.AI.DOCUMENTS_UPLOAD);

      const therapist = await resolver.resolvePermissions('u_th', ['Therapist'], []);
      expect(therapist).toContain(PERMISSIONS.AI.DOCUMENTS_UPLOAD);

      const recep = await resolver.resolvePermissions('u_r', ['Receptionist'], []);
      expect(recep).not.toContain(PERMISSIONS.AI.DOCUMENTS_UPLOAD);

      const kitchen = await resolver.resolvePermissions('u_k', ['Kitchen Staff'], []);
      expect(kitchen).not.toContain(PERMISSIONS.AI.DOCUMENTS_UPLOAD);
    });

    it('should preserve standard role permission counts without regression', async () => {
      const recep = await resolver.resolvePermissions('u_r', ['Receptionist'], []);
      expect(recep.length).toBe(19);

      const kitchen = await resolver.resolvePermissions('u_k', ['Kitchen Staff'], []);
      expect(kitchen.length).toBe(10);

      const trainer = await resolver.resolvePermissions('u_t', ['Trainer'], []);
      expect(trainer.length).toBe(21);

      const therapist = await resolver.resolvePermissions('u_th', ['Therapist'], []);
      expect(therapist.length).toBe(11);
    });
  });
});
