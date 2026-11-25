import { GetCitationPreviewUseCase } from '../use-cases/get-citation-preview.use-case';
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
  CitationNotFoundError,
  TenantOwnershipViolationError,
} from '../errors/ai-conversation-application.error';

describe('GetCitationPreviewUseCase Unit Tests', () => {
  const tenantId = 'tenant_preview_test_123';
  const userId = 'user_preview_test_123';
  const otherUserId = 'user_other_intruder_456';
  const conversationId = 'conv_preview_test_123';
  const turnId = 'turn_preview_test_123';
  const messageId = 'msg_preview_test_123';
  const citationId = 'cite_preview_test_123';
  const docId = 'doc_preview_test_123';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let citationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;
  let docRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let storagePort: jest.Mocked<IDocumentStoragePort>;
  let useCase: GetCitationPreviewUseCase;

  const validConversation = AiConversation.create({
    id: ConversationId.create(conversationId),
    tenantId,
    userId,
    title: ConversationTitle.create('Physical Therapy Protocol Assessment'),
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
    content: 'Evidence-based knee rehabilitation protocol.',
  });

  const validCitation = AiConversationCitation.create({
    id: citationId,
    messageId,
    turnId,
    conversationId,
    tenantId,
    documentId: docId,
    documentVersionId: 'dver_preview_1',
    chunkId: 'chunk_preview_1',
    citationPosition: 1,
    documentTitleSnapshot: 'Patellofemoral Rehabilitation Guide',
    excerpt: 'Cryotherapy and isometric quadriceps exercises are indicated.',
    pageNumber: 14,
    headingPath: ['Knee Protocols', 'Acute Phase', 'Cryotherapy'],
    retrievalRank: 1,
    relevanceScore: 0.95,
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

    storagePort = {
      exists: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue({ data: Buffer.from('%PDF-1.4 mock pdf content') }),
    };

    useCase = new GetCitationPreviewUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      docRepo,
      storagePort,
    );
  });

  it('1. successfully returns preview availability for authorized PDF document', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Patellofemoral Rehabilitation Guide',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_preview_1',
        originalFileName: 'knee-rehab-guidelines.pdf',
        mimeType: 'application/pdf',
        fileSize: 1048576,
        checksum: 'b'.repeat(64),
        storageKey: 'tenants/t1/knowledge/doc1/v1-knee.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      userId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['PHYSIOTHERAPIST'],
    });

    expect(result.preview).toBeDefined();
    expect(result.preview.documentId).toBe(docId);
    expect(result.preview.citationId).toBe(citationId);
    expect(result.preview.canPreview).toBe(true);
    expect(result.preview.supportedFormat).toBe(true);
    expect(result.preview.previewStatus).toBe('DOCUMENT_AVAILABLE');
    expect(result.preview.mimeType).toBe('application/pdf');
    expect(result.preview.originalFileName).toBe('knee-rehab-guidelines.pdf');
    expect(result.preview.pageNumber).toBe(14);
    expect(result.preview.headingPath).toEqual(['Knee Protocols', 'Acute Phase', 'Cryotherapy']);
    expect(result.preview.downloadAllowed).toBe(true);

    // Invariant: Storage keys and internal storage paths are never leaked
    expect((result.preview as unknown as Record<string, unknown>).storageKey).toBeUndefined();
  });

  it('2. returns UNSUPPORTED_FORMAT for DOCX documents and allows download only', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Word Protocol Document',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_preview_1',
        originalFileName: 'protocol.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 524288,
        checksum: 'c'.repeat(64),
        storageKey: 'tenants/t1/knowledge/doc1/v1-protocol.docx',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      userId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['STAFF'],
    });

    expect(result.preview.canPreview).toBe(false);
    expect(result.preview.supportedFormat).toBe(false);
    expect(result.preview.previewStatus).toBe('UNSUPPORTED_FORMAT');
    expect(result.preview.downloadAllowed).toBe(true);
    expect(result.preview.previewUnavailableReason).toContain('Inline preview is not supported');
  });

  it('3. rejects cross-user access when caller does not own the conversation', async () => {
    await expect(
      useCase.execute({
        tenantId,
        userId: otherUserId, // Different user attempting access
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      }),
    ).rejects.toThrow(TenantOwnershipViolationError);
  });

  it('4. allows privileged role (Owner) to inspect other users conversation citation preview', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Clinical Guide',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_preview_1',
        originalFileName: 'guide.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'd'.repeat(64),
        storageKey: 'tenants/t1/k/guide.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      userId: otherUserId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['Owner'], // Privileged Owner
    });

    expect(result.preview.canPreview).toBe(true);
  });

  it('5. handles soft-deleted document with DOCUMENT_SOFT_DELETED status and disables preview', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Archived Clinical Guide',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_preview_1',
        originalFileName: 'archived.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'e'.repeat(64),
        storageKey: 'tenants/t1/k/archived.pdf',
        uploadedBy: userId,
      },
    });
    mockDoc.softDelete('admin-user');
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      userId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['STAFF'],
    });

    expect(result.preview.canPreview).toBe(false);
    expect(result.preview.previewStatus).toBe('DOCUMENT_SOFT_DELETED');
    expect(result.preview.downloadAllowed).toBe(false);
    expect(result.preview.previewUnavailableReason).toContain('archived or soft-deleted');
  });

  it('6. handles restricted document with DOCUMENT_RESTRICTED status when caller lacks role clearance', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Management Sensitive Document',
      visibilityScope: VisibilityScope.MANAGEMENT,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_preview_1',
        originalFileName: 'management.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'f'.repeat(64),
        storageKey: 'tenants/t1/k/management.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    const result = await useCase.execute({
      tenantId,
      userId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['RECEPTIONIST'], // Lacks MANAGEMENT role
    });

    expect(result.preview.canPreview).toBe(false);
    expect(result.preview.previewStatus).toBe('DOCUMENT_RESTRICTED');
    expect(result.preview.downloadAllowed).toBe(false);
    expect(result.preview.previewUnavailableReason).toContain('restricted by role security policy');
  });

  it('7. handles storage missing file with EXCERPT_ONLY and safe error description', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Missing File Document',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_preview_1',
        originalFileName: 'missing.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: '0'.repeat(64),
        storageKey: 'tenants/t1/k/missing.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);
    storagePort.exists.mockResolvedValue(false); // Storage file missing!

    const result = await useCase.execute({
      tenantId,
      userId,
      conversationId,
      messageId,
      citationId,
      userRoles: ['PHYSIOTHERAPIST'],
    });

    expect(result.preview.canPreview).toBe(false);
    expect(result.preview.previewStatus).toBe('EXCERPT_ONLY');
    expect(result.preview.previewUnavailableReason).toContain('unavailable in storage');
  });

  it('8. throws CitationNotFoundError if citation does not exist in message', async () => {
    citationRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId: 'non-existent-citation-id',
        userRoles: ['STAFF'],
      }),
    ).rejects.toThrow(CitationNotFoundError);
  });
});
