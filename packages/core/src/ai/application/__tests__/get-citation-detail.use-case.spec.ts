import { GetCitationDetailUseCase } from '../use-cases/get-citation-detail.use-case';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { IKnowledgeDocumentRepositoryPort } from '../../ports/outbound/knowledge-document-repository.port';
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
  CitationNotFoundError,
  ConversationNotFoundError,
  MessageNotFoundError,
} from '../errors/ai-conversation-application.error';

describe('GetCitationDetailUseCase Unit Tests', () => {
  const tenantId = 'tenant_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const userId = 'user_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const conversationId = 'conv_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const turnId = 'turn_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const messageId = 'msg_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const citationId = 'cite_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const docId = 'doc_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let citationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;
  let docRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let useCase: GetCitationDetailUseCase;

  const validConversation = AiConversation.create({
    id: ConversationId.create(conversationId),
    tenantId,
    userId,
    title: ConversationTitle.create('Treatment Protocol Assessment'),
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
    content: 'Evidence-based cervical traction protocol.',
  });

  const validCitation = AiConversationCitation.create({
    id: citationId,
    messageId,
    turnId,
    conversationId,
    tenantId,
    documentId: docId,
    documentVersionId: 'dver_123',
    chunkId: 'chunk_123',
    citationPosition: 1,
    documentTitleSnapshot: 'Cervical Spine Rehabilitation',
    excerpt: 'Detailed protocol for mechanical cervical traction.',
    pageNumber: 18,
    headingPath: ['Guidelines', 'Mechanical Traction'],
    retrievalRank: 1,
    relevanceScore: 0.96,
    sourceStrategy: 'RERANKED',
    metadata: null,
  });

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
      listByMessage: jest.fn(),
      listByConversation: jest.fn(),
      deleteByMessage: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationCitationRepositoryPort>;

    docRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    useCase = new GetCitationDetailUseCase(convRepo, messageRepo, citationRepo, docRepo);
  });

  it('1. successfully returns detailed citation metadata with DOCUMENT_AVAILABLE status and version info', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Cervical Spine Rehabilitation',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_123',
        originalFileName: 'cervical-rehab-guidelines.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048576,
        checksum: 'a'.repeat(64),
        storageKey: 'tenants/t1/docs/cervical-rehab.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['TRAINER'],
    });

    expect(result.citation).toBeDefined();
    expect(result.citation.id).toBe(citationId);
    expect(result.citation.turnId).toBe(turnId);
    expect(result.citation.excerpt).toBe('Detailed protocol for mechanical cervical traction.');
    expect(result.citation.previewStatus).toBe('DOCUMENT_AVAILABLE');
    expect(result.citation.documentStatus).toBe('ACTIVE');
    expect(result.citation.originalFileName).toBe('cervical-rehab-guidelines.pdf');
    expect(result.citation.mimeType).toBe('application/pdf');
    expect(result.citation.fileSizeBytes).toBe(2048576);
    expect(result.citation.documentVersionNumber).toBe(1);
    expect(result.citation.canPreview).toBe(true);
    expect(result.citation.pageNumber).toBe(18);

    // Security invariant: internal storageKey and physical path must NOT be leaked
    expect((result.citation as unknown as Record<string, unknown>).storageKey).toBeUndefined();
    expect((result.citation as unknown as Record<string, unknown>).storagePath).toBeUndefined();
  });

  it('2. handles soft-deleted document with DOCUMENT_SOFT_DELETED status and ARCHIVED status', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Archived Rehabilitation Protocol',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
    });
    mockDoc.softDelete(userId);
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['TRAINER'],
    });

    expect(result.citation.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
    expect(result.citation.documentStatus).toBe('ARCHIVED');
    expect(result.citation.canPreview).toBe(false);
    expect(result.citation.previewUnavailableReason).toContain('archived or soft-deleted');
  });

  it('3. handles role-restricted document with DOCUMENT_RESTRICTED status and RESTRICTED status', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Confidential Protocol',
      visibilityScope: VisibilityScope.MANAGEMENT,
      uploadedBy: userId,
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['TRAINER'], // Lacks MANAGEMENT role
    });

    expect(result.citation.previewStatus).toBe('DOCUMENT_RESTRICTED');
    expect(result.citation.documentStatus).toBe('RESTRICTED');
    expect(result.citation.canPreview).toBe(false);
    expect(result.citation.previewUnavailableReason).toContain(
      'restricted by role security policy',
    );
  });

  it('4. throws CitationNotFoundError if citation is not found for message', async () => {
    citationRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        conversationId,
        messageId,
        citationId,
      }),
    ).rejects.toThrow(CitationNotFoundError);
  });

  it('3. throws ConversationNotFoundError if conversation is missing', async () => {
    convRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        conversationId,
        messageId,
        citationId,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('4. throws MessageNotFoundError if message is missing', async () => {
    messageRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        conversationId,
        messageId,
        citationId,
      }),
    ).rejects.toThrow(MessageNotFoundError);
  });
});
