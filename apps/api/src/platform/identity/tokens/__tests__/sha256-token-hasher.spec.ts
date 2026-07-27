import { Sha256TokenHasher } from '../token-hasher.interface';

describe('Sha256TokenHasher', () => {
  let hasher: Sha256TokenHasher;

  beforeEach(() => {
    hasher = new Sha256TokenHasher();
  });

  it('should hash a raw token deterministically into a hex string', () => {
    const rawToken = 'raw_sample_refresh_token_12345';
    const hash1 = hasher.hashToken(rawToken);
    const hash2 = hasher.hashToken(rawToken);

    expect(hash1).toBeDefined();
    expect(hash1.length).toBe(64); // 256 bits = 64 hex chars
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different tokens', () => {
    const hash1 = hasher.hashToken('token_a');
    const hash2 = hasher.hashToken('token_b');

    expect(hash1).not.toBe(hash2);
  });

  it('should throw an error if input token is empty', () => {
    expect(() => hasher.hashToken('')).toThrow('Token string cannot be empty.');
  });
});
