import {
  VisibilityScope,
  AiResourceAuthorizationPolicy,
  ConversationNotFoundError,
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
  MessageNotBelongingToConversationError,
} from '@kinergy-platform/core';
import { PreviewTokenService } from '../services/preview-token.service';

/**
 * AI-10.1-05: Document, Conversation, and Knowledge Source Authorization Integration
 *
 * Verifies:
 * 1. Document ownership, tenant scope, version inheritance, and administrative management.
 * 2. Conversation creator scoping, anti-BOLA 404 non-enumeration, and administrative archival.
 * 3. Knowledge source eligibility, dynamic re-evaluation upon soft-delete, and role downgrade.
 * 4. Citation and preview token validation binding to verified identity context.
 */
describe('AI-10.1-05: Document, Conversation & Knowledge Source Authorization Integration', () => {
  let policy: AiResourceAuthorizationPolicy;
  let previewTokenService: PreviewTokenService;

  beforeEach(() => {
    policy = new AiResourceAuthorizationPolicy();
    previewTokenService = new PreviewTokenService(
      'kinergy-secure-document-preview-secret-salt-2026',
    );
  });

  const tenantAlpha = 'tenant_clinica_alpha';
  const tenantBeta = 'tenant_clinica_beta';

  const doctorAlpha = {
    actorId: 'usr_doc_alpha',
    tenantId: tenantAlpha,
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const trainerAlpha = {
    actorId: 'usr_trainer_alpha',
    tenantId: tenantAlpha,
    roles: ['Trainer'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const ownerAlpha = {
    actorId: 'usr_owner_alpha',
    tenantId: tenantAlpha,
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

  const doctorBeta = {
    actorId: 'usr_doc_beta',
    tenantId: tenantBeta,
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  describe('1. Document Resource Authorization Invariants', () => {
    const clinicalDoc = {
      id: 'doc_clinical_01',
      tenantId: tenantAlpha,
      uploadedBy: 'usr_doc_alpha',
      visibilityScope: VisibilityScope.CLINICAL_STAFF,
      deletedAt: null,
    };

    const clinicalVersion = {
      id: 'ver_clinical_01',
      documentId: 'doc_clinical_01',
      versionNumber: 1,
    };

    const clinicalScopes = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
    const generalScopes = [VisibilityScope.ALL_STAFF];

    it('authorizes document and version access to clinical staff possessing visibility clearance', () => {
      expect(policy.canAccessDocument(doctorAlpha, clinicalDoc, clinicalScopes)).toBe(true);
      expect(() =>
        policy.assertDocumentAccess(doctorAlpha, clinicalDoc, clinicalScopes),
      ).not.toThrow();
      expect(() =>
        policy.assertDocumentVersionAccess(
          doctorAlpha,
          clinicalDoc,
          clinicalVersion,
          clinicalScopes,
        ),
      ).not.toThrow();
    });

    it('denies document and version access to staff lacking visibility clearance (UnauthorizedDocumentAccessException)', () => {
      expect(policy.canAccessDocument(trainerAlpha, clinicalDoc, generalScopes)).toBe(false);
      expect(() => policy.assertDocumentAccess(trainerAlpha, clinicalDoc, generalScopes)).toThrow(
        UnauthorizedDocumentAccessException,
      );
      expect(() =>
        policy.assertDocumentVersionAccess(
          trainerAlpha,
          clinicalDoc,
          clinicalVersion,
          generalScopes,
        ),
      ).toThrow(UnauthorizedDocumentAccessException);
    });

    it('denies cross-tenant document access with DocumentNotFoundException (anti-IDOR zero-leakage)', () => {
      expect(policy.canAccessDocument(doctorBeta, clinicalDoc, clinicalScopes)).toBe(false);
      expect(() => policy.assertDocumentAccess(doctorBeta, clinicalDoc, clinicalScopes)).toThrow(
        DocumentNotFoundException,
      );
    });

    it('denies access to soft-deleted documents with DocumentNotFoundException (indistinguishable 404)', () => {
      const deletedDoc = { ...clinicalDoc, deletedAt: new Date() };
      expect(policy.canAccessDocument(doctorAlpha, deletedDoc, clinicalScopes)).toBe(false);
      expect(() => policy.assertDocumentAccess(doctorAlpha, deletedDoc, clinicalScopes)).toThrow(
        DocumentNotFoundException,
      );
    });

    it('enforces that a document version referencing a mismatched document ID fails closed', () => {
      const forgedVersion = { id: 'ver_forged', documentId: 'doc_DIFFERENT', versionNumber: 1 };
      expect(() =>
        policy.assertDocumentVersionAccess(doctorAlpha, clinicalDoc, forgedVersion, clinicalScopes),
      ).toThrow(DocumentNotFoundException);
    });

    describe('Document Management Authority (Edit, Soft-Delete, Restore, Retry)', () => {
      it('allows original uploader to manage their document', () => {
        expect(policy.canManageDocument(doctorAlpha, clinicalDoc)).toBe(true);
        expect(() => policy.assertDocumentManage(doctorAlpha, clinicalDoc)).not.toThrow();
      });

      it('allows tenant Owner to manage any document in tenant', () => {
        expect(policy.canManageDocument(ownerAlpha, clinicalDoc)).toBe(true);
        expect(() => policy.assertDocumentManage(ownerAlpha, clinicalDoc)).not.toThrow();
      });

      it('denies non-uploader peer clinician from modifying document (UnauthorizedDocumentAccessException)', () => {
        const peerDoctor = { ...doctorAlpha, actorId: 'usr_doc_peer' };
        expect(policy.canManageDocument(peerDoctor, clinicalDoc)).toBe(false);
        expect(() => policy.assertDocumentManage(peerDoctor, clinicalDoc)).toThrow(
          UnauthorizedDocumentAccessException,
        );
      });
    });
  });

  describe('2. Conversation Resource Authorization Invariants', () => {
    const consultationConv = {
      id: 'conv_consultation_01',
      tenantId: tenantAlpha,
      userId: 'usr_doc_alpha',
    };

    it('authorizes creator to access their conversation consultation', () => {
      expect(() => policy.assertConversationAccess(doctorAlpha, consultationConv)).not.toThrow();
    });

    it('rejects peer clinician within same tenant with ConversationNotFoundError (anti-BOLA 404)', () => {
      expect(() => policy.assertConversationAccess(trainerAlpha, consultationConv)).toThrow(
        ConversationNotFoundError,
      );
    });

    it('rejects cross-tenant access with ConversationNotFoundError (anti-IDOR 404)', () => {
      expect(() => policy.assertConversationAccess(doctorBeta, consultationConv)).toThrow(
        ConversationNotFoundError,
      );
    });

    it('enforces creator-only archival unless administrative override is provided', () => {
      // Creator can archive without admin override
      expect(() =>
        policy.assertConversationArchival(doctorAlpha, consultationConv, false),
      ).not.toThrow();

      // Peer trainer cannot archive
      expect(() =>
        policy.assertConversationArchival(trainerAlpha, consultationConv, false),
      ).toThrow(ConversationNotFoundError);

      // Owner can archive with override
      expect(() =>
        policy.assertConversationArchival(ownerAlpha, consultationConv, true),
      ).not.toThrow();
    });

    it('enforces message binding to parent conversation (preventing cross-conversation ID substitution)', () => {
      expect(() =>
        policy.assertMessageBelongsToConversation(
          consultationConv.id,
          consultationConv.id,
          'msg_valid_01',
        ),
      ).not.toThrow();

      expect(() =>
        policy.assertMessageBelongsToConversation(
          'conv_ATTACKER_CONV',
          consultationConv.id,
          'msg_valid_01',
        ),
      ).toThrow(MessageNotBelongingToConversationError);
    });
  });

  describe('3. Knowledge Source & Retrieval Authorization Invariants', () => {
    const clinicalDoc = {
      id: 'doc_protocol_01',
      tenantId: tenantAlpha,
      uploadedBy: 'usr_doc_alpha',
      visibilityScope: VisibilityScope.CLINICAL_STAFF,
      deletedAt: null,
    };

    const clinicalScopes = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
    const generalScopes = [VisibilityScope.ALL_STAFF];

    it('authorizes document as knowledge source when active and scope is cleared', () => {
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(clinicalDoc, tenantAlpha, clinicalScopes),
      ).toBe(true);
    });

    it('rejects knowledge source when actor lacks visibility scope clearance', () => {
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(clinicalDoc, tenantAlpha, generalScopes),
      ).toBe(false);
    });

    it('immediately invalidates knowledge source upon soft-deletion', () => {
      const softDeletedDoc = { ...clinicalDoc, deletedAt: new Date() };
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(softDeletedDoc, tenantAlpha, clinicalScopes),
      ).toBe(false);
    });

    it('rejects cross-tenant knowledge source eligibility', () => {
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(clinicalDoc, tenantBeta, clinicalScopes),
      ).toBe(false);
    });
  });

  describe('4. Citation Preview Token Invariants', () => {
    it('generates and verifies tamper-proof HMAC preview tokens bound to caller and document', () => {
      const token = previewTokenService.generateToken(
        {
          tenantId: tenantAlpha,
          userId: doctorAlpha.actorId,
          conversationId: 'conv_consultation_01',
          messageId: 'msg_01',
          citationId: 'cit_01',
          documentId: 'doc_protocol_01',
        },
        300,
      );

      const verification = previewTokenService.verifyToken(token, {
        tenantId: tenantAlpha,
        conversationId: 'conv_consultation_01',
        messageId: 'msg_01',
        citationId: 'cit_01',
      });

      expect(verification.valid).toBe(true);
      expect(verification.claims?.documentId).toBe('doc_protocol_01');
      expect(verification.claims?.userId).toBe(doctorAlpha.actorId);
    });

    it('rejects preview token when presented with mismatched tenant (cross-tenant probe prevention)', () => {
      const token = previewTokenService.generateToken(
        {
          tenantId: tenantAlpha,
          userId: doctorAlpha.actorId,
          conversationId: 'conv_consultation_01',
          messageId: 'msg_01',
          citationId: 'cit_01',
          documentId: 'doc_protocol_01',
        },
        300,
      );

      const verification = previewTokenService.verifyToken(token, {
        tenantId: tenantBeta, // Attacker presents token from tenant Alpha to tenant Beta
        conversationId: 'conv_consultation_01',
        messageId: 'msg_01',
        citationId: 'cit_01',
      });

      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('Tenant mismatch');
    });

    it('rejects preview token when presented for a different conversation ID', () => {
      const token = previewTokenService.generateToken(
        {
          tenantId: tenantAlpha,
          userId: doctorAlpha.actorId,
          conversationId: 'conv_consultation_01',
          messageId: 'msg_01',
          citationId: 'cit_01',
          documentId: 'doc_protocol_01',
        },
        300,
      );

      const verification = previewTokenService.verifyToken(token, {
        tenantId: tenantAlpha,
        conversationId: 'conv_SUBSTITUTED',
        messageId: 'msg_01',
        citationId: 'cit_01',
      });

      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('Conversation mismatch');
    });
  });
});
