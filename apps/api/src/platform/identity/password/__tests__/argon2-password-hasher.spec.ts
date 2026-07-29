import { Argon2PasswordHasher } from '../argon2-password-hasher';
import { IPasswordPolicyConfiguration } from '../password-policy-configuration.interface';
import { hashSeedPassword } from '../../../../../../../prisma/seeds/identity.seed';

describe('Argon2PasswordHasher', () => {
  let hasher: Argon2PasswordHasher;

  beforeEach(() => {
    // Fast test configuration (reduced iterations for unit tests speed)
    hasher = new Argon2PasswordHasher({
      memoryCost: 4096, // 4 MB for unit test speed
      timeCost: 1,
      parallelism: 1,
    });
  });

  describe('configuration injection', () => {
    it('should configure options from injected IPasswordPolicyConfiguration', async () => {
      const mockPolicyConfig: IPasswordPolicyConfiguration = {
        getArgon2MemoryCost: () => 4096,
        getArgon2TimeCost: () => 1,
        getArgon2Parallelism: () => 1,
        getArgon2HashLength: () => 32,
        getMinLength: () => 12,
        getMaxLength: () => 128,
        getRequireUppercase: () => true,
        getRequireLowercase: () => true,
        getRequireNumber: () => true,
        getRequireSpecialChar: () => true,
        getPasswordHistoryLimit: () => 5,
      };

      const configuredHasher = new Argon2PasswordHasher(mockPolicyConfig);
      const hash = await configuredHasher.hash('TestPassword123!');
      expect(hash).toMatch(/^\$argon2id\$v=19\$m=4096,/);
    });
  });

  describe('hash', () => {
    it('should generate a valid Argon2id hash string', async () => {
      const password = 'SecurePassword123!';
      const hash = await hasher.hash(password);

      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$argon2id\$v=19\$m=4096,/);
    });

    it('should produce distinct hashes for identical passwords due to automatic salt generation', async () => {
      const password = 'SamePassword123!';
      const hash1 = await hasher.hash(password);
      const hash2 = await hasher.hash(password);

      expect(hash1).not.toEqual(hash2);
    });

    it('should throw an error if password string is empty', async () => {
      await expect(hasher.hash('')).rejects.toThrow('Password string cannot be empty.');
    });
  });

  describe('verify', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hasher.hash(password);

      const isValid = await hasher.verify(password, hash);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'CorrectPassword123!';
      const hash = await hasher.hash(password);

      const isValid = await hasher.verify('WrongPassword123!', hash);
      expect(isValid).toBe(false);
    });

    it('should safely return false for empty inputs', async () => {
      expect(await hasher.verify('', 'hash')).toBe(false);
      expect(await hasher.verify('password', '')).toBe(false);
    });

    it('should safely return false for malformed hash strings', async () => {
      expect(await hasher.verify('password', 'invalid-hash-format')).toBe(false);
    });

    it('should verify legacy/seed PBKDF2 hashes correctly (Algorithm Migration Support)', async () => {
      const password = 'OwnerPassword123!';
      const seedPbkdf2Hash = hashSeedPassword(password);

      const isValid = await hasher.verify(password, seedPbkdf2Hash);
      expect(isValid).toBe(true);

      const isInvalid = await hasher.verify('WrongPassword!', seedPbkdf2Hash);
      expect(isInvalid).toBe(false);
    });
  });
});
