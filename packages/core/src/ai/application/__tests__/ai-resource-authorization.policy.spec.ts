import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';
import {
  AiResourceAuthorizationPolicy,
  AiActorContext,
  ConversationResourceSummary,
  DocumentResourceSummary,
  DocumentVersionResourceSummary,
} from '../services/ai-resource-authorization.policy';
import {
  ConversationNotFoundError,
  MessageNotBelongingToConversationError,
  CitationNotFoundError,
} from '../errors/ai-conversation-application.error';
import {
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
} from '../../domain/exceptions/knowledge-document.exceptions';

describe('AI-10.1-05: AiResourceAuthorizationPolicy', () => {
  let policy: AiResourceAuthorizationPolicy;

  beforeEach(() => {
    policy = new AiResourceAuthorizationPolicy();
  });

  const tenantAlpha = 'tenant_alpha';
  const tenantBeta = 'tenant_beta';

  const userAlphaDoctor: AiActorContext = {
    actorId: 'usr_doc_alpha',
    tenantId: tenantAlpha,
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userAlphaTrainer: AiActorContext = {
    actorId: 'usr_trainer_alpha',
    tenantId: tenantAlpha,
    roles: ['Trainer'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const userAlphaOwner: AiActorContext = {
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

  const userBetaDoctor: AiActorContext = {
    actorId: 'usr_doc_beta',
    tenantId: tenantBeta,
    roles: ['Therapist'],
    permissions: ['ai.conversations.create', 'ai.documents.upload', 'ai.knowledge.query'],
  };

  const sampleConv: ConversationResourceSummary = {
    id: 'conv_100',
    tenantId: tenantAlpha,
    userId: 'usr_doc_alpha',
  };

  const sampleDoc: DocumentResourceSummary = {
    id: 'doc_200',
    tenantId: tenantAlpha,
    uploadedBy: 'usr_doc_alpha',
    visibilityScope: VisibilityScope.CLINICAL_STAFF,
    deletedAt: null,
  };

  describe('A. Conversation Authorization', () => {
    describe('assertConversationAccess', () => {
      it('allows conversation creator within same tenant to access conversation', () => {
        expect(() => policy.assertConversationAccess(userAlphaDoctor, sampleConv)).not.toThrow();
      });

      it('rejects cross-user access within same tenant with ConversationNotFoundError (anti-BOLA 404)', () => {
        expect(() => policy.assertConversationAccess(userAlphaTrainer, sampleConv)).toThrow(
          ConversationNotFoundError,
        );
      });

      it('rejects cross-tenant access with ConversationNotFoundError (anti-IDOR 404)', () => {
        expect(() => policy.assertConversationAccess(userBetaDoctor, sampleConv)).toThrow(
          ConversationNotFoundError,
        );
      });

      it('fails closed when actor or conversation context is missing or incomplete', () => {
        expect(() =>
          policy.assertConversationAccess(null as unknown as AiActorContext, sampleConv),
        ).toThrow(ConversationNotFoundError);

        expect(() =>
          policy.assertConversationAccess(
            userAlphaDoctor,
            null as unknown as ConversationResourceSummary,
          ),
        ).toThrow(ConversationNotFoundError);

        expect(() =>
          policy.assertConversationAccess({ actorId: 'usr_doc_alpha', tenantId: '' }, sampleConv),
        ).toThrow(ConversationNotFoundError);
      });
    });

    describe('assertConversationArchival', () => {
      it('allows creator to archive their own conversation', () => {
        expect(() =>
          policy.assertConversationArchival(userAlphaDoctor, sampleConv, false),
        ).not.toThrow();
      });

      it('allows Owner to archive peer conversation via administrative override', () => {
        expect(() =>
          policy.assertConversationArchival(userAlphaOwner, sampleConv, true),
        ).not.toThrow();
      });

      it('allows user possessing ai.conversations.manage to archive peer conversation', () => {
        const adminUser: AiActorContext = {
          actorId: 'usr_admin',
          tenantId: tenantAlpha,
          roles: ['Staff'],
          permissions: ['ai.conversations.manage'],
        };
        expect(() => policy.assertConversationArchival(adminUser, sampleConv, true)).not.toThrow();
      });

      it('rejects non-owner, non-admin user attempting to archive peer conversation', () => {
        expect(() =>
          policy.assertConversationArchival(userAlphaTrainer, sampleConv, false),
        ).toThrow(ConversationNotFoundError);
      });

      it('rejects cross-tenant archival attempt even by an Owner', () => {
        const ownerBeta: AiActorContext = {
          actorId: 'usr_owner_beta',
          tenantId: tenantBeta,
          roles: ['Owner'],
          permissions: ['ai.conversations.manage'],
        };
        expect(() => policy.assertConversationArchival(ownerBeta, sampleConv, true)).toThrow(
          ConversationNotFoundError,
        );
      });
    });

    describe('Message & Citation Association Rules', () => {
      it('validates message belongs strictly to expected conversation', () => {
        expect(() =>
          policy.assertMessageBelongsToConversation('conv_100', 'conv_100', 'msg_1'),
        ).not.toThrow();

        expect(() =>
          policy.assertMessageBelongsToConversation('conv_OTHER', 'conv_100', 'msg_1'),
        ).toThrow(MessageNotBelongingToConversationError);
      });

      it('validates citation belongs strictly to expected message', () => {
        expect(() =>
          policy.assertCitationBelongsToMessage('msg_1', 'msg_1', 'cit_1', 'conv_100'),
        ).not.toThrow();

        expect(() =>
          policy.assertCitationBelongsToMessage('msg_OTHER', 'msg_1', 'cit_1', 'conv_100'),
        ).toThrow(CitationNotFoundError);
      });
    });
  });

  describe('B. Document Authorization', () => {
    const clinicalScopes = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
    const operationalScopes = [VisibilityScope.ALL_STAFF];

    describe('canAccessDocument and assertDocumentAccess', () => {
      it('authorizes document access when tenant matches, document is active, and scope is cleared', () => {
        expect(policy.canAccessDocument(userAlphaDoctor, sampleDoc, clinicalScopes)).toBe(true);
        expect(() =>
          policy.assertDocumentAccess(userAlphaDoctor, sampleDoc, clinicalScopes),
        ).not.toThrow();
      });

      it('denies access when user role lacks visibility scope clearance', () => {
        expect(policy.canAccessDocument(userAlphaTrainer, sampleDoc, operationalScopes)).toBe(
          false,
        );
        expect(() =>
          policy.assertDocumentAccess(userAlphaTrainer, sampleDoc, operationalScopes),
        ).toThrow(UnauthorizedDocumentAccessException);
      });

      it('denies access to soft-deleted documents (indistinguishable 404)', () => {
        const deletedDoc: DocumentResourceSummary = {
          ...sampleDoc,
          deletedAt: new Date(),
        };
        expect(policy.canAccessDocument(userAlphaDoctor, deletedDoc, clinicalScopes)).toBe(false);
        expect(() =>
          policy.assertDocumentAccess(userAlphaDoctor, deletedDoc, clinicalScopes),
        ).toThrow(DocumentNotFoundException);
      });

      it('denies access to cross-tenant documents (indistinguishable 404)', () => {
        expect(policy.canAccessDocument(userBetaDoctor, sampleDoc, clinicalScopes)).toBe(false);
        expect(() =>
          policy.assertDocumentAccess(userBetaDoctor, sampleDoc, clinicalScopes),
        ).toThrow(DocumentNotFoundException);
      });
    });

    describe('canManageDocument and assertDocumentManage', () => {
      it('authorizes original uploader to manage document', () => {
        expect(policy.canManageDocument(userAlphaDoctor, sampleDoc)).toBe(true);
        expect(() => policy.assertDocumentManage(userAlphaDoctor, sampleDoc)).not.toThrow();
      });

      it('authorizes Owner to manage any document in tenant', () => {
        expect(policy.canManageDocument(userAlphaOwner, sampleDoc)).toBe(true);
        expect(() => policy.assertDocumentManage(userAlphaOwner, sampleDoc)).not.toThrow();
      });

      it('authorizes user possessing ai.documents.manage to manage peer document', () => {
        const manager: AiActorContext = {
          actorId: 'usr_manager',
          tenantId: tenantAlpha,
          roles: ['Staff'],
          permissions: ['ai.documents.manage'],
        };
        expect(policy.canManageDocument(manager, sampleDoc)).toBe(true);
        expect(() => policy.assertDocumentManage(manager, sampleDoc)).not.toThrow();
      });

      it('denies non-uploader without administrative capability from managing document', () => {
        expect(policy.canManageDocument(userAlphaTrainer, sampleDoc)).toBe(false);
        expect(() => policy.assertDocumentManage(userAlphaTrainer, sampleDoc)).toThrow(
          UnauthorizedDocumentAccessException,
        );
      });

      it('denies cross-tenant document management attempt (404)', () => {
        expect(policy.canManageDocument(userBetaDoctor, sampleDoc)).toBe(false);
        expect(() => policy.assertDocumentManage(userBetaDoctor, sampleDoc)).toThrow(
          DocumentNotFoundException,
        );
      });
    });

    describe('assertDocumentVersionAccess', () => {
      const validVersion: DocumentVersionResourceSummary = {
        id: 'ver_1',
        documentId: 'doc_200',
        versionNumber: 1,
      };

      it('authorizes version access when version belongs to parent document and parent is cleared', () => {
        expect(() =>
          policy.assertDocumentVersionAccess(
            userAlphaDoctor,
            sampleDoc,
            validVersion,
            clinicalScopes,
          ),
        ).not.toThrow();
      });

      it('rejects version when version does not match parent document ID', () => {
        const mismatchedVersion: DocumentVersionResourceSummary = {
          id: 'ver_1',
          documentId: 'doc_DIFFERENT',
          versionNumber: 1,
        };
        expect(() =>
          policy.assertDocumentVersionAccess(
            userAlphaDoctor,
            sampleDoc,
            mismatchedVersion,
            clinicalScopes,
          ),
        ).toThrow(DocumentNotFoundException);
      });

      it('rejects version when user lacks clearance for parent document', () => {
        expect(() =>
          policy.assertDocumentVersionAccess(
            userAlphaTrainer,
            sampleDoc,
            validVersion,
            operationalScopes,
          ),
        ).toThrow(UnauthorizedDocumentAccessException);
      });
    });
  });

  describe('C. Knowledge Source & Retrieval Eligibility', () => {
    const clinicalScopes = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
    const operationalScopes = [VisibilityScope.ALL_STAFF];

    it('confirms document is eligible as knowledge source when active, same-tenant, and scope is cleared', () => {
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(sampleDoc, tenantAlpha, clinicalScopes),
      ).toBe(true);
    });

    it('rejects soft-deleted document from serving as knowledge source', () => {
      const deletedDoc: DocumentResourceSummary = {
        ...sampleDoc,
        deletedAt: new Date(),
      };
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(deletedDoc, tenantAlpha, clinicalScopes),
      ).toBe(false);
    });

    it('rejects document when actor lacks visibility scope clearance', () => {
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(sampleDoc, tenantAlpha, operationalScopes),
      ).toBe(false);
    });

    it('rejects document belonging to another tenant', () => {
      expect(
        policy.isDocumentEligibleAsKnowledgeSource(sampleDoc, tenantBeta, clinicalScopes),
      ).toBe(false);
    });

    it('re-evaluates citation source access dynamically (assertCitationSourceAccess)', () => {
      expect(() =>
        policy.assertCitationSourceAccess(userAlphaDoctor, sampleDoc, clinicalScopes),
      ).not.toThrow();

      const archivedDoc: DocumentResourceSummary = {
        ...sampleDoc,
        deletedAt: new Date(),
      };
      expect(() =>
        policy.assertCitationSourceAccess(userAlphaDoctor, archivedDoc, clinicalScopes),
      ).toThrow(DocumentNotFoundException);
    });
  });

  describe('D. Permission Revocation & Role Change Dynamic Handling', () => {
    it('revokes document access immediately when role clearance is downgraded', () => {
      // Step 1: User has Clinical clearance
      let allowedScopes = [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF];
      expect(policy.canAccessDocument(userAlphaDoctor, sampleDoc, allowedScopes)).toBe(true);

      // Step 2: Role is downgraded to Receptionist (General Staff clearance only)
      allowedScopes = [VisibilityScope.ALL_STAFF];
      expect(policy.canAccessDocument(userAlphaDoctor, sampleDoc, allowedScopes)).toBe(false);
      expect(() => policy.assertDocumentAccess(userAlphaDoctor, sampleDoc, allowedScopes)).toThrow(
        UnauthorizedDocumentAccessException,
      );
    });

    it('revokes management authority when user loses ai.documents.manage permission', () => {
      const peerDoc: DocumentResourceSummary = {
        id: 'doc_300',
        tenantId: tenantAlpha,
        uploadedBy: 'usr_different',
        visibilityScope: VisibilityScope.ALL_STAFF,
        deletedAt: null,
      };

      // Step 1: User has ai.documents.manage
      let actor: AiActorContext = {
        actorId: 'usr_staff_1',
        tenantId: tenantAlpha,
        roles: ['Staff'],
        permissions: ['ai.documents.manage'],
      };
      expect(policy.canManageDocument(actor, peerDoc)).toBe(true);

      // Step 2: Permission is revoked
      actor = {
        actorId: 'usr_staff_1',
        tenantId: tenantAlpha,
        roles: ['Staff'],
        permissions: [],
      };
      expect(policy.canManageDocument(actor, peerDoc)).toBe(false);
      expect(() => policy.assertDocumentManage(actor, peerDoc)).toThrow(
        UnauthorizedDocumentAccessException,
      );
    });
  });
});
