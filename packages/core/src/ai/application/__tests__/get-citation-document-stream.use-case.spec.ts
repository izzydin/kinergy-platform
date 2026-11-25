import { GetCitationDocumentStreamUseCase } from '../use-cases/get-citation-document-stream.use-case';
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
  DocumentAccessRestrictedError,
  DocumentArchivedOrDeletedError,
  DocumentPreviewUnsupportedFormatError,
  DocumentFileNotFoundInStorageError,
} from '../errors/ai-conversation-application.error';

describe('GetCitationDocumentStreamUseCase Unit Tests', () => {
  const tenantId = 'tenant_stream_123';
  const userId = 'user_stream_123';
  const intruderUserId = 'user_intruder_456';
  const conversationId = 'conv_stream_123';
  const turnId = 'turn_stream_123';
  const messageId = 'msg_stream_123';
  const citationId = 'cite_stream_123';
  const docId = 'doc_stream_123';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let citationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;
  let docRepo: jest.Mocked<IKnowledgeDocumentRepositoryPort>;
  let storagePort: jest.Mocked<IDocumentStoragePort>;
  let useCase: GetCitationDocumentStreamUseCase;

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
    documentVersionId: 'dver_stream_1',
    chunkId: 'chunk_stream_1',
    citationPosition: 1,
    documentTitleSnapshot: 'Patellofemoral Rehabilitation Guide',
    excerpt: 'Cryotherapy and isometric quadriceps exercises are indicated.',
    pageNumber: 22,
    headingPath: ['Knee Protocols', 'Acute Phase'],
    retrievalRank: 1,
    relevanceScore: 0.95,
    sourceStrategy: 'RERANKED',
    metadata: null,
  });

  const samplePdfBuffer = Buffer.from('%PDF-1.4 binary mock data');

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
      download: jest.fn().mockResolvedValue({ data: samplePdfBuffer }),
    };

    useCase = new GetCitationDocumentStreamUseCase(
      convRepo,
      messageRepo,
      citationRepo,
      docRepo,
      storagePort,
    );
  });

  it('1. successfully streams authorized PDF document content with page citation provenance', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Patellofemoral Rehabilitation Guide',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_stream_1',
        originalFileName: 'knee-rehab-guidelines.pdf',
        mimeType: 'application/pdf',
        fileSize: samplePdfBuffer.length,
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

    expect(result.data).toEqual(samplePdfBuffer);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.fileSize).toBe(samplePdfBuffer.length);
    expect(result.originalFileName).toBe('knee-rehab-guidelines.pdf');
    expect(result.pageNumber).toBe(22);
    expect(result.headingPath).toEqual(['Knee Protocols', 'Acute Phase']);
    expect(result.checksum).toBe('b'.repeat(64));

    // Internal storage details must not be in the output
    expect((result as unknown as Record<string, unknown>).storageKey).toBeUndefined();
  });

  it('2. rejects cross-user access attempting to stream another users conversation document', async () => {
    await expect(
      useCase.execute({
        tenantId,
        userId: intruderUserId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      }),
    ).rejects.toThrow(TenantOwnershipViolationError);
  });

  it('3. rejects streaming when document has been soft-deleted', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Archived Guide',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_stream_1',
        originalFileName: 'archived.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'c'.repeat(64),
        storageKey: 'tenants/t1/k/archived.pdf',
        uploadedBy: userId,
      },
    });
    mockDoc.softDelete('admin');
    docRepo.findById.mockResolvedValue(mockDoc);

    await expect(
      useCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['PHYSIOTHERAPIST'],
      }),
    ).rejects.toThrow(DocumentArchivedOrDeletedError);
  });

  it('4. rejects streaming when user lacks role clearance for document scope', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Clinical Only Protocol',
      visibilityScope: VisibilityScope.CLINICAL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_stream_1',
        originalFileName: 'clinical.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'd'.repeat(64),
        storageKey: 'tenants/t1/k/clinical.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    await expect(
      useCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['RECEPTIONIST'], // Not clinical staff
      }),
    ).rejects.toThrow(DocumentAccessRestrictedError);
  });

  it('5. rejects streaming when format is unsupported for preview (DOCX)', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Word Document',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_stream_1',
        originalFileName: 'word.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSize: 1024,
        checksum: 'e'.repeat(64),
        storageKey: 'tenants/t1/k/word.docx',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);

    await expect(
      useCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['STAFF'],
      }),
    ).rejects.toThrow(DocumentPreviewUnsupportedFormatError);
  });

  it('6. rejects streaming when file is missing in storage subsystem', async () => {
    const mockDoc = KnowledgeDocument.create({
      id: docId,
      tenantId,
      title: 'Missing File Doc',
      visibilityScope: VisibilityScope.ALL_STAFF,
      uploadedBy: userId,
      initialVersion: {
        id: 'dver_stream_1',
        originalFileName: 'missing.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        checksum: 'f'.repeat(64),
        storageKey: 'tenants/t1/k/missing.pdf',
        uploadedBy: userId,
      },
    });
    docRepo.findById.mockResolvedValue(mockDoc);
    storagePort.exists.mockResolvedValue(false); // Does not exist!

    await expect(
      useCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        userRoles: ['STAFF'],
      }),
    ).rejects.toThrow(DocumentFileNotFoundInStorageError);
  });

  it('7. throws CitationNotFoundError if citation does not exist', async () => {
    citationRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId: 'missing-cite',
        userRoles: ['STAFF'],
      }),
    ).rejects.toThrow(CitationNotFoundError);
  });
});
