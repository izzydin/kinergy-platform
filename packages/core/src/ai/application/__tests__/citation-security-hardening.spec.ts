import { GetCitationPreviewUseCase } from '../use-cases/get-citation-preview.use-case';
import { GetCitationDocumentStreamUseCase } from '../use-cases/get-citation-document-stream.use-case';
import { GetCitationDetailUseCase } from '../use-cases/get-citation-detail.use-case';
import { GetMessageCitationsUseCase } from '../use-cases/get-message-citations.use-case';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { IKnowledgeDocumentRepositoryPort } from '../../ports/outbound/knowledge-document-repository.port';
import { IDocumentStoragePort } from '../../ports/outbound/document-storage.port';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { AiConversationCitation } from '../../domain/models/ai-conversation-citation.entity';
import { KnowledgeDocument } from '../../domain/models/knowledge-document.aggregate';
import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../domain/value-objects/turn-id.vo';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import {
  TenantOwnershipViolationError,
  DocumentAccessRestrictedError,
  DocumentArchivedOrDeletedError,
  DocumentPreviewUnsupportedFormatError,
  DocumentFileNotFoundInStorageError,
} from '../errors/ai-conversation-application.error';

describe('CIT.08 — Citation Security, Resilience & Hardening Core Tests', () => {
  const tenantId = 'tenant_hardened_100';
  const otherTenantId = 'tenant_intruder_999';
  const userId = 'user_author_200';
  const otherUserId = 'user_intruder_201';
  const conversationId = 'conv_hardened_300';
  const turnId = 'turn_hardened_400';
  const messageId = 'msg_hardened_500';
  const citationId = 'cite_hardened_600';
  const docId = 'doc_hardened_700';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let citationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;
  let docRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let storagePort: jest.Mocked<IDocumentStoragePort>;

  let previewUseCase: GetCitationPreviewUseCase;
  let streamUseCase: GetCitationDocumentStreamUseCase;
  let detailUseCase: GetCitationDetailUseCase;
  let messageCitationsUseCase: GetMessageCitationsUseCase;

  const validConversation = AiConversation.create({
    id: ConversationId.create(conversationId),
    tenantId,
    userId,
    title: ConversationTitle.create('Protocolo de Prueba de Seguridad'),
  });

  const validMessage = AiConversationMessage.create({
    id: MessageId.create(messageId),
    turnId: TurnId.create(turnId),
    conversationId: ConversationId.create(conversationId),
    tenantId,
    role: ConversationRole.ASSISTANT,
    sequenceNumber: 2,
    attemptNumber: 1,
    isCanonical: true,
    status: GenerationStatus.SUCCESS,
    content: 'Respuesta con evidencia científica citada.',
  });

  const validCitation = AiConversationCitation.create({
    id: citationId,
    messageId,
    turnId,
    conversationId,
    tenantId,
    documentId: docId,
    documentVersionId: 'v_cited_historical_1',
    chunkId: 'chunk_hardened_1',
    citationPosition: 1,
    documentTitleSnapshot: 'Tratado de Medicina Física',
    excerpt: 'Extracto de evidencia clínica verificada.',
    pageNumber: 10,
    headingPath: ['Capítulo 2', 'Evidencia'],
    retrievalRank: 1,
    relevanceScore: 0.96,
    sourceStrategy: 'RERANKED',
    metadata: null,
  });

  const mockPdfBytes = Buffer.from('%PDF-1.4 test secure stream content');

  beforeEach(() => {
    convRepo = {
      findById: jest.fn().mockResolvedValue(validConversation),
      save: jest.fn(),
      listByUser: jest.fn(),
      updateMetadata: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    messageRepo = {
      findById: jest.fn().mockResolvedValue(validMessage),
      save: jest.fn(),
      listByConversation: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    citationRepo = {
      findById: jest.fn().mockResolvedValue(validCitation),
      save: jest.fn(),
      saveMany: jest.fn(),
      listByMessage: jest.fn().mockResolvedValue([validCitation]),
      listByConversation: jest.fn(),
      deleteByMessage: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationCitationRepositoryPort>;

    docRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    storagePort = {
      exists: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue({ data: mockPdfBytes }),
    };

    previewUseCase = new GetCitationPreviewUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      docRepo,
      storagePort,
    );

    streamUseCase = new GetCitationDocumentStreamUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      docRepo,
      storagePort,
    );

    detailUseCase = new GetCitationDetailUseCase(convRepo, messageRepo, citationRepo, docRepo);

    messageCitationsUseCase = new GetMessageCitationsUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      docRepo,
    );
  });

  describe('1. Version Integrity & Silent Drift Prevention', () => {
    it('does NOT silently fall back to current version when cited version is missing from repository', async () => {
      // Document only has version 2 ('v_updated_2'), whereas citation cited version 1 ('v_cited_historical_1')
      const docWithNewVersion = KnowledgeDocument.create({
        id: docId,
        tenantId,
        title: 'Tratado de Medicina Física',
        visibilityScope: VisibilityScope.ALL_STAFF,
        uploadedBy: userId,
        initialVersion: {
          id: 'v_updated_2', // Different version ID!
          originalFileName: 'tratado-v2.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: 'a'.repeat(64),
          storageKey: 'tenants/t1/v2.pdf',
          uploadedBy: userId,
        },
      });
      docRepo.findById.mockResolvedValue(docWithNewVersion);

      // In Preview: fails closed to EXCERPT_ONLY and blocks download to prevent presenting newer content as historical evidence
      const previewResult = await previewUseCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      });

      expect(previewResult.preview.canPreview).toBe(false);
      expect(previewResult.preview.previewStatus).toBe('EXCERPT_ONLY');
      expect(previewResult.preview.downloadAllowed).toBe(false);
      expect(previewResult.preview.previewUnavailableReason).toContain(
        'The specific document version originally cited is no longer available in the repository.',
      );

      // In Stream: throws DocumentArchivedOrDeletedError instead of serving modern version
      await expect(
        streamUseCase.execute({
          tenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(DocumentArchivedOrDeletedError);

      // In Detail: marks EXCERPT_ONLY without newer version metadata
      const detailResult = await detailUseCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      });
      expect(detailResult.citation.previewStatus).toBe('EXCERPT_ONLY');
      expect(detailResult.citation.canPreview).toBe(false);
    });
  });

  describe('2. Tenant and Cross-User Isolation', () => {
    it('rejects cross-tenant access to citation preview', async () => {
      await expect(
        previewUseCase.execute({
          tenantId: otherTenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('rejects cross-user access attempting to view citation from another users conversation', async () => {
      await expect(
        previewUseCase.execute({
          tenantId,
          userId: otherUserId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('rejects cross-tenant access to citation stream endpoint', async () => {
      await expect(
        streamUseCase.execute({
          tenantId: otherTenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });
  });

  describe('3. Role Clearance and Access Enforcement', () => {
    it('returns DOCUMENT_RESTRICTED when caller lacks required role clearance for document', async () => {
      const restrictedDoc = KnowledgeDocument.create({
        id: docId,
        tenantId,
        title: 'Documento Clínico Confidencial',
        visibilityScope: VisibilityScope.MANAGEMENT,
        uploadedBy: 'admin_1',
        initialVersion: {
          id: 'v_cited_historical_1',
          originalFileName: 'confidencial.pdf',
          mimeType: 'application/pdf',
          fileSize: 4096,
          checksum: 'c'.repeat(64),
          storageKey: 'tenants/t1/conf.pdf',
          uploadedBy: 'admin_1',
        },
      });
      docRepo.findById.mockResolvedValue(restrictedDoc);

      const previewResult = await previewUseCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['JUNIOR_PHYSIO'], // Lacks required role
      });

      expect(previewResult.preview.canPreview).toBe(false);
      expect(previewResult.preview.previewStatus).toBe('DOCUMENT_RESTRICTED');
      expect(previewResult.preview.downloadAllowed).toBe(false);

      // Streaming must throw DocumentAccessRestrictedError
      await expect(
        streamUseCase.execute({
          tenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['JUNIOR_PHYSIO'],
        }),
      ).rejects.toThrow(DocumentAccessRestrictedError);
    });
  });

  describe('4. Deleted and Archived Documents Handling', () => {
    it('returns DOCUMENT_SOFT_DELETED and blocks stream when document was deleted', async () => {
      const deletedDoc = KnowledgeDocument.create({
        id: docId,
        tenantId,
        title: 'Documento Obsoleto',
        visibilityScope: VisibilityScope.ALL_STAFF,
        uploadedBy: userId,
        initialVersion: {
          id: 'v_cited_historical_1',
          originalFileName: 'obsoleto.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          checksum: 'd'.repeat(64),
          storageKey: 'tenants/t1/obs.pdf',
          uploadedBy: userId,
        },
      });
      deletedDoc.softDelete(userId); // soft-deleted
      docRepo.findById.mockResolvedValue(deletedDoc);

      const previewResult = await previewUseCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      });

      expect(previewResult.preview.canPreview).toBe(false);
      expect(previewResult.preview.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
      expect(previewResult.preview.downloadAllowed).toBe(false);

      await expect(
        streamUseCase.execute({
          tenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(DocumentArchivedOrDeletedError);
    });
  });

  describe('5. Storage Failure & Missing Physical File', () => {
    it('returns EXCERPT_ONLY when document exists in catalog but physical file is missing from storage', async () => {
      const mockDoc = KnowledgeDocument.create({
        id: docId,
        tenantId,
        title: 'Tratado de Medicina Física',
        visibilityScope: VisibilityScope.ALL_STAFF,
        uploadedBy: userId,
        initialVersion: {
          id: 'v_cited_historical_1',
          originalFileName: 'tratado.pdf',
          mimeType: 'application/pdf',
          fileSize: 4096,
          checksum: 'e'.repeat(64),
          storageKey: 'tenants/t1/missing.pdf',
          uploadedBy: userId,
        },
      });
      docRepo.findById.mockResolvedValue(mockDoc);
      storagePort.exists.mockResolvedValue(false); // File missing in object store

      const previewResult = await previewUseCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      });

      expect(previewResult.preview.canPreview).toBe(false);
      expect(previewResult.preview.previewStatus).toBe('EXCERPT_ONLY');
      expect(previewResult.preview.downloadAllowed).toBe(false);

      await expect(
        streamUseCase.execute({
          tenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(DocumentFileNotFoundInStorageError);
    });
  });

  describe('6. Unsupported Media Type Stream Rejection', () => {
    it('rejects inline streaming of unsupported binary formats with DocumentPreviewUnsupportedFormatError', async () => {
      const docxDoc = KnowledgeDocument.create({
        id: docId,
        tenantId,
        title: 'Protocolo de Rehabilitación DOCX',
        visibilityScope: VisibilityScope.ALL_STAFF,
        uploadedBy: userId,
        initialVersion: {
          id: 'v_cited_historical_1',
          originalFileName: 'protocolo.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSize: 8192,
          checksum: 'f'.repeat(64),
          storageKey: 'tenants/t1/protocolo.docx',
          uploadedBy: userId,
        },
      });
      docRepo.findById.mockResolvedValue(docxDoc);

      await expect(
        streamUseCase.execute({
          tenantId,
          userId,
          conversationId,
          messageId,
          citationId,
          userRoles: ['PHYSIOTHERAPIST'],
        }),
      ).rejects.toThrow(DocumentPreviewUnsupportedFormatError);
    });
  });

  describe('7. Citation Determinism and Integrity', () => {
    it('enforces deterministic citation ordering by citationPosition ASC', async () => {
      const citation3 = AiConversationCitation.create({
        id: 'cite-pos-3',
        messageId,
        turnId,
        conversationId,
        tenantId,
        documentId: 'doc-3',
        documentVersionId: 'v1',
        chunkId: 'chunk-3',
        citationPosition: 3,
        documentTitleSnapshot: 'Tercera Fuente',
        excerpt: 'Extracto 3',
        pageNumber: 30,
        headingPath: [],
        retrievalRank: 3,
        relevanceScore: 0.8,
        sourceStrategy: 'HYBRID',
        metadata: null,
      });

      const citation1 = AiConversationCitation.create({
        id: 'cite-pos-1',
        messageId,
        turnId,
        conversationId,
        tenantId,
        documentId: 'doc-1',
        documentVersionId: 'v1',
        chunkId: 'chunk-1',
        citationPosition: 1,
        documentTitleSnapshot: 'Primera Fuente',
        excerpt: 'Extracto 1',
        pageNumber: 10,
        headingPath: [],
        retrievalRank: 1,
        relevanceScore: 0.95,
        sourceStrategy: 'HYBRID',
        metadata: null,
      });

      // Repository returns them out of order [cite-3, cite-1]
      citationRepo.listByMessage.mockResolvedValue([citation3, citation1]);
      docRepo.findById.mockResolvedValue(null);

      const result = await messageCitationsUseCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        userRoles: ['PHYSIOTHERAPIST'],
      });

      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]!.citationPosition).toBe(1);
      expect(result.citations[0]!.id).toBe('cite-pos-1');
      expect(result.citations[1]!.citationPosition).toBe(3);
      expect(result.citations[1]!.id).toBe('cite-pos-3');
    });
  });
});
