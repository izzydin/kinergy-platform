import { GetMessageCitationsUseCase } from '../use-cases/get-message-citations.use-case';
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
  ConversationNotFoundError,
  MessageNotFoundError,
} from '../errors/ai-conversation-application.error';

describe('GetMessageCitationsUseCase Unit Tests', () => {
  const tenantId = 'tenant_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const userId = 'user_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const conversationId = 'conv_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const turnId = 'turn_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const messageId = 'msg_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';
  const docId = 'doc_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let citationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;
  let docRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let useCase: GetMessageCitationsUseCase;

  const validConversation = AiConversation.create({
    id: ConversationId.create(conversationId),
    tenantId,
    userId,
    title: ConversationTitle.create('Physical Therapy Treatment Plan'),
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
    content: 'Cervical traction is indicated for relief of nerve compression.',
  });

  const validCitation = AiConversationCitation.create({
    id: 'cite_123',
    messageId,
    turnId,
    conversationId,
    tenantId,
    documentId: docId,
    documentVersionId: 'dver_123',
    chunkId: 'chunk_123',
    citationPosition: 1,
    documentTitleSnapshot: 'Cervical Spine Rehabilitation',
    excerpt: 'Gentle progressive traction is indicated.',
    pageNumber: 15,
    headingPath: ['Chapter 2', 'Traction Guidelines'],
    retrievalRank: 1,
    relevanceScore: 0.94,
    sourceStrategy: 'HYBRID',
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
      listByMessage: jest.fn().mockResolvedValue([validCitation]),
      save: jest.fn(),
      saveMany: jest.fn(),
      findById: jest.fn(),
      listByConversation: jest.fn(),
      deleteByMessage: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationCitationRepositoryPort>;

    docRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IKnowledgeDocumentRepositoryPort>;

    useCase = new GetMessageCitationsUseCase(convRepo, messageRepo, citationRepo, docRepo);
  });

  it('1. successfully returns citations with DOCUMENT_AVAILABLE status when document exists and user is cleared', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Cervical Spine Rehabilitation',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      userRoles: ['TRAINER'],
    });

    expect(result.conversationId).toBe(conversationId);
    expect(result.messageId).toBe(messageId);
    expect(result.totalCitations).toBe(1);
    expect(result.citations[0]?.id).toBe('cite_123');
    expect(result.citations[0]?.previewStatus).toBe('DOCUMENT_AVAILABLE');
    expect(result.citations[0]?.canPreview).toBe(true);
    expect(result.citations[0]?.previewUnavailableReason).toBeNull();
  });

  it('2. maps previewStatus to DOCUMENT_SOFT_DELETED if document has been archived/deleted', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Cervical Spine Rehabilitation',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
    });
    mockDoc.softDelete(userId);
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      userRoles: ['TRAINER'],
    });

    expect(result.citations[0]?.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
    expect(result.citations[0]?.canPreview).toBe(false);
    expect(result.citations[0]?.previewUnavailableReason).toContain('archived or soft-deleted');
  });

  it('3. maps previewStatus to DOCUMENT_RESTRICTED if user lacks role clearance for document scope', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Clinical Protocols - Confidential',
      visibilityScope: VisibilityScope.MANAGEMENT,
      uploadedBy: userId,
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      userRoles: ['TRAINER'],
    });

    expect(result.citations[0]?.previewStatus).toBe('DOCUMENT_RESTRICTED');
    expect(result.citations[0]?.canPreview).toBe(false);
    expect(result.citations[0]?.previewUnavailableReason).toContain(
      'restricted by role security policy',
    );
  });

  it('4. maps previewStatus to EXCERPT_ONLY if document is not found in knowledge repository', async () => {
    docRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId,
      conversationId,
      messageId,
      userRoles: ['ADMIN'],
    });

    expect(result.citations[0]?.previewStatus).toBe('EXCERPT_ONLY');
    expect(result.citations[0]?.canPreview).toBe(false);
    expect(result.citations[0]?.documentTitleSnapshot).toBe('Cervical Spine Rehabilitation');
  });

  it('5. throws ConversationNotFoundError if conversation does not exist in tenant', async () => {
    convRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        conversationId,
        messageId,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('6. throws MessageNotFoundError if message does not exist or belongs to different conversation', async () => {
    messageRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        conversationId,
        messageId,
      }),
    ).rejects.toThrow(MessageNotFoundError);
  });
});
