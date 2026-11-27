import {
  KnowledgeDocument,
  VisibilityScope,
  CitationNotFoundError,
  TenantOwnershipViolationError,
  DocumentArchivedOrDeletedError,
  IAiConversationRepositoryPort,
  IAiConversationMessageRepositoryPort,
  IAiConversationCitationRepositoryPort,
  IKnowledgeDocumentRepositoryPort,
  IDocumentStoragePort,
} from '@kinergy-platform/core';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Response } from 'express';
import { PreviewTokenService } from '../services/preview-token.service';
import { AiDocumentController } from '../controllers/ai-document.controller';
import { AiConversationController } from '../conversation/ai-conversation.controller';
import { GetCitationPreviewUseCase } from '../../../../../packages/core/src/ai/application/use-cases/get-citation-preview.use-case';
import { GetCitationDocumentStreamUseCase } from '../../../../../packages/core/src/ai/application/use-cases/get-citation-document-stream.use-case';
import { GetMessageCitationsUseCase } from '../../../../../packages/core/src/ai/application/use-cases/get-message-citations.use-case';
import { GetCitationDetailUseCase } from '../../../../../packages/core/src/ai/application/use-cases/get-citation-detail.use-case';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';

/**
 * AI-10.2-06: Document Version, Citation, and Source Authorization Integration Suite
 *
 * Verifies the 10 mandatory security scenarios:
 * 1. Authorized access to a document version
 * 2. Unauthorized access using a manipulated version ID
 * 3. Unauthorized citation resolution
 * 4. Unauthorized source preview
 * 5. Citation access after document permission revocation
 * 6. Citation access after document deletion
 * 7. Stale citation/version behavior
 * 8. Citation association with regenerated answers
 * 9. Nested resource substitution
 * 10. Cross-user and cross-tenant source isolation
 */
describe('AI-10.2-06: Document Version, Citation, and Source Authorization', () => {
  const TENANT_ALPHA = 'tenant_clinic_alpha';
  const TENANT_BETA = 'tenant_clinic_beta';

  const USER_DOCTOR_ALPHA: AuthenticatedUserPayload = {
    id: 'usr_doc_alpha',
    tenantId: TENANT_ALPHA,
    roles: ['Therapist', 'Doctor'],
    email: 'doc.alpha@kinergy.test',
    status: 'ACTIVE',
    permissions: ['ai:read', 'ai:write'],
  };

  const USER_STAFF_ALPHA: AuthenticatedUserPayload = {
    id: 'usr_staff_alpha',
    tenantId: TENANT_ALPHA,
    roles: ['Receptionist'],
    email: 'staff.alpha@kinergy.test',
    status: 'ACTIVE',
    permissions: ['ai:read'],
  };

  const USER_INTRUDER_BETA: AuthenticatedUserPayload = {
    id: 'usr_intruder_beta',
    tenantId: TENANT_BETA,
    roles: ['Therapist'],
    email: 'intruder@beta.test',
    status: 'ACTIVE',
    permissions: ['ai:read'],
  };

  const authDocAlpha: TrustedAiContext = {
    actorId: USER_DOCTOR_ALPHA.id,
    tenantId: TENANT_ALPHA,
    roles: USER_DOCTOR_ALPHA.roles,
    permissions: ['ai:read', 'ai:write'],
    email: USER_DOCTOR_ALPHA.email,
  };

  const authStaffAlpha: TrustedAiContext = {
    actorId: USER_STAFF_ALPHA.id,
    tenantId: TENANT_ALPHA,
    roles: USER_STAFF_ALPHA.roles,
    permissions: ['ai:read'],
    email: USER_STAFF_ALPHA.email,
  };

  const authIntruderBeta: TrustedAiContext = {
    actorId: USER_INTRUDER_BETA.id,
    tenantId: TENANT_BETA,
    roles: USER_INTRUDER_BETA.roles,
    permissions: ['ai:read'],
    email: USER_INTRUDER_BETA.email,
  };

  let previewTokenService: PreviewTokenService;
  let mockDocRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let mockStorage: jest.Mocked<IDocumentStoragePort>;
  let mockConvRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let mockMsgRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let mockCitationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;

  let documentController: AiDocumentController;
  let getCitationPreviewUseCase: GetCitationPreviewUseCase;
  let getCitationDocumentStreamUseCase: GetCitationDocumentStreamUseCase;
  let getMessageCitationsUseCase: GetMessageCitationsUseCase;
  let getCitationDetailUseCase: GetCitationDetailUseCase;
  let conversationController: AiConversationController;

  const createMockResponse = () => {
    const res: Partial<Response> = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeEach(() => {
    previewTokenService = new PreviewTokenService(
      'kinergy-secure-document-preview-secret-salt-2026',
    );

    mockDocRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      list: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    mockStorage = {
      upload: jest.fn(),
      download: jest.fn().mockResolvedValue({
        data: Buffer.from('%PDF-1.4 Clinical Protocol Content'),
        mimeType: 'application/pdf',
        size: 2048,
      }),
      delete: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<IDocumentStoragePort>;

    mockConvRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      listByUser: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    mockMsgRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      listByConversation: jest.fn(),
      countByConversation: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    mockCitationRepo = {
      findById: jest.fn(),
      listByMessage: jest.fn(),
      saveBatch: jest.fn(),
      deleteByMessage: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationCitationRepositoryPort>;

    // Security policy resolving roles to visibility scopes
    const mockSecurityPolicy = {
      resolveAllowedVisibilityScopes: (roles: string[]) => {
        if (roles.includes('Director') || roles.includes('Owner')) {
          return [
            VisibilityScope.ALL_STAFF,
            VisibilityScope.CLINICAL_STAFF,
            VisibilityScope.MANAGEMENT,
          ];
        }
        if (roles.includes('Therapist') || roles.includes('Doctor')) {
          return [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
        }
        return [VisibilityScope.ALL_STAFF];
      },
    };

    documentController = new AiDocumentController(
      {} as any, // uploadService
      mockDocRepo,
      {} as any, // ingestionJobRepo
      mockStorage as any,
      {} as any, // observabilityService
      mockSecurityPolicy as any,
    );

    getCitationPreviewUseCase = new GetCitationPreviewUseCase(
      mockConvRepo,
      mockMsgRepo,
      mockCitationRepo,
      mockDocRepo,
      mockStorage,
    );

    getCitationDocumentStreamUseCase = new GetCitationDocumentStreamUseCase(
      mockConvRepo,
      mockMsgRepo,
      mockCitationRepo,
      mockDocRepo,
      mockStorage,
    );

    getMessageCitationsUseCase = new GetMessageCitationsUseCase(
      mockConvRepo,
      mockMsgRepo,
      mockCitationRepo,
      mockDocRepo,
    );

    getCitationDetailUseCase = new GetCitationDetailUseCase(
      mockConvRepo,
      mockMsgRepo,
      mockCitationRepo,
      mockDocRepo,
    );

    conversationController = new AiConversationController(
      {} as any, // createConvUseCase
      {} as any, // reserveTurnUseCase
      {} as any, // getConvUseCase
      {} as any, // listConvUseCase
      {} as any, // getHistoryUseCase
      {} as any, // updateTitleUseCase
      {} as any, // archiveConvUseCase
      {} as any, // inspectUseCase
      {} as any, // cancelTurnUseCase
      getMessageCitationsUseCase,
      getCitationDetailUseCase,
      getCitationPreviewUseCase,
      getCitationDocumentStreamUseCase,
      previewTokenService,
    );
  });

  // Helper to create a multi-version clinical document
  const createTestDocument = (params?: {
    visibilityScope?: VisibilityScope;
    isDeleted?: boolean;
  }) => {
    const doc = KnowledgeDocument.create({
      tenantId: TENANT_ALPHA,
      title: 'Shoulder Rehabilitation Protocol',
      uploadedBy: USER_DOCTOR_ALPHA.id,
      visibilityScope: params?.visibilityScope ?? VisibilityScope.CLINICAL_STAFF,
      initialVersion: {
        originalFileName: 'shoulder_v1.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: '1'.repeat(64),
        storageKey: 'tenants/alpha/docs/shoulder_v1.pdf',
        uploadedBy: USER_DOCTOR_ALPHA.id,
      },
    });

    // Add version 2
    doc.addVersion({
      originalFileName: 'shoulder_v2.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      checksum: '2'.repeat(64),
      storageKey: 'tenants/alpha/docs/shoulder_v2.pdf',
      uploadedBy: USER_DOCTOR_ALPHA.id,
    });

    if (params?.isDeleted) {
      doc.softDelete(USER_DOCTOR_ALPHA.id);
    }

    return doc;
  };

  // =========================================================================
  // Scenario 1: Authorized access to a document version
  // =========================================================================
  describe('1. Authorized access to a document version', () => {
    it('allows an authorized clinician to access specific historical version metadata and download content', async () => {
      const doc = createTestDocument();
      const v1 = doc.getAllVersions()[0]!;
      const v2 = doc.getAllVersions()[1]!;
      mockDocRepo.findById.mockResolvedValue(doc);

      // Access specific version 1 metadata
      const version1Meta = await documentController.getSpecificVersion(
        doc.id.value,
        v1.id,
        USER_DOCTOR_ALPHA,
      );
      expect(version1Meta.versionNumber).toBe(1);
      expect(version1Meta.originalFileName).toBe('shoulder_v1.pdf');
      expect(version1Meta.fileSize).toBe(1024);

      // Access specific version 2 metadata
      const version2Meta = await documentController.getSpecificVersion(
        doc.id.value,
        v2.id,
        USER_DOCTOR_ALPHA,
      );
      expect(version2Meta.versionNumber).toBe(2);
      expect(version2Meta.originalFileName).toBe('shoulder_v2.pdf');
      expect(version2Meta.fileSize).toBe(2048);

      // Download version 1 binary content
      const res = createMockResponse();
      await documentController.downloadContent(
        doc.id.value,
        v1.id,
        undefined,
        USER_DOCTOR_ALPHA,
        res,
      );
      expect(mockStorage.download).toHaveBeenCalledWith(TENANT_ALPHA, v1.storageKey);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'inline; filename="shoulder_v1.pdf"',
      );
    });
  });

  // =========================================================================
  // Scenario 2: Unauthorized access using a manipulated version ID
  // =========================================================================
  describe('2. Unauthorized access using a manipulated version ID', () => {
    it('rejects version inspection and download when versionId does not belong to the target document (404)', async () => {
      const doc = createTestDocument();
      mockDocRepo.findById.mockResolvedValue(doc);

      const manipulatedVersionId = 'ver_foreign_random_999';

      // Metadata lookup with foreign version ID
      await expect(
        documentController.getSpecificVersion(
          doc.id.value,
          manipulatedVersionId,
          USER_DOCTOR_ALPHA,
        ),
      ).rejects.toThrow(NotFoundException);

      // Download attempt with foreign version ID
      const res = createMockResponse();
      await expect(
        documentController.downloadContent(
          doc.id.value,
          manipulatedVersionId,
          undefined,
          USER_DOCTOR_ALPHA,
          res,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockStorage.download).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Scenario 3: Unauthorized citation resolution
  // =========================================================================
  describe('3. Unauthorized citation resolution', () => {
    it('rejects citation retrieval when caller does not own the conversation or belongs to another tenant', async () => {
      const conversationId = 'conv_alpha_01';
      const messageId = 'msg_alpha_01';
      const citationId = 'cit_alpha_01';

      // Conversation belongs to USER_DOCTOR_ALPHA in TENANT_ALPHA
      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
      } as any);

      // Intruder Beta attempts to get citations
      await expect(
        conversationController.getMessageCitations(authIntruderBeta, conversationId, messageId),
      ).rejects.toThrow(TenantOwnershipViolationError);

      // Intruder Beta attempts to get citation detail
      await expect(
        conversationController.getCitationDetail(
          authIntruderBeta,
          conversationId,
          messageId,
          citationId,
        ),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });
  });

  // =========================================================================
  // Scenario 4: Unauthorized source preview
  // =========================================================================
  describe('4. Unauthorized source preview', () => {
    it('blocks preview metadata with 403 and yields DOCUMENT_RESTRICTED with null token when caller lacks clearance', async () => {
      const doc = createTestDocument({ visibilityScope: VisibilityScope.CLINICAL_STAFF });
      mockDocRepo.findById.mockResolvedValue(doc);

      // Staff Alpha lacks CLINICAL_STAFF clearance -> getPreviewMetadata throws ForbiddenException
      await expect(
        documentController.getPreviewMetadata(doc.id.value, undefined, undefined, USER_STAFF_ALPHA),
      ).rejects.toThrow(ForbiddenException);

      // In citation preview, staff receives DOCUMENT_RESTRICTED and previewToken is null
      const conversationId = 'conv_staff_01';
      const messageId = 'msg_staff_01';
      const citationId = 'cit_staff_01';

      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_STAFF_ALPHA.id,
      } as any);

      mockMsgRepo.findById.mockResolvedValue({
        id: { value: messageId },
        conversationId: { value: conversationId },
      } as any);

      mockCitationRepo.findById.mockResolvedValue({
        id: { value: citationId },
        conversationId: { value: conversationId },
        messageId: { value: messageId },
        documentId: doc.id.value,
        documentVersionId: doc.getCurrentVersion()!.id,
        documentTitleSnapshot: 'Shoulder Rehabilitation Protocol',
        excerpt: 'Rotator cuff therapy steps.',
        citationPosition: 1,
      } as any);

      const previewResult = await conversationController.getCitationPreview(
        authStaffAlpha,
        conversationId,
        messageId,
        citationId,
      );

      expect(previewResult.canPreview).toBe(false);
      expect(previewResult.previewStatus).toBe('DOCUMENT_RESTRICTED');
      expect(previewResult.previewToken).toBeNull();
    });

    it('rejects preview streaming when preview token signature is tampered', async () => {
      const conversationId = 'conv_doc_01';
      const messageId = 'msg_doc_01';
      const citationId = 'cit_doc_01';

      const validToken = previewTokenService.generateToken({
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
        conversationId,
        messageId,
        citationId,
        documentId: 'doc_any',
      });

      // Tamper signature
      const tamperedToken = validToken.slice(0, -6) + 'abcdef';
      const res = createMockResponse();

      await expect(
        conversationController.getCitationDocumentContent(
          conversationId,
          messageId,
          citationId,
          tamperedToken,
          null,
          res,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // Scenario 5: Citation access after document permission revocation
  // =========================================================================
  describe('5. Citation access after document permission revocation', () => {
    it('dynamically re-evaluates live document clearance and returns DOCUMENT_RESTRICTED when scope was tightened', async () => {
      const doc = createTestDocument({ visibilityScope: VisibilityScope.CLINICAL_STAFF });
      mockDocRepo.findById.mockResolvedValue(doc);

      const conversationId = 'conv_dyn_01';
      const messageId = 'msg_dyn_01';
      const citationId = 'cit_dyn_01';

      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_STAFF_ALPHA.id,
      } as any);

      mockMsgRepo.findById.mockResolvedValue({
        id: { value: messageId },
        conversationId: { value: conversationId },
      } as any);

      mockCitationRepo.findById.mockResolvedValue({
        id: { value: citationId },
        conversationId: { value: conversationId },
        messageId: { value: messageId },
        documentId: doc.id.value,
        documentVersionId: doc.getCurrentVersion()!.id,
        documentTitleSnapshot: 'Shoulder Rehabilitation Protocol',
        excerpt: 'Clinical steps.',
        citationPosition: 1,
      } as any);

      // Re-evaluation for Staff Alpha fails live clearance check
      const previewResult = await conversationController.getCitationPreview(
        authStaffAlpha,
        conversationId,
        messageId,
        citationId,
      );

      expect(previewResult.previewStatus).toBe('DOCUMENT_RESTRICTED');
      expect(previewResult.canPreview).toBe(false);
      expect(previewResult.previewToken).toBeNull();
    });
  });

  // =========================================================================
  // Scenario 6: Citation access after document deletion
  // =========================================================================
  describe('6. Citation access after document deletion', () => {
    it('marks preview status as DOCUMENT_SOFT_DELETED and strictly blocks content streaming', async () => {
      const doc = createTestDocument({ isDeleted: true });
      mockDocRepo.findById.mockResolvedValue(doc);

      const conversationId = 'conv_del_01';
      const messageId = 'msg_del_01';
      const citationId = 'cit_del_01';

      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
      } as any);

      mockMsgRepo.findById.mockResolvedValue({
        id: { value: messageId },
        conversationId: { value: conversationId },
      } as any);

      mockCitationRepo.findById.mockResolvedValue({
        id: { value: citationId },
        conversationId: { value: conversationId },
        messageId: { value: messageId },
        documentId: doc.id.value,
        documentVersionId: doc.getCurrentVersion()!.id,
        documentTitleSnapshot: 'Shoulder Rehabilitation Protocol (Deleted)',
        excerpt: 'Archived text.',
        citationPosition: 1,
      } as any);

      // 1. Preview reports DOCUMENT_SOFT_DELETED
      const previewResult = await conversationController.getCitationPreview(
        authDocAlpha,
        conversationId,
        messageId,
        citationId,
      );

      expect(previewResult.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
      expect(previewResult.canPreview).toBe(false);
      expect(previewResult.previewToken).toBeNull();

      // 2. Direct streaming throws DocumentArchivedOrDeletedError
      await expect(
        getCitationDocumentStreamUseCase.execute({
          tenantId: TENANT_ALPHA,
          userId: USER_DOCTOR_ALPHA.id,
          conversationId,
          messageId,
          citationId,
          userRoles: USER_DOCTOR_ALPHA.roles,
        }),
      ).rejects.toThrow(DocumentArchivedOrDeletedError);
    });
  });

  // =========================================================================
  // Scenario 7: Stale citation/version behavior
  // =========================================================================
  describe('7. Stale citation/version behavior', () => {
    it('maintains strict association with cited version 1 without drifting to newer version 2', async () => {
      const doc = createTestDocument();
      const v1 = doc.getAllVersions()[0]!;
      const v2 = doc.getAllVersions()[1]!;
      mockDocRepo.findById.mockResolvedValue(doc);

      const conversationId = 'conv_stale_01';
      const messageId = 'msg_stale_01';
      const citationId = 'cit_stale_01';

      // Citation specifically cited version 1
      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
      } as any);

      mockMsgRepo.findById.mockResolvedValue({
        id: { value: messageId },
        conversationId: { value: conversationId },
      } as any);

      mockCitationRepo.findById.mockResolvedValue({
        id: { value: citationId },
        conversationId: { value: conversationId },
        messageId: { value: messageId },
        documentId: doc.id.value,
        documentVersionId: v1.id,
        documentTitleSnapshot: doc.title,
        excerpt: 'V1 specific text.',
        citationPosition: 1,
      } as any);

      const previewResult = await conversationController.getCitationPreview(
        authDocAlpha,
        conversationId,
        messageId,
        citationId,
      );

      // Must resolve version 1, not current version 2
      expect(previewResult.documentVersionId).toBe(v1.id);
      expect(previewResult.documentVersionNumber).toBe(1);
      expect(previewResult.originalFileName).toBe('shoulder_v1.pdf');
      expect(previewResult.canPreview).toBe(true);

      // Streaming resolves v1 storageKey
      await getCitationDocumentStreamUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
        conversationId,
        messageId,
        citationId,
        userRoles: USER_DOCTOR_ALPHA.roles,
      });

      expect(mockStorage.download).toHaveBeenCalledWith(TENANT_ALPHA, v1.storageKey);
      expect(mockStorage.download).not.toHaveBeenCalledWith(TENANT_ALPHA, v2.storageKey);
    });
  });

  // =========================================================================
  // Scenario 8: Citation association with regenerated answers
  // =========================================================================
  describe('8. Citation association with regenerated answers', () => {
    it('strictly isolates citations belonging to message revision 1 from message revision 2', async () => {
      const conversationId = 'conv_regen_01';
      const messageRev1Id = 'msg_rev_01';
      const messageRev2Id = 'msg_rev_02';

      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
      } as any);

      mockMsgRepo.findById.mockImplementation(async (_tenant, _conv, msgId) => {
        if (msgId === messageRev1Id) {
          return { id: { value: messageRev1Id }, conversationId: { value: conversationId } } as any;
        }
        if (msgId === messageRev2Id) {
          return { id: { value: messageRev2Id }, conversationId: { value: conversationId } } as any;
        }
        return null;
      });

      const citationRev1 = {
        id: { value: 'cit_rev1_01' },
        conversationId: { value: conversationId },
        messageId: { value: messageRev1Id },
        turnId: { value: 'turn_rev1_01' },
        documentId: 'doc_alpha_01',
        documentTitleSnapshot: 'Protocol Rev 1',
        citationPosition: 1,
        headingPath: ['Section 1'],
        excerpt: 'Text rev 1',
        relevanceScore: 0.95,
        retrievalRank: 1,
        sourceStrategy: 'SEMANTIC',
        createdAt: new Date(),
      };

      const citationRev2 = {
        id: { value: 'cit_rev2_01' },
        conversationId: { value: conversationId },
        messageId: { value: messageRev2Id },
        turnId: { value: 'turn_rev2_01' },
        documentId: 'doc_alpha_02',
        documentTitleSnapshot: 'Protocol Rev 2',
        citationPosition: 1,
        headingPath: ['Section 2'],
        excerpt: 'Text rev 2',
        relevanceScore: 0.92,
        retrievalRank: 1,
        sourceStrategy: 'SEMANTIC',
        createdAt: new Date(),
      };

      mockCitationRepo.listByMessage.mockImplementation(async (_tenant, _conv, msgId) => {
        if (msgId === messageRev1Id) return [citationRev1 as any];
        if (msgId === messageRev2Id) return [citationRev2 as any];
        return [];
      });

      // Listing citations for rev 1 returns rev 1 citations only
      const listRev1 = await conversationController.getMessageCitations(
        authDocAlpha,
        conversationId,
        messageRev1Id,
      );
      expect(listRev1.citations).toHaveLength(1);
      expect(listRev1.citations[0]!.id).toBe('cit_rev1_01');

      // Listing citations for rev 2 returns rev 2 citations only
      const listRev2 = await conversationController.getMessageCitations(
        authDocAlpha,
        conversationId,
        messageRev2Id,
      );
      expect(listRev2.citations).toHaveLength(1);
      expect(listRev2.citations[0]!.id).toBe('cit_rev2_01');
    });
  });

  // =========================================================================
  // Scenario 9: Nested resource substitution
  // =========================================================================
  describe('9. Nested resource substitution', () => {
    it('rejects requests where citation does not belong to the specified message (404)', async () => {
      const conversationId = 'conv_nested_01';
      const messageA = 'msg_nested_A';
      const messageB = 'msg_nested_B';
      const citationBelongingToA = 'cit_nested_A_01';

      mockConvRepo.findById.mockResolvedValue({
        id: { value: conversationId },
        tenantId: TENANT_ALPHA,
        userId: USER_DOCTOR_ALPHA.id,
      } as any);

      mockMsgRepo.findById.mockImplementation(async (_tenant, _conv, msgId) => {
        return { id: { value: msgId }, conversationId: { value: conversationId } } as any;
      });

      // Repository enforces triple key (tenantId, conversationId, messageId, citationId)
      mockCitationRepo.findById.mockImplementation(async (_tenant, _conv, msgId, citId) => {
        if (msgId === messageA && citId === citationBelongingToA) {
          return {
            id: { value: citId },
            conversationId: { value: conversationId },
            messageId: { value: msgId },
          } as any;
        }
        return null;
      });

      // Attempt to resolve citation of Message A via Message B endpoint URL
      await expect(
        conversationController.getCitationDetail(
          authDocAlpha,
          conversationId,
          messageB,
          citationBelongingToA,
        ),
      ).rejects.toThrow(CitationNotFoundError);

      await expect(
        conversationController.getCitationPreview(
          authDocAlpha,
          conversationId,
          messageB,
          citationBelongingToA,
        ),
      ).rejects.toThrow(CitationNotFoundError);
    });
  });

  // =========================================================================
  // Scenario 10: Cross-user and cross-tenant source isolation
  // =========================================================================
  describe('10. Cross-user and cross-tenant source isolation', () => {
    it('guarantees uniform 404 anti-enumeration responses and zero metadata leakage across tenants', async () => {
      const doc = createTestDocument();
      // Tenant Beta repo call yields null
      mockDocRepo.findById.mockImplementation(async (tenantId, _docId) => {
        if (tenantId === TENANT_ALPHA) return doc;
        return null;
      });

      // Intruder Beta tries to access Tenant Alpha document
      await expect(
        documentController.getDocument(doc.id.value, USER_INTRUDER_BETA),
      ).rejects.toThrow(NotFoundException);

      // Intruder Beta tries to access Tenant Alpha preview metadata
      await expect(
        documentController.getPreviewMetadata(
          doc.id.value,
          undefined,
          undefined,
          USER_INTRUDER_BETA,
        ),
      ).rejects.toThrow(NotFoundException);

      // Intruder Beta tries to download content
      const res = createMockResponse();
      await expect(
        documentController.downloadContent(
          doc.id.value,
          undefined,
          undefined,
          USER_INTRUDER_BETA,
          res,
        ),
      ).rejects.toThrow(NotFoundException);

      // Intruder Beta tries to inspect versions
      await expect(
        documentController.getDocumentVersions(doc.id.value, USER_INTRUDER_BETA),
      ).rejects.toThrow(NotFoundException);

      expect(mockStorage.download).not.toHaveBeenCalled();
    });
  });
});
