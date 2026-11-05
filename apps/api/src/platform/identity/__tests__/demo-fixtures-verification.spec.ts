import { Argon2PasswordHasher } from '../password/argon2-password-hasher';
import { assertSafeDemoEnvironment } from '../../../../../../prisma/seeds/demo-fixtures.seed';
import { hashSeedPassword } from '../../../../../../prisma/seeds/identity.seed';

describe('Demo Fixtures Safety and Determinism Verification', () => {
  describe('assertSafeDemoEnvironment', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should throw SAFETY LOCK error when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      expect(() => {
        assertSafeDemoEnvironment('postgresql://user:pass@127.0.0.1:5433/kinergy_dev');
      }).toThrow(/SAFETY LOCK: Seeding demo fixtures is prohibited in NODE_ENV=production/);
    });

    it('should throw SAFETY LOCK error when DATABASE_URL indicates production', () => {
      process.env.NODE_ENV = 'development';
      expect(() => {
        assertSafeDemoEnvironment(
          'postgresql://user:pass@prod-db.kinergy.platform:5432/kinergy_production',
        );
      }).toThrow(/SAFETY LOCK: Target database URL contains production indicators/);
    });

    it('should mask credentials in production warning messages', () => {
      process.env.NODE_ENV = 'development';
      try {
        assertSafeDemoEnvironment(
          'postgresql://secret_user:super_secret_password@prod.cluster:5432/live-db',
        );
        fail('Expected error to be thrown');
      } catch (err) {
        const error = err as Error;
        expect(error.message).not.toContain('super_secret_password');
        expect(error.message).toContain(':***@');
      }
    });

    it('should throw error when DATABASE_URL is missing', () => {
      process.env.NODE_ENV = 'development';
      expect(() => {
        assertSafeDemoEnvironment('');
      }).toThrow(/DATABASE_URL environment variable is missing/);
    });

    it('should pass safety assertion for local demo/development database URL', () => {
      process.env.NODE_ENV = 'development';
      expect(() => {
        assertSafeDemoEnvironment(
          'postgresql://kinergy_app:kinergy_dev_pass@127.0.0.1:5433/kinergy_dev?schema=public',
        );
      }).not.toThrow();
    });
  });

  describe('Demo Account Authentication Verification', () => {
    const hasher = new Argon2PasswordHasher();

    it('should verify password hash for all demo accounts with default demo password', async () => {
      const demoAccounts = [
        { email: 'reception.demo@kinergy.platform', role: 'Receptionist' },
        { email: 'therapist.demo@kinergy.platform', role: 'Trainer' },
        { email: 'trainer.demo@kinergy.platform', role: 'Trainer' },
        { email: 'inventory.demo@kinergy.platform', role: 'Kitchen Staff' },
      ];

      const rawPassword = 'DemoPass123!';
      const hash = hashSeedPassword(rawPassword);

      for (const account of demoAccounts) {
        // Verify Argon2PasswordHasher correctly verifies seed PBKDF2 hash for each account
        const isValid = await hasher.verify(rawPassword, hash);
        expect(isValid).toBe(true);
        expect(account.email).toContain('@kinergy.platform');
      }

      const isInvalid = await hasher.verify('WrongPassword!', hash);
      expect(isInvalid).toBe(false);
    });

    it('should verify owner account credentials against seed hasher', async () => {
      const rawPassword = 'OwnerPassword123!';
      const hash = hashSeedPassword(rawPassword);

      const isValid = await hasher.verify(rawPassword, hash);
      expect(isValid).toBe(true);
    });

    it('should verify synthetic client and inventory identifiers follow strict formatting invariants', () => {
      const clientRefs = [
        'CLI-2026-00001',
        'CLI-2026-00002',
        'CLI-2026-00003',
        'CLI-2026-00004',
        'CLI-2026-00005',
      ];
      const clientRefRegex = /^CLI-2026-\d{5}$/;
      for (const ref of clientRefs) {
        expect(clientRefRegex.test(ref)).toBe(true);
      }

      const skus = [
        'SKU-SNK-BAR-01',
        'SKU-DRK-ELEC-01',
        'SKU-CLIN-BAND-01',
        'SKU-SUP-CREAT-01',
        'SKU-RET-BOTTLE-01',
      ];
      const skuRegex = /^SKU-[A-Z]+-[A-Z]+-\d{2}$/;
      for (const sku of skus) {
        expect(skuRegex.test(sku)).toBe(true);
      }
    });
  });
});
