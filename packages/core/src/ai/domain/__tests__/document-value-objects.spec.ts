import { DocumentId } from '../value-objects/document-id.vo';
import { DocumentChecksum } from '../value-objects/document-checksum.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('Knowledge Document Value Objects', () => {
  describe('DocumentId', () => {
    it('should create a valid DocumentId with automatic generation', () => {
      const id = DocumentId.create();
      expect(id.value).toBeDefined();
      expect(id.value.length).toBeGreaterThan(0);
      expect(id.toString()).toBe(id.value);
    });

    it('should wrap a user-supplied ID string', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const id = DocumentId.create(customId);
      expect(id.value).toBe(customId);
    });

    it('should reject empty or whitespace-only IDs', () => {
      expect(() => DocumentId.create('')).toThrow(DocumentValidationException);
      expect(() => DocumentId.create('   ')).toThrow(DocumentValidationException);
    });

    it('should evaluate equality correctly', () => {
      const id1 = DocumentId.create('doc_123');
      const id2 = DocumentId.create('doc_123');
      const id3 = DocumentId.create('doc_456');

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
      expect(id1.equals(null)).toBe(false);
      expect(id1.equals(undefined)).toBe(false);
    });
  });

  describe('DocumentChecksum', () => {
    const validChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    it('should create a valid DocumentChecksum with 64 lowercase hex characters', () => {
      const checksum = DocumentChecksum.create(validChecksum);
      expect(checksum.value).toBe(validChecksum);
      expect(checksum.toString()).toBe(validChecksum);
    });

    it('should normalize uppercase hex strings to lowercase', () => {
      const upper = validChecksum.toUpperCase();
      const checksum = DocumentChecksum.create(upper);
      expect(checksum.value).toBe(validChecksum);
    });

    it('should reject checksums with invalid length', () => {
      expect(() => DocumentChecksum.create('abc123')).toThrow(DocumentValidationException);
      expect(() => DocumentChecksum.create(validChecksum + 'a')).toThrow(
        DocumentValidationException,
      );
    });

    it('should reject checksums with non-hexadecimal characters', () => {
      const invalidChars = 'g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85z';
      expect(() => DocumentChecksum.create(invalidChars)).toThrow(DocumentValidationException);
    });

    it('should reject null or empty values', () => {
      expect(() => DocumentChecksum.create('')).toThrow(DocumentValidationException);
      expect(() => DocumentChecksum.create('   ')).toThrow(DocumentValidationException);
    });

    it('should evaluate equality correctly', () => {
      const c1 = DocumentChecksum.create(validChecksum);
      const c2 = DocumentChecksum.create(validChecksum.toUpperCase());
      const otherValid = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
      const c3 = DocumentChecksum.create(otherValid);

      expect(c1.equals(c2)).toBe(true);
      expect(c1.equals(c3)).toBe(false);
    });
  });
});
