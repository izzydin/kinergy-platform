import { DefaultPermissionResolver } from '../default-permission-resolver';
import { PERMISSIONS, SHARED_OPERATIONAL_PERMISSIONS } from '../permissions';

describe('Trainer and Receptionist Operational Permission Equivalence', () => {
  let resolver: DefaultPermissionResolver;

  beforeEach(() => {
    resolver = new DefaultPermissionResolver();
  });

  describe('Permission Matrix Invariants', () => {
    it('guarantees RECEPTIONIST operational permissions ⊆ TRAINER operational permissions', async () => {
      const receptionistPerms = await resolver.resolvePermissions('usr_rec', ['Receptionist'], []);
      const trainerPerms = await resolver.resolvePermissions('usr_trn', ['Trainer'], []);

      for (const perm of receptionistPerms) {
        expect(trainerPerms).toContain(perm);
      }
    });

    it('guarantees TRAINER operational permissions match SHARED_OPERATIONAL_PERMISSIONS exactly', async () => {
      const trainerPerms = await resolver.resolvePermissions('usr_trn', ['Trainer'], []);
      const receptionistPerms = await resolver.resolvePermissions('usr_rec', ['Receptionist'], []);

      // Receptionist has exactly the 17 shared operational permissions
      expect(receptionistPerms).toHaveLength(17);
      expect(receptionistPerms).toEqual(
        expect.arrayContaining([...SHARED_OPERATIONAL_PERMISSIONS]),
      );

      // Trainer has all 17 shared operational permissions + reports.read = 18
      expect(trainerPerms).toHaveLength(18);
      for (const opPerm of SHARED_OPERATIONAL_PERMISSIONS) {
        expect(trainerPerms).toContain(opPerm);
      }
    });

    it('preserves Trainer-specific legitimate permissions (reports.read)', async () => {
      const trainerPerms = await resolver.resolvePermissions('usr_trn', ['Trainer'], []);
      const receptionistPerms = await resolver.resolvePermissions('usr_rec', ['Receptionist'], []);

      expect(trainerPerms).toContain(PERMISSIONS.REPORTS.READ);
      expect(receptionistPerms).not.toContain(PERMISSIONS.REPORTS.READ);
    });

    it('strictly preserves administrative boundaries: neither Trainer nor Receptionist has admin permissions', async () => {
      const rolesToTest: Array<'Trainer' | 'Receptionist'> = ['Trainer', 'Receptionist'];

      const forbiddenAdminPermissions = [
        // Administrative sales overrides / arbitrary discounts
        PERMISSIONS.SALES.MANAGE,
        // User & Identity management
        PERMISSIONS.USERS.READ,
        PERMISSIONS.USERS.WRITE,
        PERMISSIONS.USERS.DELETE,
        PERMISSIONS.IDENTITY.ROLES_READ,
        PERMISSIONS.IDENTITY.ROLES_WRITE,
        // System settings
        PERMISSIONS.SETTINGS.READ,
        PERMISSIONS.SETTINGS.WRITE,
        // Inventory management (writing/adjustments)
        PERMISSIONS.INVENTORY.WRITE,
        // Privileged financial/reports export
        PERMISSIONS.REPORTS.EXPORT,
        // Client deletion
        PERMISSIONS.CLIENTS.DELETE,
      ];

      for (const role of rolesToTest) {
        const perms = await resolver.resolvePermissions(`usr_${role.toLowerCase()}`, [role], []);

        for (const forbidden of forbiddenAdminPermissions) {
          expect(perms).not.toContain(forbidden);
        }
      }
    });

    it('verifies explicit operational permission codes for Clients, Scheduling, Sales, POS, Gym, and Receipts', async () => {
      const trainerPerms = await resolver.resolvePermissions('usr_trn', ['Trainer'], []);

      // Clients
      expect(trainerPerms).toContain(PERMISSIONS.CLIENTS.READ);
      expect(trainerPerms).toContain(PERMISSIONS.CLIENTS.WRITE);

      // Appointments / Scheduling
      expect(trainerPerms).toContain(PERMISSIONS.APPOINTMENTS.READ);
      expect(trainerPerms).toContain(PERMISSIONS.APPOINTMENTS.CREATE);
      expect(trainerPerms).toContain(PERMISSIONS.APPOINTMENTS.UPDATE);
      expect(trainerPerms).toContain(PERMISSIONS.APPOINTMENTS.DELETE);

      // Billing
      expect(trainerPerms).toContain(PERMISSIONS.BILLING.READ);
      expect(trainerPerms).toContain(PERMISSIONS.BILLING.WRITE);

      // Sales & POS
      expect(trainerPerms).toContain(PERMISSIONS.SALES.READ);
      expect(trainerPerms).toContain(PERMISSIONS.SALES.CREATE);
      expect(trainerPerms).toContain(PERMISSIONS.SALES.CANCEL);

      // Payments
      expect(trainerPerms).toContain(PERMISSIONS.PAYMENTS.READ);
      expect(trainerPerms).toContain(PERMISSIONS.PAYMENTS.CREATE);
      expect(trainerPerms).toContain(PERMISSIONS.PAYMENTS.MANAGE);

      // Receipts
      expect(trainerPerms).toContain(PERMISSIONS.RECEIPTS.READ);
      expect(trainerPerms).toContain(PERMISSIONS.RECEIPTS.MANAGE);

      // Consumables catalog reading
      expect(trainerPerms).toContain(PERMISSIONS.INVENTORY.READ);
    });
  });
});
