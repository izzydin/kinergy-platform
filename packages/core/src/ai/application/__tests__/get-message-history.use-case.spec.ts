import { GetMessageHistoryUseCase } from '../use-cases/get-message-history.use-case';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { AiConversationCitation } from '../../domain/models/ai-conversation-citation.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../domain/value-objects/turn-id.vo';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { MessageHistoryCursor } from '../../domain/value-objects/message-history-cursor.vo';
import {
  ConversationNotFoundError,
  InvalidTurnInputError,
} from '../errors/ai-conversation-application.error';

describe('AI-09.4-CIT.07 — GetMessageHistoryUseCase Historical Reconstruction Unit Tests', () => {
  const tenantId = 'tenant_history_test_123';
  const userId = 'user_history_test_123';
  const conversationId = 'conv_history_test_123';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let citationRepo: jest.Mocked<IAiConversationCitationRepositoryPort>;
  let useCase: GetMessageHistoryUseCase;

  const validConversation = AiConversation.create({
    id: ConversationId.create(conversationId),
    tenantId,
    userId,
    title: ConversationTitle.create('Protocolo de Readaptación Funcional'),
  });

  const userMsg1 = AiConversationMessage.create({
    id: MessageId.create('msg_user_1'),
    turnId: TurnId.create('turn_1'),
    conversationId: ConversationId.create(conversationId),
    tenantId,
    role: ConversationRole.USER,
    sequenceNumber: 1,
    attemptNumber: 1,
    isCanonical: true,
    status: GenerationStatus.SUCCESS,
    content: '¿Cuáles son las pautas para dolor lumbar agudo?',
  });

  const assistantMsg1 = AiConversationMessage.create({
    id: MessageId.create('msg_assistant_1'),
    turnId: TurnId.create('turn_1'),
    conversationId: ConversationId.create(conversationId),
    tenantId,
    role: ConversationRole.ASSISTANT,
    sequenceNumber: 2,
    attemptNumber: 1,
    isCanonical: true,
    status: GenerationStatus.SUCCESS,
    content:
      'Se recomienda mantener la actividad física y evitar reposo absoluto prolongado [1] [2].',
  });

  const userMsg2 = AiConversationMessage.create({
    id: MessageId.create('msg_user_2'),
    turnId: TurnId.create('turn_2'),
    conversationId: ConversationId.create(conversationId),
    tenantId,
    role: ConversationRole.USER,
    sequenceNumber: 3,
    attemptNumber: 1,
    isCanonical: true,
    status: GenerationStatus.SUCCESS,
    content: '¿Qué ejercicios de estiramiento están contraindicados?',
  });

  const assistantMsg2 = AiConversationMessage.create({
    id: MessageId.create('msg_assistant_2'),
    turnId: TurnId.create('turn_2'),
    conversationId: ConversationId.create(conversationId),
    tenantId,
    role: ConversationRole.ASSISTANT,
    sequenceNumber: 4,
    attemptNumber: 1,
    isCanonical: true,
    status: GenerationStatus.SUCCESS,
    content: 'Se debe evitar la flexión forzada con carga en fase aguda de hernia discal [1].',
  });

  const cite1Msg1 = AiConversationCitation.create({
    id: 'cite_101',
    messageId: 'msg_assistant_1',
    turnId: 'turn_1',
    conversationId,
    tenantId,
    documentId: 'doc_spine_guidelines',
    citationPosition: 1,
    documentTitleSnapshot: 'Guía Clínica de Manejo Lumbar',
    excerpt: 'El reposo en cama mayor a 48 horas se asocia con peor pronóstico funcional.',
    pageNumber: 14,
    headingPath: ['Capítulo 2', 'Recomendaciones Iniciales'],
    relevanceScore: 0.95,
    retrievalRank: 1,
    sourceStrategy: 'HYBRID',
  });

  const cite2Msg1 = AiConversationCitation.create({
    id: 'cite_102',
    messageId: 'msg_assistant_1',
    turnId: 'turn_1',
    conversationId,
    tenantId,
    documentId: 'doc_exercise_therapy',
    citationPosition: 2,
    documentTitleSnapshot: 'Terapia con Ejercicio en Patología Vertebral',
    excerpt: 'El movimiento precoz dosificado estimula la circulación discal.',
    pageNumber: 33,
    headingPath: ['Intervenciones Activas'],
    relevanceScore: 0.89,
    retrievalRank: 2,
    sourceStrategy: 'SEMANTIC',
  });

  const cite1Msg2 = AiConversationCitation.create({
    id: 'cite_201',
    messageId: 'msg_assistant_2',
    turnId: 'turn_2',
    conversationId,
    tenantId,
    documentId: 'doc_biomechanics_lumbar',
    citationPosition: 1,
    documentTitleSnapshot: 'Biomecánica Lumbar y Cargas Compresivas',
    excerpt:
      'La flexión de tronco combinada con rotación incrementa la presión intradiscal un 250%.',
    pageNumber: 78,
    headingPath: ['Factores de Riesgo', 'Biomecánica Discal'],
    relevanceScore: 0.92,
    retrievalRank: 1,
    sourceStrategy: 'HYBRID',
  });

  beforeEach(() => {
    convRepo = {
      findById: jest.fn().mockResolvedValue(validConversation),
      save: jest.fn(),
      listByUser: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    messageRepo = {
      listCanonicalHistory: jest.fn().mockResolvedValue({
        messages: [userMsg1, assistantMsg1, userMsg2, assistantMsg2],
        nextCursor: null,
        hasMore: false,
      }),
      findById: jest.fn(),
      findBySequenceNumber: jest.fn(),
      listByTurn: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    citationRepo = {
      listByConversation: jest.fn().mockResolvedValue([cite1Msg1, cite2Msg1, cite1Msg2]),
      listByMessage: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      saveMany: jest.fn(),
      deleteByMessage: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationCitationRepositoryPort>;

    useCase = new GetMessageHistoryUseCase(convRepo, messageRepo, citationRepo);
  });

  it('1. reconstructs persistent citations from persistence for historical assistant messages', async () => {
    const result = await useCase.execute({
      tenantId,
      conversationId,
    });

    expect(convRepo.findById).toHaveBeenCalledWith(tenantId, conversationId);
    expect(messageRepo.listCanonicalHistory).toHaveBeenCalledWith(tenantId, conversationId, {
      cursor: undefined,
      limit: 20,
    });
    expect(citationRepo.listByConversation).toHaveBeenCalledWith(tenantId, conversationId);

    expect(result.messages).toHaveLength(4);

    // User messages do not have citations
    expect(result.messages[0]?.role).toBe(ConversationRole.USER);
    expect(result.messages[0]?.sources).toBeNull();

    // Assistant message 1 has 2 citations reconstructed from database
    const a1 = result.messages[1]!;
    expect(a1.role).toBe(ConversationRole.ASSISTANT);
    expect(a1.sources).toBeDefined();
    expect(a1.sources).toHaveLength(2);

    expect(a1.sources![0]).toEqual(
      expect.objectContaining({
        citationId: 'cite_101',
        documentId: 'doc_spine_guidelines',
        documentTitle: 'Guía Clínica de Manejo Lumbar',
        pageNumber: 14,
        excerpt: 'El reposo en cama mayor a 48 horas se asocia con peor pronóstico funcional.',
        relevanceScore: 0.95,
        retrievalRank: 1,
      }),
    );

    expect(a1.sources![1]).toEqual(
      expect.objectContaining({
        citationId: 'cite_102',
        documentId: 'doc_exercise_therapy',
        documentTitle: 'Terapia con Ejercicio en Patología Vertebral',
        pageNumber: 33,
        excerpt: 'El movimiento precoz dosificado estimula la circulación discal.',
        relevanceScore: 0.89,
        retrievalRank: 2,
      }),
    );
  });

  it('2. supports multiple assistant messages with independent citation associations', async () => {
    const result = await useCase.execute({
      tenantId,
      conversationId,
    });

    const a1 = result.messages[1]!;
    const a2 = result.messages[3]!;

    expect(a1.id).toBe('msg_assistant_1');
    expect(a1.sources).toHaveLength(2);
    expect(a1.sources![0]?.citationId).toBe('cite_101');
    expect(a1.sources![1]?.citationId).toBe('cite_102');

    expect(a2.id).toBe('msg_assistant_2');
    expect(a2.sources).toHaveLength(1);
    expect(a2.sources![0]?.citationId).toBe('cite_201');
    expect(a2.sources![0]?.documentTitle).toBe('Biomecánica Lumbar y Cargas Compresivas');
  });

  it('3. maintains stable deterministic citation ordering by citationPosition ASC', async () => {
    // Reverse the returned order from citationRepo
    citationRepo.listByConversation.mockResolvedValueOnce([cite2Msg1, cite1Msg1]);

    messageRepo.listCanonicalHistory.mockResolvedValueOnce({
      messages: [assistantMsg1],
      nextCursor: null,
      hasMore: false,
    });

    const result = await useCase.execute({ tenantId, conversationId });
    const sources = result.messages[0]!.sources!;

    // Must be sorted by citationPosition: cite1Msg1 (pos 1), then cite2Msg1 (pos 2)
    expect(sources[0]?.citationId).toBe('cite_101');
    expect(sources[1]?.citationId).toBe('cite_102');
  });

  it('4. pagination preserves citation associations across pages', async () => {
    const cursor = MessageHistoryCursor.create(2, 'msg_assistant_1');
    messageRepo.listCanonicalHistory.mockResolvedValueOnce({
      messages: [userMsg2, assistantMsg2],
      nextCursor: cursor,
      hasMore: true,
    });

    const result = await useCase.execute({
      tenantId,
      conversationId,
      cursor: 'encoded_cursor_abc',
      limit: 2,
    });

    expect(messageRepo.listCanonicalHistory).toHaveBeenCalledWith(tenantId, conversationId, {
      cursor: 'encoded_cursor_abc',
      limit: 2,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]?.id).toBe('msg_assistant_2');
    expect(result.messages[1]?.sources).toHaveLength(1);
    expect(result.messages[1]?.sources![0]?.citationId).toBe('cite_201');
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(cursor.encode());
  });

  it('5. handles historical messages without citations cleanly without errors', async () => {
    const ungroundedAssistantMsg = AiConversationMessage.create({
      id: MessageId.create('msg_assistant_simple'),
      turnId: TurnId.create('turn_3'),
      conversationId: ConversationId.create(conversationId),
      tenantId,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 5,
      attemptNumber: 1,
      isCanonical: true,
      status: GenerationStatus.SUCCESS,
      content: 'Buenos días, ¿en qué puedo ayudarte hoy?',
    });

    messageRepo.listCanonicalHistory.mockResolvedValueOnce({
      messages: [ungroundedAssistantMsg],
      nextCursor: null,
      hasMore: false,
    });

    citationRepo.listByConversation.mockResolvedValueOnce([]);

    const result = await useCase.execute({ tenantId, conversationId });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.sources).toBeNull();
    expect(result.messages[0]?.content).toBe('Buenos días, ¿en qué puedo ayudarte hoy?');
  });

  it('6. falls back cleanly to legacy message.sources when citationRepo is empty or unavailable', async () => {
    const legacyAssistantMsg = AiConversationMessage.create({
      id: MessageId.create('msg_legacy_1'),
      turnId: TurnId.create('turn_legacy'),
      conversationId: ConversationId.create(conversationId),
      tenantId,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 2,
      attemptNumber: 1,
      isCanonical: true,
      status: GenerationStatus.SUCCESS,
      content: 'Respuesta con fuentes legacy.',
      sources: [
        {
          documentId: 'doc_legacy',
          documentTitle: 'Documento Legacy',
          chunkId: 'chk_legacy',
          relevanceScore: 0.85,
        },
      ],
    });

    messageRepo.listCanonicalHistory.mockResolvedValueOnce({
      messages: [legacyAssistantMsg],
      nextCursor: null,
      hasMore: false,
    });

    // CitationRepo has no rows for this legacy message
    citationRepo.listByConversation.mockResolvedValueOnce([]);

    const result = await useCase.execute({ tenantId, conversationId });

    expect(result.messages[0]?.sources).toEqual([
      expect.objectContaining({
        documentId: 'doc_legacy',
        documentTitle: 'Documento Legacy',
      }),
    ]);
  });

  it('7. preserves document snapshot and excerpt even if document was deleted or modified', async () => {
    const citeWithDeletedDoc = AiConversationCitation.create({
      id: 'cite_deleted_doc',
      messageId: 'msg_assistant_1',
      turnId: 'turn_1',
      conversationId,
      tenantId,
      documentId: 'doc_archived_999',
      citationPosition: 1,
      documentTitleSnapshot: 'Protocolo Histórico Archivado v1',
      excerpt: 'Extracto archivado de valor clínico auditable.',
      pageNumber: 5,
      relevanceScore: 0.91,
    });

    citationRepo.listByConversation.mockResolvedValueOnce([citeWithDeletedDoc]);
    messageRepo.listCanonicalHistory.mockResolvedValueOnce({
      messages: [assistantMsg1],
      nextCursor: null,
      hasMore: false,
    });

    const result = await useCase.execute({ tenantId, conversationId });

    expect(result.messages[0]?.sources![0]).toEqual(
      expect.objectContaining({
        citationId: 'cite_deleted_doc',
        documentId: 'doc_archived_999',
        documentTitle: 'Protocolo Histórico Archivado v1',
        excerpt: 'Extracto archivado de valor clínico auditable.',
      }),
    );
  });

  it('8. throws ConversationNotFoundError when conversation does not exist', async () => {
    convRepo.findById.mockResolvedValueOnce(null);

    await expect(useCase.execute({ tenantId, conversationId: 'conv_missing' })).rejects.toThrow(
      ConversationNotFoundError,
    );
  });

  it('9. validates required inputs', async () => {
    await expect(useCase.execute({ tenantId: '', conversationId })).rejects.toThrow(
      InvalidTurnInputError,
    );

    await expect(useCase.execute({ tenantId, conversationId: '' })).rejects.toThrow(
      InvalidTurnInputError,
    );
  });
});
