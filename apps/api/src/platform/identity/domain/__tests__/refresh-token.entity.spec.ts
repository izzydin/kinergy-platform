import { RefreshToken } from '../refresh-token.entity';

describe('RefreshToken Entity', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');
  const future = new Date('2026-08-01T12:00:00.000Z');
  const past = new Date('2026-07-20T12:00:00.000Z');

  it('should construct a RefreshToken entity with correct props', () => {
    const token = new RefreshToken({
      id: 'rt_1',
      tokenHash: 'hash_123',
      familyId: 'fam_1',
      userId: 'usr_1',
      isRevoked: false,
      expiresAt: future,
    });

    expect(token.id).toBe('rt_1');
    expect(token.tokenHash).toBe('hash_123');
    expect(token.familyId).toBe('fam_1');
    expect(token.userId).toBe('usr_1');
    expect(token.isRevoked).toBe(false);
    expect(token.expiresAt).toBe(future);
    expect(token.isValid(now)).toBe(true);
    expect(token.isExpired(now)).toBe(false);
  });

  it('should detect expired tokens correctly', () => {
    const token = new RefreshToken({
      id: 'rt_2',
      tokenHash: 'hash_456',
      familyId: 'fam_2',
      userId: 'usr_2',
      expiresAt: past,
    });

    expect(token.isExpired(now)).toBe(true);
    expect(token.isValid(now)).toBe(false);
  });

  it('should revoke token correctly', () => {
    const token = new RefreshToken({
      id: 'rt_3',
      tokenHash: 'hash_789',
      familyId: 'fam_3',
      userId: 'usr_3',
      expiresAt: future,
    });

    expect(token.isRevoked).toBe(false);
    token.revoke();
    expect(token.isRevoked).toBe(true);
    expect(token.isValid(now)).toBe(false);
  });
});
