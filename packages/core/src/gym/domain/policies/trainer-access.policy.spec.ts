import { TrainerAccessPolicy } from './trainer-access.policy';

describe('TrainerAccessPolicy (Phase 5.6-B: Security Boundary Verification)', () => {
  const trainerA = 'trainer_usr_001';
  const trainerB = 'trainer_usr_002';
  const adminUser = 'admin_usr_999';

  describe('1. Horizontal Privilege Escalation & Roster Access', () => {
    it('allows a trainer to access their own assigned client roster', () => {
      const allowed = TrainerAccessPolicy.canAccessAssignedRoster(trainerA, trainerA, ['Trainer']);
      expect(allowed).toBe(true);
    });

    it('rejects a trainer attempting to access another trainer assigned roster (horizontal escalation)', () => {
      const allowed = TrainerAccessPolicy.canAccessAssignedRoster(trainerA, trainerB, ['Trainer']);
      expect(allowed).toBe(false);
    });

    it('allows an Owner or Admin to access any trainer assigned roster', () => {
      const ownerAllowed = TrainerAccessPolicy.canAccessAssignedRoster(adminUser, trainerA, [
        'Owner',
      ]);
      const adminAllowed = TrainerAccessPolicy.canAccessAssignedRoster(adminUser, trainerB, [
        'Admin',
      ]);

      expect(ownerAllowed).toBe(true);
      expect(adminAllowed).toBe(true);
    });

    it('rejects unauthenticated or empty identifier inputs', () => {
      expect(TrainerAccessPolicy.canAccessAssignedRoster('', trainerA, ['Trainer'])).toBe(false);
      expect(TrainerAccessPolicy.canAccessAssignedRoster(trainerA, '', ['Trainer'])).toBe(false);
    });
  });

  describe('2. Commercial Data Masking & Least Privilege', () => {
    it('denies commercial pricing access to standard trainers without billing.read permission', () => {
      const allowed = TrainerAccessPolicy.canViewMembershipPricing(
        ['clients.read', 'appointments.read'],
        ['Trainer'],
      );
      expect(allowed).toBe(false);
    });

    it('allows commercial pricing access when actor holds explicit billing.read permission', () => {
      const allowed = TrainerAccessPolicy.canViewMembershipPricing(
        ['clients.read', 'billing.read'],
        ['Trainer', 'Accountant'],
      );
      expect(allowed).toBe(true);
    });

    it('allows commercial pricing access to Owner or Admin roles', () => {
      expect(TrainerAccessPolicy.canViewMembershipPricing([], ['Owner'])).toBe(true);
      expect(TrainerAccessPolicy.canViewMembershipPricing([], ['Admin'])).toBe(true);
    });
  });

  describe('3. Ingress & Lifecycle Mutation Separation', () => {
    it('denies check-in mutation authority to floor trainers', () => {
      const canMutate = TrainerAccessPolicy.canMutateAttendance(
        ['Trainer'],
        ['clients.read', 'appointments.read'],
      );
      expect(canMutate).toBe(false);
    });

    it('permits check-in mutations to Receptionists and Admins', () => {
      expect(TrainerAccessPolicy.canMutateAttendance(['Receptionist'])).toBe(true);
      expect(TrainerAccessPolicy.canMutateAttendance(['Owner'])).toBe(true);
    });

    it('denies membership lifecycle modifications to floor trainers', () => {
      const canMutate = TrainerAccessPolicy.canMutateMembershipLifecycle(
        ['Trainer'],
        ['clients.read'],
      );
      expect(canMutate).toBe(false);
    });

    it('permits membership lifecycle modifications to Admins', () => {
      expect(TrainerAccessPolicy.canMutateMembershipLifecycle(['Owner'])).toBe(true);
      expect(TrainerAccessPolicy.canMutateMembershipLifecycle(['Admin'])).toBe(true);
    });
  });
});
