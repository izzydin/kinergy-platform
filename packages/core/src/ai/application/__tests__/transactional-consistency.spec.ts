import { Prisma } from '@prisma/client';
import {
  isTransientDatabaseError,
  PrismaAiConversationTransactionRunner,
} from '../../infrastructure/persistence/prisma/prisma-ai-conversation-transaction-runner';
import { AiConversationRedactionService } from '../services/ai-conversation-redaction.service';
import {
  IAiConversationLoggerPort,
  AiConversationLogContext,
} from '../ports/ai-conversation-logger.port';
import { ConversationTransactionalRepositories } from '../ports/ai-conversation-transaction-runner.port';
import {
  TransactionFailureError,
  TransientTransactionFailureError,
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
} from '../errors/ai-conversation-application.error';
import { PrismaAiConversationRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-ai-conversation-audit.repository';

describe('AI-09.3-BE.04.05 — Transactional Consistency & Failure Handling Unit Tests', () => {
  describe('1. Transient Database Error Classification', () => {
    it('classifies Prisma write conflict P2034 as transient', () => {
      const p2034 = new Prisma.PrismaClientKnownRequestError(
        'Transaction failed due to a write conflict or a deadlock.',
        {
          code: 'P2034',
          clientVersion: '5.22.0',
        },
      );
      expect(isTransientDatabaseError(p2034)).toBe(true);
    });

    it('classifies Prisma connection closed P1017 as transient', () => {
      const p1017 = new Prisma.PrismaClientKnownRequestError('Server has closed the connection.', {
        code: 'P1017',
        clientVersion: '5.22.0',
      });
      expect(isTransientDatabaseError(p1017)).toBe(true);
    });

    it('classifies PostgreSQL serialization failure (40001) as transient', () => {
      const err = new Error(
        'ERROR: could not serialize access due to concurrent update (SQLSTATE 40001)',
      );
      expect(isTransientDatabaseError(err)).toBe(true);
    });

    it('classifies PostgreSQL deadlock detected (40P01) as transient', () => {
      const err = new Error('ERROR: deadlock detected (SQLSTATE 40P01)');
      expect(isTransientDatabaseError(err)).toBe(true);
    });

    it('rejects deterministic unique constraint violation P2002 as non-transient', () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
      expect(isTransientDatabaseError(p2002)).toBe(false);
    });

    it('rejects foreign key violation P2003 as non-transient', () => {
      const p2003 = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.22.0',
      });
      expect(isTransientDatabaseError(p2003)).toBe(false);
    });

    it('rejects domain validation errors as non-transient', () => {
      const err = new InvalidTurnInputError('userPrompt', 'Cannot be empty');
      expect(isTransientDatabaseError(err)).toBe(false);
    });
  });

  describe('2. Bounded Retry Policy in PrismaAiConversationTransactionRunner', () => {
    let mockPrisma: { $transaction: jest.Mock };
    let mockConvRepo: PrismaAiConversationRepository;
    let mockTurnRepo: PrismaAiConversationTurnRepository;
    let mockMsgRepo: PrismaAiConversationMessageRepository;
    let mockAuditRepo: PrismaAiConversationAuditRepository;
    let runner: PrismaAiConversationTransactionRunner;

    beforeEach(() => {
      mockPrisma = {
        $transaction: jest.fn(),
      };
      mockConvRepo = {
        withTransaction: jest.fn().mockReturnThis(),
      } as unknown as PrismaAiConversationRepository;
      mockTurnRepo = {
        withTransaction: jest.fn().mockReturnThis(),
      } as unknown as PrismaAiConversationTurnRepository;
      mockMsgRepo = {
        withTransaction: jest.fn().mockReturnThis(),
      } as unknown as PrismaAiConversationMessageRepository;
      mockAuditRepo = {
        withTransaction: jest.fn().mockReturnThis(),
      } as unknown as PrismaAiConversationAuditRepository;

      runner = new PrismaAiConversationTransactionRunner(
        mockPrisma as unknown as ConstructorParameters<
          typeof PrismaAiConversationTransactionRunner
        >[0],
        mockConvRepo,
        mockTurnRepo,
        mockMsgRepo,
        mockAuditRepo,
      );
    });

    it('retries on transient failure and succeeds on subsequent attempt', async () => {
      const transientError = new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: '5.22.0',
      });

      mockPrisma.$transaction
        .mockRejectedValueOnce(transientError)
        .mockImplementationOnce(async (cb) => cb({}));

      const work = jest.fn().mockResolvedValue('success_result');

      const result = await runner.runInTransaction(work, { maxRetries: 2 });

      expect(result).toBe('success_result');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('throws TransientTransactionFailureError when transient retries are exhausted', async () => {
      const transientError = new Error('deadlock detected (SQLSTATE 40P01)');

      mockPrisma.$transaction.mockRejectedValue(transientError);

      const work = jest.fn();

      await expect(runner.runInTransaction(work, { maxRetries: 2 })).rejects.toThrow(
        TransientTransactionFailureError,
      );

      // 1 initial attempt + 2 retries = 3 calls
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it('does not retry deterministic domain errors', async () => {
      const domainError = new DuplicateClientTurnPayloadMismatchError('turn_1', 'hash_a', 'hash_b');

      mockPrisma.$transaction.mockRejectedValue(domainError);

      const work = jest.fn();

      await expect(runner.runInTransaction(work, { maxRetries: 2 })).rejects.toThrow(
        DuplicateClientTurnPayloadMismatchError,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not retry non-transient unique constraint collisions', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });

      mockPrisma.$transaction.mockRejectedValue(p2002);

      const work = jest.fn();

      await expect(runner.runInTransaction(work, { maxRetries: 2 })).rejects.toThrow(
        TransactionFailureError,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('propagates all four repositories to work callback with transaction client', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const dummyTx = { $isDummyTx: true };
        return cb(dummyTx);
      });

      let capturedRepos: ConversationTransactionalRepositories | undefined;

      await runner.runInTransaction(async (repos) => {
        capturedRepos = repos;
        return 'ok';
      });

      expect(capturedRepos).toBeDefined();
      expect(mockConvRepo.withTransaction).toHaveBeenCalled();
      expect(mockTurnRepo.withTransaction).toHaveBeenCalled();
      expect(mockMsgRepo.withTransaction).toHaveBeenCalled();
      expect(mockAuditRepo.withTransaction).toHaveBeenCalled();
    });
  });

  describe('3. Observability & Privacy Redaction', () => {
    it('redacts sensitive keys (prompt, content, token, secret) from log context', () => {
      const rawContext: AiConversationLogContext = {
        operation: 'CreateConversationWithInitialTurn',
        tenantId: 'tenant_safe',
        prompt: 'My private medical lab results',
        userPrompt: 'Secret diagnosis',
        content: 'Assistant generated private details',
        token: 'secret-bearer-token',
        leaseToken: 'lease-uuid',
        safeMetric: 42,
      };

      const sanitized = AiConversationRedactionService.sanitizeContext(rawContext);

      expect(sanitized).toBeDefined();
      expect(sanitized?.['operation']).toBe('CreateConversationWithInitialTurn');
      expect(sanitized?.['tenantId']).toBe('tenant_safe');
      expect(sanitized?.['prompt']).toBe('[REDACTED]');
      expect(sanitized?.['userPrompt']).toBe('[REDACTED]');
      expect(sanitized?.['content']).toBe('[REDACTED]');
      expect(sanitized?.['token']).toBe('[REDACTED]');
      expect(sanitized?.['leaseToken']).toBe('[REDACTED]');
      expect(sanitized?.['safeMetric']).toBe(42);
    });

    it('recursively sanitizes nested metadata objects', () => {
      const nested = {
        facilityId: 'fac_123',
        metadata: {
          apiKey: 'key_xyz',
          password: 'pass',
        },
      };

      const sanitized = AiConversationRedactionService.sanitizeObject(nested);

      expect(sanitized['facilityId']).toBe('fac_123');
      expect((sanitized['metadata'] as Record<string, unknown>)?.['apiKey']).toBe('[REDACTED]');
      expect((sanitized['metadata'] as Record<string, unknown>)?.['password']).toBe('[REDACTED]');
    });

    it('logger port mock receives sanitized data', () => {
      const mockLogger: IAiConversationLoggerPort = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      const context: AiConversationLogContext = {
        operation: 'ReserveTurn',
        tenantId: 'tenant_1',
        userPrompt: 'clinical query',
      };

      mockLogger.info(
        'Turn reservation started',
        AiConversationRedactionService.sanitizeContext(context),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Turn reservation started',
        expect.objectContaining({
          operation: 'ReserveTurn',
          tenantId: 'tenant_1',
          userPrompt: '[REDACTED]',
        }),
      );
    });
  });
});
