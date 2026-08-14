import { ResourceId } from './resource-id.vo';

describe('ResourceId Value Object', () => {
  describe('Creation and Validation', () => {
    it('should create a ResourceId with an explicit string identifier', () => {
      const id = ResourceId.create('res_12345');
      expect(id.getValue()).toBe('res_12345');
      expect(id.toString()).toBe('res_12345');
    });

    it('should trim whitespace from explicit identifier', () => {
      const id = ResourceId.create('   res_padded   ');
      expect(id.getValue()).toBe('res_padded');
    });

    it('should auto-generate a unique ResourceId with default prefix when omitted', () => {
      const id1 = ResourceId.create();
      const id2 = ResourceId.create();

      expect(id1.getValue()).toMatch(/^res_\d+_[a-z0-9]+$/);
      expect(id2.getValue()).toMatch(/^res_\d+_[a-z0-9]+$/);
      expect(id1.equals(id2)).toBe(false);
    });

    it('should auto-generate with custom prefix when specified', () => {
      const id = ResourceId.create(undefined, 'equip');
      expect(id.getValue()).toMatch(/^equip_\d+_[a-z0-9]+$/);
    });

    it('should throw Error when identifier is empty string', () => {
      expect(() => ResourceId.create('')).toThrow('Resource ID cannot be empty.');
    });

    it('should throw Error when identifier is whitespace only', () => {
      expect(() => ResourceId.create('    ')).toThrow('Resource ID cannot be empty.');
    });

    it('should be immutable and frozen on construction', () => {
      const id = ResourceId.create('res_immutable');
      expect(Object.isFrozen(id)).toBe(true);
    });
  });

  describe('Equality', () => {
    it('should return true when two ResourceId instances have identical string values', () => {
      const id1 = ResourceId.create('res_abc');
      const id2 = ResourceId.create('res_abc');

      expect(id1.equals(id2)).toBe(true);
      expect(id2.equals(id1)).toBe(true);
    });

    it('should return false when comparing different ResourceId instances', () => {
      const id1 = ResourceId.create('res_abc');
      const id2 = ResourceId.create('res_def');

      expect(id1.equals(id2)).toBe(false);
    });

    it('should return false when comparing against null, undefined, or non-ResourceId objects', () => {
      const id = ResourceId.create('res_abc');

      // @ts-expect-error Testing invalid input
      expect(id.equals(null)).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(id.equals(undefined)).toBe(false);
      // @ts-expect-error Testing invalid input
      expect(id.equals({ getValue: () => 'res_abc' })).toBe(false);
    });
  });
});
