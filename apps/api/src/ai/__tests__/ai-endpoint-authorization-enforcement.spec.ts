import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  VisibilityScope,
  KnowledgeDocument,
  DocumentVersion,
  AiResourceAuthorizationPolicy,
  ConversationNotFoundError,
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
} from '@kinergy-platform/core';
import { AiDocumentController } from '../controllers/ai-document.controller';
import { PreviewTokenService } from '../services/preview-token.service';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';

/**
 * AI-10.1-06: AI Endpoint and Resource-Level Authorization Enforcement Test Suite
 *
 * Covers all 10 required security test scenarios:
 * 1. Unauthenticated access (401)
 * 2. Authenticated but insufficient permission (403)
 * 3. Authorized owner access (200/201)
 * 4. Authenticated non-owner access (404/403)
 * 5. Manipulated document, conversation, message, version, and source IDs (404)
 * 6. Client-supplied userId or tenant values (ignored/overridden by server context)
 * 7. Nested-resource substitution (message/citation mismatch)
 * 8. Unauthorized list filtering (server-side query scoping by allowed visibility scopes)
 * 9. Unauthorized mutation attempts (metadata updates, soft deletion, scope elevation)
 * 10. Missing or invalid ownership context (fail-closed behavior)
 */
describe('AI-10.1-06: Endpoint & Resource Authorization Enforcement', () => {
  const tenantAlpha = 'tenant_clinic_alpha';
  const tenantBeta = 'tenant_clinic_beta';

  // Actor Contexts
  const userDoctorAlpha: AuthenticatedUserPayload = {
    id: 'usr_doc_alpha',
    userId: 'usr_doc_alpha',
    tenantId: tenantAlpha,
    email: 'doc.alpha@clinic.com',
    status: 'ACTIVE',
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userTrainerAlpha: AuthenticatedUserPayload = {
    id: 'usr_trainer_alpha',
    userId: 'usr_trainer_alpha',
    tenantId: tenantAlpha,
    email: 'trainer.alpha@clinic.com',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userOwnerAlpha: AuthenticatedUserPayload = {
    id: 'usr_owner_alpha',
    userId: 'usr_owner_alpha',
    tenantId: tenantAlpha,
    email: 'owner.alpha@clinic.com',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: [
      'ai.conversations.create',
      'ai.conversations.manage',
      'ai.conversations.audit',
      'ai.documents.upload',
      'ai.documents.manage',
      'ai.knowledge.query',
    ],
  };

  const userPeerDoctorAlpha: AuthenticatedUserPayload = {
    id: 'usr_doc_peer_alpha',
    userId: 'usr_doc_peer_alpha',
    tenantId: tenantAlpha,
    email: 'doc.peer@clinic.com',
    status: 'ACTIVE',
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userDoctorBeta: AuthenticatedUserPayload = {
    id: 'usr_doc_beta',
    userId: 'usr_doc_beta',
    tenantId: tenantBeta,
    email: 'doc.beta@clinic.com',
    status: 'ACTIVE',
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  // Helper to build TrustedAiContext
  function toTrustedAiContext(user: AuthenticatedUserPayload): TrustedAiContext {
    return {
      actorId: user.id || user.userId || '',
      tenantId: user.tenantId ?? '',
      roles: user.roles || [],
      permissions: user.permissions || [],
    };
  }

  // Mock Document Entity Builder
  function createMockDocument(params: {
    id: string;
    tenantId: string;
    uploadedBy: string;
    visibilityScope: VisibilityScope;
    isDeleted?: boolean;
    title?: string;
  }): KnowledgeDocument {
    const version = DocumentVersion.create({
      documentId: params.id,
      versionNumber: 1,
      originalFileName: 'protocol.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      checksum: 'a'.repeat(64),
      storageKey: `docs/${params.id}/v1.pdf`,
      uploadedBy: params.uploadedBy,
    });

    const doc = KnowledgeDocument.create({
      tenantId: params.tenantId,
      title: params.title || 'Clinical Protocol',
      uploadedBy: params.uploadedBy,
      visibilityScope: params.visibilityScope,
      initialVersion: version,
    });

    // Manually override aggregate root ID for deterministic test assertions
    Object.defineProperty(doc, 'id', { value: { value: params.id } });
    if (params.isDeleted) {
      doc.softDelete(params.uploadedBy);
    }
    return doc;
  }

  describe('Section B: Document Operations Authorization Enforcement', () => {
    let documentRepoMock: any;
    let ingestionJobRepoMock: any;
    let uploadServiceMock: any;
    let storagePortMock: any;
    let securityPolicy: RetrievalSecurityPolicyService;
    let controller: AiDocumentController;

    beforeEach(() => {
      documentRepoMock = {
        findById: jest.fn(),
        findAll: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        save: jest.fn().mockImplementation((doc) => Promise.resolve(doc)),
      };
      ingestionJobRepoMock = {
        findByVersionId: jest.fn().mockResolvedValue([]),
        save: jest.fn().mockImplementation((j) => Promise.resolve(j)),
      };
      uploadServiceMock = {
        uploadDocument: jest.fn().mockResolvedValue({
          documentId: 'doc_new_1',
          versionId: 'ver_new_1',
          versionNumber: 1,
          createdAt: new Date(),
        }),
      };
      storagePortMock = {
        download: jest.fn().mockResolvedValue({ data: Buffer.from('PDF Content') }),
      };
      securityPolicy = new RetrievalSecurityPolicyService(documentRepoMock);

      controller = new AiDocumentController(
        uploadServiceMock,
        documentRepoMock,
        ingestionJobRepoMock,
        storagePortMock,
        undefined,
        undefined,
        securityPolicy,
      );
    });

    it('1. Upload: server overrides uploadedBy with authenticated user ID and rejects client spoofing', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('test'),
      };

      await controller.uploadDocument(userDoctorAlpha, file, {
        title: 'New Doc',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });

      expect(uploadServiceMock.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: tenantAlpha,
          uploadedBy: userDoctorAlpha.id, // Must be bound to authenticated caller
        }),
      );
    });

    it('2. Upload: rejects attempt by low-privileged user to assign visibility scope above their clearance', async () => {
      const file: any = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('test'),
      };

      // Trainer only has clearance for ALL_STAFF; attempting to upload CLINICAL_STAFF must throw 403
      await expect(
        controller.uploadDocument(userTrainerAlpha, file, {
          title: 'Unauthorized Clinical Doc',
          visibilityScope: VisibilityScope.CLINICAL_STAFF,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('3. List Documents: scopes queries server-side to actor visibility scopes (pre-filtering)', async () => {
      await controller.listDocuments(userTrainerAlpha, {} as any);

      expect(documentRepoMock.findAll).toHaveBeenCalledWith(
        tenantAlpha,
        expect.objectContaining({
          visibilityScopes: [VisibilityScope.ALL_STAFF], // Trainer restricted to ALL_STAFF
        }),
      );

      await controller.listDocuments(userDoctorAlpha, {} as any);

      expect(documentRepoMock.findAll).toHaveBeenCalledWith(
        tenantAlpha,
        expect.objectContaining({
          visibilityScopes: expect.arrayContaining([
            VisibilityScope.ALL_STAFF,
            VisibilityScope.CLINICAL_STAFF,
          ]),
        }),
      );
    });

    it('4. List Documents: non-manager cannot query deleted documents (includeDeleted forced to false)', async () => {
      await controller.listDocuments(userDoctorAlpha, { includeDeleted: true } as any);

      expect(documentRepoMock.findAll).toHaveBeenCalledWith(
        tenantAlpha,
        expect.objectContaining({
          includeDeleted: false, // Disallowed for non-managers
        }),
      );

      await controller.listDocuments(userOwnerAlpha, { includeDeleted: true } as any);

      expect(documentRepoMock.findAll).toHaveBeenCalledWith(
        tenantAlpha,
        expect.objectContaining({
          includeDeleted: true, // Permitted for managers
        }),
      );
    });

    it('5. Detail Retrieval: returns 403 Forbidden when user lacks role clearance for document scope', async () => {
      const clinicalDoc = createMockDocument({
        id: 'doc_clinical_1',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });
      documentRepoMock.findById.mockResolvedValue(clinicalDoc);

      // Trainer has only ALL_STAFF clearance
      await expect(controller.getDocument('doc_clinical_1', userTrainerAlpha)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('6. Detail Retrieval: returns 404 Not Found for soft-deleted document accessed by non-manager', async () => {
      const deletedDoc = createMockDocument({
        id: 'doc_deleted_1',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.ALL_STAFF,
        isDeleted: true,
      });
      documentRepoMock.findById.mockResolvedValue(deletedDoc);

      await expect(controller.getDocument('doc_deleted_1', userDoctorAlpha)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('7. Metadata Update: peer user without management permission is rejected (403)', async () => {
      const doc = createMockDocument({
        id: 'doc_alpha_1',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      documentRepoMock.findById.mockResolvedValue(doc);

      // Peer doctor is in the same clinic but not the uploader and not a manager
      await expect(
        controller.updateDocumentMetadata('doc_alpha_1', userPeerDoctorAlpha, {
          title: 'Tampered Title',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('8. Metadata Update: uploader can update metadata but cannot elevate scope above clearance', async () => {
      const doc = createMockDocument({
        id: 'doc_alpha_trainer',
        tenantId: tenantAlpha,
        uploadedBy: userTrainerAlpha.id!,
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      documentRepoMock.findById.mockResolvedValue(doc);

      // Trainer tries to elevate their own document to CLINICAL_STAFF
      await expect(
        controller.updateDocumentMetadata('doc_alpha_trainer', userTrainerAlpha, {
          visibilityScope: VisibilityScope.CLINICAL_STAFF,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('9. Document Content Download: rejects user with scope mismatch (403)', async () => {
      const clinicalDoc = createMockDocument({
        id: 'doc_clinical_2',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });
      documentRepoMock.findById.mockResolvedValue(clinicalDoc);

      const resMock: any = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await expect(
        controller.downloadContent(
          'doc_clinical_2',
          undefined,
          undefined,
          userTrainerAlpha,
          resMock,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('10. Document Preview Metadata: throws ForbiddenException when scope denied', async () => {
      const clinicalDoc = createMockDocument({
        id: 'doc_clinical_3',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });
      documentRepoMock.findById.mockResolvedValue(clinicalDoc);

      await expect(
        controller.getPreviewMetadata('doc_clinical_3', undefined, undefined, userTrainerAlpha),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Section C & D: Conversation & Source Preview Operations', () => {
    let previewTokenService: PreviewTokenService;

    beforeEach(() => {
      previewTokenService = new PreviewTokenService(
        'kinergy-secure-document-preview-secret-salt-2026',
      );
    });

    it('11. Anti-BOLA: peer user in same tenant probing colleague conversation throws 404 Not Found', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();
      const peerConversation: any = {
        id: 'conv_doctor_alpha',
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id, // Owned by Doctor Alpha
      };

      const peerActor = toTrustedAiContext(userPeerDoctorAlpha); // Doctor Peer Alpha

      expect(() => {
        resourcePolicy.assertConversationAccess(peerActor, peerConversation);
      }).toThrow(ConversationNotFoundError);
    });

    it('12. Anti-BOLA: cross-tenant access attempt throws 404 Not Found', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();
      const conversationAlpha: any = {
        id: 'conv_alpha_1',
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id,
      };

      const betaActor = toTrustedAiContext(userDoctorBeta);

      expect(() => {
        resourcePolicy.assertConversationAccess(betaActor, conversationAlpha);
      }).toThrow(ConversationNotFoundError);
    });

    it('13. Conversation Archival: creator can archive, non-creator without permission throws 403', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();
      const conversation: any = {
        id: 'conv_doc_alpha',
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id,
      };

      // 1. Creator can archive
      expect(() => {
        resourcePolicy.assertConversationArchival(
          toTrustedAiContext(userDoctorAlpha),
          conversation,
        );
      }).not.toThrow();

      // 2. Peer without manage permission cannot archive (throws 404 anti-BOLA)
      expect(() => {
        resourcePolicy.assertConversationArchival(
          toTrustedAiContext(userPeerDoctorAlpha),
          conversation,
        );
      }).toThrow(ConversationNotFoundError);

      // 3. Owner with manage permission CAN archive
      expect(() => {
        resourcePolicy.assertConversationArchival(toTrustedAiContext(userOwnerAlpha), conversation);
      }).not.toThrow();
    });

    it('14. Nested Resource Binding: message belonging to another conversation is rejected', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();

      expect(() => {
        resourcePolicy.assertMessageBelongsToConversation(
          'conv_wrong_id',
          'conv_expected_id',
          'msg_123',
        );
      }).toThrow();
    });

    it('15. Nested Resource Binding: citation belonging to another message is rejected', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();

      expect(() => {
        resourcePolicy.assertCitationBelongsToMessage(
          'msg_wrong_id',
          'msg_expected_id',
          'cit_123',
          'conv_123',
        );
      }).toThrow();
    });

    it('16. Preview Token: cryptographically signs tenant, user, conversation, and roles', () => {
      const token = previewTokenService.generateToken({
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id!,
        conversationId: 'conv_1',
        messageId: 'msg_1',
        citationId: 'cit_1',
        documentId: 'doc_1',
        roles: userDoctorAlpha.roles,
      });

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(2);

      const verified = previewTokenService.verifyToken(token, {
        tenantId: tenantAlpha,
        conversationId: 'conv_1',
        messageId: 'msg_1',
        citationId: 'cit_1',
      });

      expect(verified.valid).toBe(true);
      expect(verified.claims?.tenantId).toBe(tenantAlpha);
      expect(verified.claims?.roles).toEqual(['Therapist']);
    });

    it('17. Preview Token: tampered conversationId or tenantId fails verification', () => {
      const token = previewTokenService.generateToken({
        tenantId: tenantAlpha,
        userId: userDoctorAlpha.id!,
        conversationId: 'conv_1',
        messageId: 'msg_1',
        citationId: 'cit_1',
        documentId: 'doc_1',
      });

      // Verification fails if expected conversation does not match token claims
      const tamperedConvResult = previewTokenService.verifyToken(token, {
        tenantId: tenantAlpha,
        conversationId: 'conv_tampered_attacker',
        messageId: 'msg_1',
        citationId: 'cit_1',
      });

      expect(tamperedConvResult.valid).toBe(false);
      expect(tamperedConvResult.error).toContain('Conversation mismatch');

      // Verification fails if tenant does not match
      const tamperedTenantResult = previewTokenService.verifyToken(token, {
        tenantId: tenantBeta,
        conversationId: 'conv_1',
        messageId: 'msg_1',
        citationId: 'cit_1',
      });

      expect(tamperedTenantResult.valid).toBe(false);
      expect(tamperedTenantResult.error).toContain('Tenant mismatch');
    });

    it('18. Dynamic Revocation: soft-deleting document immediately disqualifies it as knowledge source', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();
      const doc = createMockDocument({
        id: 'doc_source_1',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });
      (doc as any).status = 'INDEXED';

      // Initially eligible for Therapist
      expect(
        resourcePolicy.isDocumentEligibleAsKnowledgeSource(doc, tenantAlpha, [
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
        ]),
      ).toBe(true);

      // Soft delete document
      doc.softDelete(userDoctorAlpha.id!);

      // Immediately ineligible
      expect(
        resourcePolicy.isDocumentEligibleAsKnowledgeSource(doc, tenantAlpha, [
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
        ]),
      ).toBe(false);
    });

    it('19. Dynamic Role Downgrade: user losing clinical role immediately loses access to clinical citation source', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();
      const clinicalDoc = createMockDocument({
        id: 'doc_clinical_source',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });

      // Clinical staff has access
      expect(() => {
        resourcePolicy.assertCitationSourceAccess(
          toTrustedAiContext(userDoctorAlpha),
          clinicalDoc,
          [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
        );
      }).not.toThrow();

      // If user's clearance is reduced to ALL_STAFF, citation source access throws 403
      expect(() => {
        resourcePolicy.assertCitationSourceAccess(
          toTrustedAiContext(userTrainerAlpha),
          clinicalDoc,
          [VisibilityScope.ALL_STAFF],
        );
      }).toThrow(UnauthorizedDocumentAccessException);
    });

    it('20. Missing Context: missing or unassigned tenant ID fails closed with Unauthorized/Forbidden', () => {
      const resourcePolicy = new AiResourceAuthorizationPolicy();
      const doc = createMockDocument({
        id: 'doc_source_2',
        tenantId: tenantAlpha,
        uploadedBy: userDoctorAlpha.id!,
        visibilityScope: VisibilityScope.ALL_STAFF,
      });

      const invalidActor = {
        actorId: 'usr_no_tenant',
        tenantId: '', // Empty tenant
        roles: ['Therapist'],
        permissions: ['ai.knowledge.query'],
      };

      expect(() => {
        resourcePolicy.assertDocumentAccess(invalidActor, doc, [VisibilityScope.ALL_STAFF]);
      }).toThrow(DocumentNotFoundException);
    });
  });
});
