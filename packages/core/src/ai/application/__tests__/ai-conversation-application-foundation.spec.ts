import { PrismaClient } from '@prisma/client';
import {
  AI_CONVERSATION_TRANSACTION_RUNNER,
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationAuditRepositoryPort } from '../../ports/outbound/ai-conversation-audit-repository.port';
import { PrismaAiConversationRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation-audit.repository';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import {
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  TenantOwnershipViolationError,
  DuplicateClientTurnPayloadMismatchError,
  TurnAlreadyInProgressError,
  InvalidConversationLifecycleError,
  InvalidMessageOperationError,
  PersistenceConflictError,
  TransactionFailureError,
  AiConversationApplicationError,
} from '../errors/ai-conversation-application.error';
import { ApplicationResult } from '../common/application-result';
import {
  CreateConversationWithInitialTurnInput,
  CreateConversationWithInitialTurnResult,
  ReserveSubsequentTurnInput,
  ReserveSubsequentTurnResult,
  GetConversationInput,
  ConversationDetailDto,
  ListConversationsInput,
  ListConversationsResult,
  GetMessageHistoryInput,
  MessageHistoryResultDto,
  UpdateConversationTitleInput,
  UpdateConversationTitleResult,
  PersistMessageStateInput,
  PersistMessageStateResult,
} from '../dtos/ai-conversation.dtos';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { PrismaAiConversationTransactionRunner } from '../../infrastructure/persistence/prisma/prisma-ai-conversation-transaction-runner';

describe('AI-09.3-BE.04.01 — Application Layer Foundation Tests', () => {
  const tenantId = 'tenant-app-001';
  const userId = 'user-app-001';
  const conversationId = 'conv-app-001';
  const turnId = 'turn-app-001';
  const messageId = 'msg-app-001';

  describe('Transaction Runner Abstraction & UnitOfWork Port', () => {
    it('should define AI_CONVERSATION_TRANSACTION_RUNNER injection token as a symbol', () => {
      expect(typeof AI_CONVERSATION_TRANSACTION_RUNNER).toBe('symbol');
    });

    it('should execute work callback atomically via transaction runner', async () => {
      const mockConversationRepo = { save: jest.fn() };
      const mockTurnRepo = { save: jest.fn() };
      const mockMessageRepo = { save: jest.fn() };
      const mockAuditRepo = { save: jest.fn() };

      const mockRunner: IAiConversationTransactionRunner = {
        runInTransaction: jest.fn(async (work) => {
          const repos: ConversationTransactionalRepositories = {
            conversationRepo: mockConversationRepo as unknown as IAiConversationRepositoryPort,
            turnRepo: mockTurnRepo as unknown as IAiConversationTurnRepositoryPort,
            messageRepo: mockMessageRepo as unknown as IAiConversationMessageRepositoryPort,
            auditRepo: mockAuditRepo as unknown as IAiConversationAuditRepositoryPort,
          };
          return work(repos);
        }),
      };

      const result = await mockRunner.runInTransaction(async (repos) => {
        await repos.conversationRepo.save({ id: conversationId } as unknown as AiConversation);
        await repos.turnRepo.save({ id: turnId } as unknown as AiConversationTurn);
        return { status: 'committed' };
      });

      expect(result).toEqual({ status: 'committed' });
      expect(mockConversationRepo.save).toHaveBeenCalledTimes(1);
      expect(mockTurnRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should wrap unhandled infrastructure transaction errors in TransactionFailureError', async () => {
      const mockPrisma = {
        $transaction: jest.fn(async () => {
          throw new Error('Database connection reset during commit');
        }),
      };

      const runner = new PrismaAiConversationTransactionRunner(
        mockPrisma as unknown as PrismaClient,
        {} as unknown as PrismaAiConversationRepository,
        {} as unknown as PrismaAiConversationTurnRepository,
        {} as unknown as PrismaAiConversationMessageRepository,
        {} as unknown as PrismaAiConversationAuditRepository,
      );

      await expect(runner.runInTransaction(async () => 'ok')).rejects.toThrow(
        TransactionFailureError,
      );
    });

    it('should propagate AiConversationApplicationError without double-wrapping', async () => {
      const appError = new TurnAlreadyInProgressError(conversationId, turnId);
      const mockPrisma = {
        $transaction: jest.fn(async (callback) => {
          return callback({} as unknown as PrismaClient);
        }),
      };

      const runner = new PrismaAiConversationTransactionRunner(
        mockPrisma as unknown as PrismaClient,
        { withTransaction: () => ({}) } as unknown as PrismaAiConversationRepository,
        { withTransaction: () => ({}) } as unknown as PrismaAiConversationTurnRepository,
        { withTransaction: () => ({}) } as unknown as PrismaAiConversationMessageRepository,
        { withTransaction: () => ({}) } as unknown as PrismaAiConversationAuditRepository,
      );

      await expect(
        runner.runInTransaction(async () => {
          throw appError;
        }),
      ).rejects.toThrow(TurnAlreadyInProgressError);
    });
  });

  describe('Application Error Taxonomy', () => {
    it('should construct ConversationNotFoundError with correct code and details', () => {
      const err = new ConversationNotFoundError(conversationId, tenantId);
      expect(err).toBeInstanceOf(AiConversationApplicationError);
      expect(err.code).toBe('AI_CONVERSATION_NOT_FOUND');
      expect(err.details).toEqual({ conversationId, tenantId });
      expect(err.message).toContain(conversationId);
    });

    it('should construct TurnNotFoundError with optional conversation context', () => {
      const errWithConv = new TurnNotFoundError(turnId, conversationId, tenantId);
      expect(errWithConv.code).toBe('AI_TURN_NOT_FOUND');
      expect(errWithConv.details).toEqual({ turnId, conversationId, tenantId });

      const errWithoutConv = new TurnNotFoundError(turnId);
      expect(errWithoutConv.code).toBe('AI_TURN_NOT_FOUND');
      expect(errWithoutConv.message).toBe(`Turn '${turnId}' not found.`);
    });

    it('should construct MessageNotFoundError with turn context', () => {
      const err = new MessageNotFoundError(messageId, turnId, conversationId);
      expect(err.code).toBe('AI_MESSAGE_NOT_FOUND');
      expect(err.details).toEqual({ messageId, turnId, conversationId });
    });

    it('should construct TenantOwnershipViolationError with entity details', () => {
      const err = new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
      expect(err.code).toBe('AI_TENANT_OWNERSHIP_VIOLATION');
      expect(err.details).toEqual({
        entity: 'AiConversation',
        identifier: conversationId,
        tenantId,
      });
    });

    it('should construct DuplicateClientTurnPayloadMismatchError preserving hash diagnostic context', () => {
      const err = new DuplicateClientTurnPayloadMismatchError('client-t-1', 'hashA', 'hashB');
      expect(err.code).toBe('AI_CLIENT_TURN_PAYLOAD_MISMATCH');
      expect(err.details).toEqual({
        clientTurnId: 'client-t-1',
        existingHash: 'hashA',
        receivedHash: 'hashB',
      });
    });

    it('should construct TurnAlreadyInProgressError preserving active turn ID', () => {
      const err = new TurnAlreadyInProgressError(conversationId, turnId);
      expect(err.code).toBe('AI_TURN_ALREADY_IN_PROGRESS');
      expect(err.details).toEqual({ conversationId, activeTurnId: turnId });
    });

    it('should construct InvalidConversationLifecycleError', () => {
      const err = new InvalidConversationLifecycleError(conversationId, 'Conversation is archived');
      expect(err.code).toBe('AI_INVALID_CONVERSATION_LIFECYCLE');
      expect(err.details?.reason).toBe('Conversation is archived');
    });

    it('should construct InvalidMessageOperationError', () => {
      const err = new InvalidMessageOperationError(
        messageId,
        'Cannot append chunk to terminal message',
      );
      expect(err.code).toBe('AI_INVALID_MESSAGE_OPERATION');
      expect(err.details?.reason).toBe('Cannot append chunk to terminal message');
    });

    it('should construct PersistenceConflictError', () => {
      const err = new PersistenceConflictError('AiConversationTurn', 'turn_index collision');
      expect(err.code).toBe('AI_PERSISTENCE_CONFLICT');
      expect(err.details?.conflictDetails).toBe('turn_index collision');
    });

    it('should construct TransactionFailureError preserving operation name', () => {
      const rootError = new Error('Lock timeout');
      const err = new TransactionFailureError('CommitInitialTurn', rootError);
      expect(err.code).toBe('AI_TRANSACTION_FAILURE');
      expect(err.details?.operation).toBe('CommitInitialTurn');
      expect(err.details?.rootCause).toBe('Lock timeout');
    });
  });

  describe('ApplicationResult Container', () => {
    it('should encapsulate successful outcomes', () => {
      const result = ApplicationResult.ok({ id: conversationId });
      expect(result.isSuccess).toBe(true);
      expect(result.isFailure).toBe(false);
      expect(result.getValue()).toEqual({ id: conversationId });
      expect(() => result.getError()).toThrow();
    });

    it('should encapsulate failure outcomes', () => {
      const error = new ConversationNotFoundError(conversationId, tenantId);
      const result = ApplicationResult.fail(error);
      expect(result.isSuccess).toBe(false);
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe(error);
      expect(() => result.getValue()).toThrow();
    });
  });

  describe('Application Contracts & DTOs Typing', () => {
    it('should validate CreateConversationWithInitialTurn contracts', () => {
      const input: CreateConversationWithInitialTurnInput = {
        tenantId,
        userId,
        clientTurnId: 'client-turn-init-1',
        userPrompt: 'Need assessment for shoulder pain',
        idempotencyPayloadHash: 'hash-abc-123',
        title: 'Shoulder Consultation',
      };
      expect(input.tenantId).toBe(tenantId);

      const result: CreateConversationWithInitialTurnResult = {
        conversationId,
        turnId,
        clientTurnId: 'client-turn-init-1',
        turnIndex: 1,
        userMessageId: 'msg-u1',
        assistantAttemptId: 'msg-a1',
        title: 'Shoulder Consultation',
        turnStatus: TurnStatus.STREAMING,
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      };
      expect(result.turnIndex).toBe(1);
    });

    it('should validate ReserveSubsequentTurn contracts', () => {
      const input: ReserveSubsequentTurnInput = {
        tenantId,
        userId,
        conversationId,
        clientTurnId: 'client-turn-sub-2',
        userPrompt: 'Next prompt',
        idempotencyPayloadHash: 'hash-def-456',
      };
      expect(input.clientTurnId).toBe('client-turn-sub-2');

      const result: ReserveSubsequentTurnResult = {
        conversationId,
        turnId: 'turn-sub-2',
        clientTurnId: 'client-turn-sub-2',
        turnIndex: 2,
        userMessageId: 'msg-u2',
        assistantAttemptId: 'msg-a2',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: new Date().toISOString(),
      };
      expect(result.turnIndex).toBe(2);
    });

    it('should validate GetConversation and ListConversations contracts', () => {
      const getInput: GetConversationInput = { tenantId, conversationId, includeTurns: true };
      expect(getInput.includeTurns).toBe(true);

      const detail: ConversationDetailDto = {
        id: conversationId,
        tenantId,
        userId,
        title: 'Title',
        turnCounter: 2,
        messageCounter: 4,
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isArchived: false,
      };
      expect(detail.turnCounter).toBe(2);

      const listInput: ListConversationsInput = { tenantId, userId, limit: 10 };
      expect(listInput.limit).toBe(10);

      const listResult: ListConversationsResult = {
        items: [
          {
            id: conversationId,
            title: 'Title',
            turnCounter: 2,
            lastActivityAt: 'iso',
            createdAt: 'iso',
            isArchived: false,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };
      expect(listResult.items).toHaveLength(1);
    });

    it('should validate MessageHistory and PersistMessageState contracts', () => {
      const historyInput: GetMessageHistoryInput = { tenantId, conversationId, limit: 20 };
      expect(historyInput.limit).toBe(20);

      const historyResult: MessageHistoryResultDto = {
        messages: [
          {
            id: messageId,
            turnId,
            role: ConversationRole.USER,
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: false,
            status: GenerationStatus.SUCCESS,
            content: 'Hello',
            createdAt: 'iso',
            completedAt: null,
          },
        ],
        nextCursor: null,
        hasMore: false,
      };
      expect(historyResult.messages).toHaveLength(1);

      const updateTitleInput: UpdateConversationTitleInput = {
        tenantId,
        conversationId,
        title: 'New Title',
      };
      const updateTitleResult: UpdateConversationTitleResult = {
        conversationId,
        title: 'New Title',
        updatedAt: 'iso',
      };
      expect(updateTitleResult.title).toBe(updateTitleInput.title);

      const persistInput: PersistMessageStateInput = {
        tenantId,
        conversationId,
        messageId,
        status: GenerationStatus.SUCCESS,
        content: 'Completed output',
        isCanonical: true,
      };
      const persistResult: PersistMessageStateResult = {
        messageId,
        status: GenerationStatus.SUCCESS,
        isCanonical: true,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(persistResult.isCanonical).toBe(persistInput.isCanonical);
      expect(persistResult.status).toBe(persistInput.status);
    });
  });
});
