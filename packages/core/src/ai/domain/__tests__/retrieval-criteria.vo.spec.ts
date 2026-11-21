import { RetrievalCriteria } from '../value-objects/retrieval-criteria.vo';
import { VisibilityScope } from '../enums/visibility-scope.enum';
import { InvalidRetrievalQueryException } from '../exceptions/retrieval.exceptions';

describe('RetrievalCriteria Value Object', () => {
  it('should create valid criteria with tenantId', () => {
    const criteria = RetrievalCriteria.create({
      tenantId: 'tenant-101',
    });

    expect(criteria.tenantId).toBe('tenant-101');
    expect(criteria.documentIds).toBeUndefined();
    expect(criteria.allowedVisibilityScopes).toBeUndefined();
  });

  it('should reject empty or whitespace tenantId', () => {
    expect(() => RetrievalCriteria.create({ tenantId: '' })).toThrow(
      InvalidRetrievalQueryException,
    );
    expect(() => RetrievalCriteria.create({ tenantId: '   ' })).toThrow(
      InvalidRetrievalQueryException,
    );
  });

  it('should sanitize and deduplicate documentIds and scopes', () => {
    const criteria = RetrievalCriteria.create({
      tenantId: 'tenant-101',
      documentIds: ['doc-1', 'doc-2', 'doc-1', '  '],
      allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.ALL_STAFF],
      mimeTypes: ['application/pdf', 'APPLICATION/PDF', 'text/markdown'],
    });

    expect(criteria.documentIds).toEqual(['doc-1', 'doc-2']);
    expect(criteria.allowedVisibilityScopes).toEqual([VisibilityScope.ALL_STAFF]);
    expect(criteria.mimeTypes).toEqual(['application/pdf', 'text/markdown']);
  });

  it('should reject createdFrom after createdTo', () => {
    expect(() =>
      RetrievalCriteria.create({
        tenantId: 'tenant-101',
        createdFrom: new Date('2026-12-01'),
        createdTo: new Date('2026-11-01'),
      }),
    ).toThrow(InvalidRetrievalQueryException);
  });
});
