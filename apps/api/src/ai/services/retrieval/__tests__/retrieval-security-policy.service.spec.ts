import { RetrievalSecurityPolicyService } from '../retrieval-security-policy.service';
import {
  IKnowledgeDocumentRepositoryPort,
  KnowledgeDocument,
  VisibilityScope,
} from '@kinergy-platform/core';

describe('RetrievalSecurityPolicyService', () => {
  let service: RetrievalSecurityPolicyService;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;

  beforeEach(() => {
    mockDocRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByChecksum: jest.fn(),
      findAll: jest.fn(),
      count: jest.fn(),
      softDelete: jest.fn(),
    };
    service = new RetrievalSecurityPolicyService(mockDocRepo);
  });

  describe('resolveAllowedVisibilityScopes', () => {
    it('1. should resolve full clearance (ALL_STAFF, CLINICAL_STAFF, MANAGEMENT) for executive/owner roles', () => {
      const scopes = service.resolveAllowedVisibilityScopes(['Owner']);
      expect(scopes).toEqual(
        expect.arrayContaining([
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
          VisibilityScope.MANAGEMENT,
        ]),
      );
      expect(scopes.length).toBe(3);
    });

    it('2. should resolve CLINICAL_STAFF and ALL_STAFF for clinical roles (Therapist, Doctor)', () => {
      const scopes = service.resolveAllowedVisibilityScopes(['Therapist']);
      expect(scopes).toEqual(
        expect.arrayContaining([VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF]),
      );
      expect(scopes).not.toContain(VisibilityScope.MANAGEMENT);
      expect(scopes.length).toBe(2);
    });

    it('3. should resolve ALL_STAFF only for general staff roles (Trainer, Receptionist)', () => {
      const scopes = service.resolveAllowedVisibilityScopes(['Trainer']);
      expect(scopes).toEqual([VisibilityScope.ALL_STAFF]);
      expect(scopes).not.toContain(VisibilityScope.CLINICAL_STAFF);
      expect(scopes).not.toContain(VisibilityScope.MANAGEMENT);
    });

    it('4. should fail closed and return empty scopes for unknown or empty roles', () => {
      expect(service.resolveAllowedVisibilityScopes([])).toEqual([]);
      expect(service.resolveAllowedVisibilityScopes(['UnknownRole', 'Hacker'])).toEqual([]);
    });

    it('5. should compute the union of scopes when user holds multiple roles', () => {
      const scopes = service.resolveAllowedVisibilityScopes(['Trainer', 'Therapist']);
      expect(scopes).toEqual(
        expect.arrayContaining([VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF]),
      );
      expect(scopes).not.toContain(VisibilityScope.MANAGEMENT);
    });
  });

  describe('resolveAuthorizedDocumentIds', () => {
    const tenantId = 'tenant_policy_test';

    it('6. should return undefined authorizedDocumentIds when no specific document IDs were requested', async () => {
      const res = await service.resolveAuthorizedDocumentIds(tenantId, undefined, [
        VisibilityScope.ALL_STAFF,
      ]);
      expect(res.authorizedDocumentIds).toBeUndefined();
      expect(res.isDenied).toBe(false);
    });

    it('7. should authorize valid documents matching tenant and allowed scopes', async () => {
      mockDocRepo.findById.mockResolvedValueOnce({
        id: { value: 'doc_1' },
        tenantId,
        visibilityScope: VisibilityScope.ALL_STAFF,
        deletedAt: null,
      } as unknown as KnowledgeDocument);

      const res = await service.resolveAuthorizedDocumentIds(
        tenantId,
        ['doc_1'],
        [VisibilityScope.ALL_STAFF],
      );

      expect(res.authorizedDocumentIds).toEqual(['doc_1']);
      expect(res.isDenied).toBe(false);
    });

    it('8. should silently discard documents exceeding visibility clearance', async () => {
      mockDocRepo.findById.mockResolvedValueOnce({
        id: { value: 'doc_clinical' },
        tenantId,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
        deletedAt: null,
      } as unknown as KnowledgeDocument);

      // User has only ALL_STAFF clearance
      const res = await service.resolveAuthorizedDocumentIds(
        tenantId,
        ['doc_clinical'],
        [VisibilityScope.ALL_STAFF],
      );

      expect(res.authorizedDocumentIds).toEqual([]);
      expect(res.isDenied).toBe(true);
    });

    it('9. should silently discard soft-deleted documents', async () => {
      mockDocRepo.findById.mockResolvedValueOnce({
        id: { value: 'doc_deleted' },
        tenantId,
        visibilityScope: VisibilityScope.ALL_STAFF,
        deletedAt: new Date(),
      } as unknown as KnowledgeDocument);

      const res = await service.resolveAuthorizedDocumentIds(
        tenantId,
        ['doc_deleted'],
        [VisibilityScope.ALL_STAFF],
      );

      expect(res.authorizedDocumentIds).toEqual([]);
      expect(res.isDenied).toBe(true);
    });

    it('10. should silently discard non-existent or foreign tenant documents without leaking presence', async () => {
      mockDocRepo.findById.mockResolvedValueOnce(null);

      const res = await service.resolveAuthorizedDocumentIds(
        tenantId,
        ['doc_nonexistent'],
        [VisibilityScope.ALL_STAFF],
      );

      expect(res.authorizedDocumentIds).toEqual([]);
      expect(res.isDenied).toBe(true);
    });
  });
});
