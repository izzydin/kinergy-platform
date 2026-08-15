import { SessionId } from './session-id.vo';

describe('SessionId Value Object', () => {
  describe('Creation', () => {
    it('should generate a unique session id if none is provided', () => {
      const id1 = SessionId.create();
      const id2 = SessionId.create();

      expect(id1.getValue()).toBeDefined();
      expect(id1.getValue().startsWith('sess_')).toBe(true);
      expect(id1.equals(id2)).toBe(false);
    });

    it('should wrap an existing string id and trim whitespace', () => {
      const id = SessionId.create('  custom_sess_123  ');
      expect(id.getValue()).toBe('custom_sess_123');
      expect(id.toString()).toBe('custom_sess_123');
    });

    it('should throw an error if an empty string is provided', () => {
      expect(() => SessionId.create('')).toThrow('Session ID cannot be empty.');
      expect(() => SessionId.create('   ')).toThrow('Session ID cannot be empty.');
    });
  });

  describe('Immutability', () => {
    it('should be frozen and immutable against property modification', () => {
      const id = SessionId.create('sess_immutable_1');
      expect(Object.isFrozen(id)).toBe(true);

      // Attempting to mutate a frozen object in strict mode throws or fails silently
      expect(() => {
        // @ts-expect-error - Testing runtime immutability
        id.value = 'mutated';
      }).toThrow();
    });
  });

  describe('Equality & Serialization', () => {
    it('should correctly evaluate equality with identical values', () => {
      const id1 = SessionId.create('sess_abc');
      const id2 = SessionId.create('sess_abc');
      const id3 = SessionId.create('sess_xyz');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
    });

    it('should return false when comparing against null or undefined', () => {
      const id = SessionId.create('sess_abc');
      // @ts-expect-error - Testing runtime safety
      expect(id.equals(null)).toBe(false);
      // @ts-expect-error - Testing runtime safety
      expect(id.equals(undefined)).toBe(false);
    });

    it('should serialize to string properly via toString and getValue', () => {
      const id = SessionId.create('sess_serialize_test');
      expect(id.toString()).toBe('sess_serialize_test');
      expect(id.getValue()).toBe('sess_serialize_test');
    });
  });
});
