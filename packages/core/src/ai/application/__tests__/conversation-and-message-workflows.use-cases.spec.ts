import { GetConversationUseCase } from '../use-cases/get-conversation.use-case';
import { ListConversationsUseCase } from '../use-cases/list-conversations.use-case';
import { GetMessageHistoryUseCase } from '../use-cases/get-message-history.use-case';
import { UpdateConversationTitleUseCase } from '../use-cases/update-conversation-title.use-case';
import { ArchiveConversationUseCase } from '../use-cases/archive-conversation.use-case';
import { PersistMessageStateUseCase } from '../use-cases/persist-message-state.use-case';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationId } from '../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../domain/value-objects/turn-id.vo';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import { ClientTurnId } from '../../domain/value-objects/client-turn-id.vo';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { ConversationListCursor } from '../../domain/value-objects/conversation-list-cursor.vo';
import { MessageHistoryCursor } from '../../domain/value-objects/message-history-cursor.vo';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  MessageNotFoundError,
  InvalidConversationLifecycleError,
  InvalidMessageOperationError,
  TurnAlreadyInProgressError,
} from '../errors/ai-conversation-application.error';

describe('AI-09.3-BE.04.04 — Conversation & Message Workflows Unit Tests', () => {
  const tenantId = 'tenant_workflow_unit';
  const userId = 'user_workflow_unit';
  const conversationId = 'conv_workflow_123';
  const turnId = 'turn_workflow_123';
  const messageId = 'msg_workflow_123';

  // Helper entity factories
  const createTestConversation = (archived = false) =>
    AiConversation.create({
      id: ConversationId.create(conversationId),
      tenantId,
      userId,
      title: ConversationTitle.create('Initial Title'),
      turnCounter: 2,
      messageCounter: 4,
      lastActivityAt: new Date('2026-11-23T12:00:00Z'),
      createdAt: new Date('2026-11-23T10:00:00Z'),
      updatedAt: new Date('2026-11-23T12:00:00Z'),
      deletedAt: archived ? new Date('2026-11-23T13:00:00Z') : null,
    });

  const createTestTurn = (status: TurnStatus = TurnStatus.COMPLETED) =>
    AiConversationTurn.create({
      id: TurnId.create(turnId),
      conversationId: ConversationId.create(conversationId),
      tenantId,
      turnIndex: 1,
      clientTurnId: ClientTurnId.create('client_turn_abc'),
      idempotencyKey: 'idemp_key_turn_1',
      idempotencyPayloadHash: 'hash_turn_1',
      status,
      activeAttemptNumber: 1,
      createdAt: new Date('2026-11-23T10:00:00Z'),
      completedAt: status === TurnStatus.COMPLETED ? new Date('2026-11-23T10:01:00Z') : null,
    });

  const createTestMessage = (
    role: ConversationRole = ConversationRole.ASSISTANT,
    status: GenerationStatus = GenerationStatus.PENDING,
    isCanonical = false,
  ) =>
    AiConversationMessage.create({
      id: MessageId.create(messageId),
      turnId: TurnId.create(turnId),
      conversationId: ConversationId.create(conversationId),
      tenantId,
      role,
      sequenceNumber: 2,
      attemptNumber: 1,
      isCanonical,
      status,
      content: 'Sample response text',
      createdAt: new Date('2026-11-23T10:00:05Z'),
    });

  describe('1. GetConversationUseCase', () => {
    let mockConvRepo: IAiConversationRepositoryPort;
    let mockTurnRepo: IAiConversationTurnRepositoryPort;
    let useCase: GetConversationUseCase;

    beforeEach(() => {
      mockConvRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByIdWithDetails: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        listByUser: jest.fn(),
        listForAudit: jest.fn(),
        softDelete: jest.fn(),
      };
      mockTurnRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByClientTurnId: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        findByTurnIndex: jest.fn(),
        findActiveTurn: jest.fn(),
        listByConversation: jest.fn(),
      };
      useCase = new GetConversationUseCase(mockConvRepo, mockTurnRepo);
    });

    it('rejects empty tenantId or conversationId', async () => {
      await expect(useCase.execute({ tenantId: '', conversationId })).rejects.toThrow(
        InvalidTurnInputError,
      );

      await expect(useCase.execute({ tenantId, conversationId: '   ' })).rejects.toThrow(
        InvalidTurnInputError,
      );
    });

    it('throws ConversationNotFoundError when conversation does not exist', async () => {
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(useCase.execute({ tenantId, conversationId })).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('returns conversation details without turns when includeTurns is false', async () => {
      const conv = createTestConversation();
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(conv);

      const result = await useCase.execute({
        tenantId,
        conversationId,
        includeTurns: false,
      });

      expect(result.id).toBe(conversationId);
      expect(result.tenantId).toBe(tenantId);
      expect(result.title).toBe('Initial Title');
      expect(result.turnCounter).toBe(2);
      expect(result.turns).toBeUndefined();
      expect(result.isArchived).toBe(false);
    });

    it('returns conversation details with turns and active turn pointer when includeTurns is true', async () => {
      const conv = createTestConversation();
      const turn1 = createTestTurn(TurnStatus.COMPLETED);
      const activeTurn = AiConversationTurn.create({
        id: TurnId.create('turn_workflow_active'),
        conversationId: ConversationId.create(conversationId),
        tenantId,
        turnIndex: 2,
        clientTurnId: ClientTurnId.create('client_turn_2'),
        idempotencyKey: 'idemp_key_turn_2',
        idempotencyPayloadHash: 'hash_turn_2',
        status: TurnStatus.STREAMING,
      });

      (mockConvRepo.findByIdWithDetails as jest.Mock).mockResolvedValue({
        conversation: conv,
        turns: [turn1, activeTurn],
        activeTurn,
      });

      const result = await useCase.execute({
        tenantId,
        conversationId,
        includeTurns: true,
      });

      expect(result.id).toBe(conversationId);
      expect(result.turns).toBeDefined();
      expect(result.turns).toHaveLength(2);
      expect(result.turns?.[0]?.status).toBe(TurnStatus.COMPLETED);
      expect(result.turns?.[1]?.status).toBe(TurnStatus.STREAMING);
      expect(result.activeTurnId).toBe('turn_workflow_active');
    });
  });

  describe('2. ListConversationsUseCase', () => {
    let mockConvRepo: IAiConversationRepositoryPort;
    let useCase: ListConversationsUseCase;

    beforeEach(() => {
      mockConvRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        listByUser: jest.fn(),
        listByUserPaginated: jest.fn(),
        listForAudit: jest.fn(),
        softDelete: jest.fn(),
      };
      useCase = new ListConversationsUseCase(mockConvRepo);
    });

    it('rejects missing tenantId or userId', async () => {
      await expect(useCase.execute({ tenantId: '', userId })).rejects.toThrow(
        InvalidTurnInputError,
      );

      await expect(useCase.execute({ tenantId, userId: '' })).rejects.toThrow(
        InvalidTurnInputError,
      );
    });

    it('returns paginated conversation list with nextCursor and hasMore', async () => {
      const conv1 = createTestConversation();
      const cursor = ConversationListCursor.create(new Date('2026-11-23T11:00:00Z'), 'conv_next');

      (mockConvRepo.listByUserPaginated as jest.Mock).mockResolvedValue({
        items: [conv1],
        nextCursor: cursor,
        hasMore: true,
      });

      const result = await useCase.execute({
        tenantId,
        userId,
        limit: 10,
        includeArchived: false,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe(conversationId);
      expect(result.items[0]?.title).toBe('Initial Title');
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(cursor.encode());
    });
  });

  describe('3. GetMessageHistoryUseCase', () => {
    let mockConvRepo: IAiConversationRepositoryPort;
    let mockMessageRepo: IAiConversationMessageRepositoryPort;
    let useCase: GetMessageHistoryUseCase;

    beforeEach(() => {
      mockConvRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        listByUser: jest.fn(),
        listForAudit: jest.fn(),
        softDelete: jest.fn(),
      };
      mockMessageRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findBySequenceNumber: jest.fn(),
        listByTurn: jest.fn(),
        listCanonicalHistory: jest.fn(),
      };
      useCase = new GetMessageHistoryUseCase(mockConvRepo, mockMessageRepo);
    });

    it('rejects missing tenantId or conversationId', async () => {
      await expect(useCase.execute({ tenantId: '', conversationId })).rejects.toThrow(
        InvalidTurnInputError,
      );
    });

    it('throws ConversationNotFoundError when conversation does not exist', async () => {
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(useCase.execute({ tenantId, conversationId })).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('returns canonical messages ordered by sequence', async () => {
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(createTestConversation());

      const userMsg = AiConversationMessage.create({
        id: MessageId.create('msg_user_1'),
        turnId: TurnId.create(turnId),
        conversationId: ConversationId.create(conversationId),
        tenantId,
        role: ConversationRole.USER,
        sequenceNumber: 1,
        content: 'Hello AI',
      });

      const assistantMsg = AiConversationMessage.create({
        id: MessageId.create('msg_assistant_1'),
        turnId: TurnId.create(turnId),
        conversationId: ConversationId.create(conversationId),
        tenantId,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Hello human',
      });

      const cursor = MessageHistoryCursor.create(2, 'msg_assistant_1');

      (mockMessageRepo.listCanonicalHistory as jest.Mock).mockResolvedValue({
        messages: [userMsg, assistantMsg],
        nextCursor: cursor,
        hasMore: false,
      });

      const result = await useCase.execute({
        tenantId,
        conversationId,
        limit: 20,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.role).toBe(ConversationRole.USER);
      expect(result.messages[0]?.sequenceNumber).toBe(1);
      expect(result.messages[1]?.role).toBe(ConversationRole.ASSISTANT);
      expect(result.messages[1]?.isCanonical).toBe(true);
      expect(result.nextCursor).toBe(cursor.encode());
      expect(result.hasMore).toBe(false);
    });

    it('preserves complete source citation provenance including excerpt, rank, and versioning on assistant messages', async () => {
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(createTestConversation());

      const rawSources = [
        {
          citationId: 'cit_provenance_1',
          documentId: 'doc_kinesio_1',
          documentTitle: 'Protocolo de Vendaje Funcional',
          chunkId: 'chunk_vf_01',
          documentVersionId: 'dver_v1',
          documentVersionNumber: 1,
          excerpt: 'Las contraindicaciones absolutas incluyen trombosis venosa profunda.',
          pageNumber: 14,
          headingPath: ['Capítulo 2', 'Contraindicaciones'],
          relevanceScore: 0.952,
          retrievalRank: 1,
          sourceStrategy: 'HYBRID',
        },
      ];

      const assistantMsg = AiConversationMessage.create({
        id: MessageId.create('msg_assistant_cited'),
        turnId: TurnId.create(turnId),
        conversationId: ConversationId.create(conversationId),
        tenantId,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'El vendaje funcional presenta contraindicaciones específicas.',
        sources: rawSources,
      });

      (mockMessageRepo.listCanonicalHistory as jest.Mock).mockResolvedValue({
        messages: [assistantMsg],
        nextCursor: null,
        hasMore: false,
      });

      const result = await useCase.execute({
        tenantId,
        conversationId,
        limit: 10,
      });

      expect(result.messages).toHaveLength(1);
      const msg = result.messages[0];
      expect(msg?.sources).toBeDefined();
      expect(msg?.sources).toHaveLength(1);
      expect(msg?.sources?.[0]).toEqual({
        citationId: 'cit_provenance_1',
        documentId: 'doc_kinesio_1',
        documentTitle: 'Protocolo de Vendaje Funcional',
        chunkId: 'chunk_vf_01',
        documentVersionId: 'dver_v1',
        documentVersionNumber: 1,
        excerpt: 'Las contraindicaciones absolutas incluyen trombosis venosa profunda.',
        pageNumber: 14,
        headingPath: ['Capítulo 2', 'Contraindicaciones'],
        relevanceScore: 0.952,
        retrievalRank: 1,
        sourceStrategy: 'HYBRID',
      });
    });
  });

  describe('4. UpdateConversationTitleUseCase', () => {
    let mockConvRepo: IAiConversationRepositoryPort;
    let useCase: UpdateConversationTitleUseCase;

    beforeEach(() => {
      mockConvRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        updateMetadata: jest.fn(),
        listByUser: jest.fn(),
        listForAudit: jest.fn(),
        softDelete: jest.fn(),
      };
      useCase = new UpdateConversationTitleUseCase(mockConvRepo);
    });

    it('rejects empty title or invalid length', async () => {
      await expect(useCase.execute({ tenantId, conversationId, title: '   ' })).rejects.toThrow(
        InvalidTurnInputError,
      );

      const tooLongTitle = 'a'.repeat(256);
      await expect(
        useCase.execute({ tenantId, conversationId, title: tooLongTitle }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('throws ConversationNotFoundError when conversation does not exist', async () => {
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        useCase.execute({ tenantId, conversationId, title: 'Valid Title' }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('throws InvalidConversationLifecycleError when conversation is archived', async () => {
      const archivedConv = createTestConversation(true);
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(archivedConv);

      await expect(
        useCase.execute({ tenantId, conversationId, title: 'Valid Title' }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });

    it('updates conversation title successfully', async () => {
      const conv = createTestConversation(false);
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(conv);

      const updatedConv = AiConversation.create({
        id: conv.id,
        tenantId: conv.tenantId,
        userId: conv.userId,
        title: ConversationTitle.create('Updated New Title'),
        turnCounter: conv.turnCounter,
        messageCounter: conv.messageCounter,
        updatedAt: new Date('2026-11-23T14:00:00Z'),
      });
      (mockConvRepo.updateMetadata as jest.Mock).mockResolvedValue(updatedConv);

      const result = await useCase.execute({
        tenantId,
        conversationId,
        title: 'Updated New Title',
      });

      expect(result.conversationId).toBe(conversationId);
      expect(result.title).toBe('Updated New Title');
      expect(result.updatedAt).toBe('2026-11-23T14:00:00.000Z');
    });
  });

  describe('5. ArchiveConversationUseCase', () => {
    let mockConvRepo: IAiConversationRepositoryPort;
    let mockTurnRepo: IAiConversationTurnRepositoryPort;
    let useCase: ArchiveConversationUseCase;

    beforeEach(() => {
      mockConvRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        updateMetadata: jest.fn(),
        listByUser: jest.fn(),
        listForAudit: jest.fn(),
        softDelete: jest.fn(),
      };
      mockTurnRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findByClientTurnId: jest.fn(),
        findByIdempotencyKey: jest.fn(),
        findByTurnIndex: jest.fn(),
        findActiveTurn: jest.fn(),
        listByConversation: jest.fn(),
      };
      useCase = new ArchiveConversationUseCase(mockConvRepo, mockTurnRepo);
    });

    it('throws ConversationNotFoundError when conversation does not exist', async () => {
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(useCase.execute({ tenantId, conversationId })).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('throws InvalidConversationLifecycleError when conversation is already archived', async () => {
      const archivedConv = createTestConversation(true);
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(archivedConv);

      await expect(useCase.execute({ tenantId, conversationId })).rejects.toThrow(
        InvalidConversationLifecycleError,
      );
    });

    it('throws TurnAlreadyInProgressError when active generation is running', async () => {
      const activeConv = createTestConversation(false);
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(activeConv);

      const activeTurn = createTestTurn(TurnStatus.PENDING);
      (mockTurnRepo.findActiveTurn as jest.Mock).mockResolvedValue(activeTurn);

      await expect(useCase.execute({ tenantId, conversationId })).rejects.toThrow(
        TurnAlreadyInProgressError,
      );
    });

    it('archives conversation successfully when idle', async () => {
      const activeConv = createTestConversation(false);
      (mockConvRepo.findById as jest.Mock).mockResolvedValue(activeConv);
      (mockTurnRepo.findActiveTurn as jest.Mock).mockResolvedValue(null);
      (mockConvRepo.softDelete as jest.Mock).mockResolvedValue(undefined);

      const result = await useCase.execute({ tenantId, conversationId });

      expect(result.conversationId).toBe(conversationId);
      expect(result.isArchived).toBe(true);
      expect(result.archivedAt).toBeDefined();
    });
  });

  describe('6. PersistMessageStateUseCase', () => {
    let mockMessageRepo: IAiConversationMessageRepositoryPort;
    let useCase: PersistMessageStateUseCase;

    beforeEach(() => {
      mockMessageRepo = {
        save: jest.fn(),
        findById: jest.fn(),
        findBySequenceNumber: jest.fn(),
        listByTurn: jest.fn(),
        listCanonicalHistory: jest.fn(),
        updateStatus: jest.fn(),
      };
      useCase = new PersistMessageStateUseCase(mockMessageRepo);
    });

    it('throws MessageNotFoundError when message does not exist', async () => {
      (mockMessageRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId,
          conversationId,
          messageId,
          status: GenerationStatus.SUCCESS,
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it('prohibits mutating USER role messages out of SUCCESS', async () => {
      const userMsg = createTestMessage(ConversationRole.USER, GenerationStatus.SUCCESS, false);
      (mockMessageRepo.findById as jest.Mock).mockResolvedValue(userMsg);

      await expect(
        useCase.execute({
          tenantId,
          conversationId,
          messageId,
          status: GenerationStatus.FAILED,
        }),
      ).rejects.toThrow(InvalidMessageOperationError);
    });

    it('prohibits designating non-SUCCESS messages as canonical', async () => {
      const assistantMsg = createTestMessage(ConversationRole.ASSISTANT, GenerationStatus.PENDING);
      (mockMessageRepo.findById as jest.Mock).mockResolvedValue(assistantMsg);

      await expect(
        useCase.execute({
          tenantId,
          conversationId,
          messageId,
          status: GenerationStatus.STREAMING,
          isCanonical: true,
        }),
      ).rejects.toThrow(InvalidMessageOperationError);
    });

    it('successfully updates assistant message status and marks canonical', async () => {
      const assistantMsg = createTestMessage(
        ConversationRole.ASSISTANT,
        GenerationStatus.STREAMING,
      );
      (mockMessageRepo.findById as jest.Mock).mockResolvedValue(assistantMsg);

      const completedMsg = AiConversationMessage.create({
        id: assistantMsg.id,
        turnId: assistantMsg.turnId,
        conversationId: assistantMsg.conversationId,
        tenantId: assistantMsg.tenantId,
        role: assistantMsg.role,
        sequenceNumber: assistantMsg.sequenceNumber,
        attemptNumber: assistantMsg.attemptNumber,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Final synthesized clinical response',
        completedAt: new Date('2026-11-23T12:05:00Z'),
        updatedAt: new Date('2026-11-23T12:05:00Z'),
      });

      (mockMessageRepo.updateStatus as jest.Mock).mockResolvedValue(completedMsg);

      const result = await useCase.execute({
        tenantId,
        conversationId,
        messageId,
        status: GenerationStatus.SUCCESS,
        content: 'Final synthesized clinical response',
        isCanonical: true,
        completedAt: new Date('2026-11-23T12:05:00Z'),
      });

      expect(result.messageId).toBe(messageId);
      expect(result.status).toBe(GenerationStatus.SUCCESS);
      expect(result.isCanonical).toBe(true);
      expect(result.completedAt).toBe('2026-11-23T12:05:00.000Z');
    });
  });
});
