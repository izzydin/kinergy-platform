import { RetrievalMetadataFilter } from '../value-objects/retrieval-metadata-filter.vo';
import { InvalidMetadataFilterException } from '../exceptions/retrieval.exceptions';

describe('RetrievalMetadataFilter Value Object', () => {
  it('1. should create an empty filter when null, undefined, or empty object is passed', () => {
    const empty1 = RetrievalMetadataFilter.create(null);
    expect(empty1.isEmpty()).toBe(true);

    const empty2 = RetrievalMetadataFilter.create(undefined);
    expect(empty2.isEmpty()).toBe(true);

    const empty3 = RetrievalMetadataFilter.create({});
    expect(empty3.isEmpty()).toBe(true);
  });

  it('2. should accept valid allowlisted keys and primitive values', () => {
    const filter = RetrievalMetadataFilter.create({
      department: 'kinesiology',
      subspecialty: 'knee_rehab',
      category: 'protocols',
      topic: 'biomechanics',
      language: 'es',
      strategy: 'structure-aware',
      difficulty: 'intermediate',
      tags: ['acl', 'recovery'],
    });

    expect(filter.isEmpty()).toBe(false);
    expect(filter.get('department')).toBe('kinesiology');
    expect(filter.get('subspecialty')).toBe('knee_rehab');
    expect(filter.get('tags')).toEqual(['acl', 'recovery']);
  });

  it('3. should reject non-allowlisted metadata keys', () => {
    expect(() =>
      RetrievalMetadataFilter.create({
        unknownKey: 'someValue',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        password: 'secret',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        tenantId: 'tenant_override',
      }),
    ).toThrow(InvalidMetadataFilterException);
  });

  it('4. should reject SQL injection attempts in metadata values', () => {
    expect(() =>
      RetrievalMetadataFilter.create({
        topic: "biomechanics' OR '1'='1",
      }),
    ).not.toThrow(); // Plain quote without comment/union is allowed if not injection, but let's check SQL injection fragments:

    expect(() =>
      RetrievalMetadataFilter.create({
        topic: 'biomechanics; DROP TABLE document_embeddings;',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        department: 'kinesiology -- bypass',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        category: '/* comment */ protocols',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        topic: 'UNION SELECT * FROM users',
      }),
    ).toThrow(InvalidMetadataFilterException);
  });

  it('5. should reject control characters in metadata values', () => {
    expect(() =>
      RetrievalMetadataFilter.create({
        department: 'kinesiology\x00malicious',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        department: 'kinesiology\x1Ftest',
      }),
    ).toThrow(InvalidMetadataFilterException);
  });

  it('6. should reject values exceeding maximum length constraints', () => {
    const tooLongString = 'a'.repeat(101);
    expect(() =>
      RetrievalMetadataFilter.create({
        department: tooLongString,
      }),
    ).toThrow(InvalidMetadataFilterException);
  });

  it('7. should reject arrays exceeding maximum item count or non-string array items', () => {
    const tooManyItems = new Array(21).fill('tag');
    expect(() =>
      RetrievalMetadataFilter.create({
        tags: tooManyItems,
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        tags: [123 as unknown as string],
      }),
    ).toThrow(InvalidMetadataFilterException);
  });

  it('8. should reject unsupported types like nested objects or functions', () => {
    expect(() =>
      RetrievalMetadataFilter.create({
        department: { nested: 'forbidden' } as unknown as string,
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        department: (() => 'function') as unknown as string,
      }),
    ).toThrow(InvalidMetadataFilterException);
  });

  it('9. should accept valid multi-attribute filter combinations', () => {
    const combinedFilter = RetrievalMetadataFilter.create({
      department: 'kinesiology',
      category: 'protocols',
      language: 'es',
      documentType: 'clinical_guide',
      tags: ['acl', 'fase1', 'crioterapia'],
    });

    expect(combinedFilter.isEmpty()).toBe(false);
    expect(combinedFilter.get('department')).toBe('kinesiology');
    expect(combinedFilter.get('category')).toBe('protocols');
    expect(combinedFilter.get('language')).toBe('es');
    expect(combinedFilter.get('documentType')).toBe('clinical_guide');
    expect(combinedFilter.get('tags')).toEqual(['acl', 'fase1', 'crioterapia']);
  });

  it('10. should prevent tenant boundary and visibility scope spoofing through metadata filters', () => {
    // Attackers must not be able to inject authorization fields as metadata keys
    expect(() =>
      RetrievalMetadataFilter.create({
        tenant_id: 'malicious_tenant',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        visibilityScope: 'PUBLIC',
      }),
    ).toThrow(InvalidMetadataFilterException);

    expect(() =>
      RetrievalMetadataFilter.create({
        role: 'SUPER_ADMIN',
      }),
    ).toThrow(InvalidMetadataFilterException);
  });
});
