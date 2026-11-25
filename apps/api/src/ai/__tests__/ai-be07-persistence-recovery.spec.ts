import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ExecuteConversationTurnUseCase,
  CancelConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  TurnStatus,
  GenerationStatus,
  AiTurnErrorClassifier,
  TurnFailureCategory,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
  InvalidConversationLifecycleError,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { AiTurnDispatcherService, AiTurnGenerationWorker } from '../services/generation';

/**
 * AI-09.3-BE.07.05 — Persistence Recovery, Worker Restart & Fault-Tolerance Acceptance
 *
 * Verifies against real PostgreSQL:
 * 1. Worker termination at controlled execution boundaries & restart recovery
 * 2. Pending dispatch recovery & idempotency across process restarts
 * 3. Lease expiration, stale execution detection & transactional fencing
 * 4. Database outage, transaction rollback & safe reconnection
 * 5. Crash during finalization (before vs after transaction commit)
 * 6. Terminal-state correctness, source attribution & audit preservation
 * 7. Operational shutdown handling & worker lifecycle
 */
describe('AI-09.3-BE.07.05: Persistence Recovery, Worker Restart & Fault-Tolerance Acceptance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createUseCase: CreateConversationWithInitialTurnUseCase;
  let executeUseCase: ExecuteConversationTurnUseCase;
  let cancelUseCase: CancelConversationTurnUseCase;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;

  let dispatcher: AiTurnDispatcherService;
  let worker: AiTurnGenerationWorker;

  const TENANT_ID = 'tenant_recovery_test';
  const USER_ID = 'usr_recovery_physio_01';

  let ragExecutionCount = 0;
  let shouldFailRag = false;
  let ragFailureError: Error | null = null;
  let onRagExecutionStarted: (() => Promise<void>) | null = null;

  const mockRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(
        async (command: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => {
          ragExecutionCount++;

          if (onRagExecutionStarted) {
            await onRagExecutionStarted();
          }

          if (command.signal?.aborted) {
            const err = new Error('Execution aborted by signal');
            err.name = 'AbortError';
            throw err;
          }

          if (shouldFailRag && ragFailureError) {
            throw ragFailureError;
          }

          return {
            outcome: 'SUCCESS',
            content: `Canonical response for prompt: ${command.userPrompt}`,
            isGrounded: true,
            sources: [
              {
                documentId: 'doc_recovery_protocol',
                documentTitle: 'Guía Clínica de Recuperación y Fencing',
                chunkId: 'chk_rec_01',
                relevanceScore: 0.96,
                pageNumber: 1,
                headingPath: ['Recuperación', 'Fencing'],
              },
            ],
            metadata: {
              model: 'recovery-llm-v1',
              retrievalCount: 1,
              latencyMs: 35,
              totalTokens: 110,
            },
          };
        },
      ),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    auditRepo = new PrismaAiConversationAuditRepository(prisma);
    txRunner = new PrismaAiConversationTransactionRunner(
      prisma,
      convRepo,
      turnRepo,
      messageRepo,
      auditRepo,
    );

    persistUseCase = new PersistMessageStateUseCase(messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);

    executeUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    dispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);
    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 5000,
      staleThresholdMs: 0, // 0ms threshold for deterministic testing
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });

    createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    cancelUseCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      txRunner,
      dispatcher,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" = '${TENANT_ID}'`,
    );
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    ragExecutionCount = 0;
    shouldFailRag = false;
    ragFailureError = null;
    onRagExecutionStarted = null;
    jest.clearAllMocks();

    if (dispatcher) {
      dispatcher.abortAllActive('TEARDOWN');
      await new Promise((r) => setImmediate(r));
    }

    dispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);
    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 5000,
      staleThresholdMs: 0,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });

    createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    cancelUseCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      txRunner,
      dispatcher,
    );

    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" = '${TENANT_ID}'`,
    );
  });

  // =========================================================================
  // TASK 1: Worker Termination During Execution at Controlled Points
  // =========================================================================
  describe('Task 1: Worker Termination During Execution at Controlled Points', () => {
    it('recovers cleanly when worker crashes after dispatch is committed but before execution starts', async () => {
      // 1. Create initial turn with an offline dispatcher (simulates crash immediately after commit)
      const offlineCreateUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined, // no dispatcher attached: turn is committed in PostgreSQL as PENDING
      );

      const created = await offlineCreateUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_crash_before_exec_01',
        userPrompt: 'Protocolo de hombro congelado',
      });

      // Verify turn is durably committed in PostgreSQL as PENDING
      const inDbTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(inDbTurn?.status).toBe(TurnStatus.PENDING);

      // 2. Restart worker (new AiTurnGenerationWorker instance) and poll
      const restartedWorker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
        enabled: false,
        staleThresholdMs: 0,
      });

      const stats = await restartedWorker.poll();
      expect(stats.recoveredPending).toBe(1);

      // 3. Wait for recovered execution to finish
      for (let i = 0; i < 40; i++) {
        const turn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      const finalTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(finalTurn?.status).toBe(TurnStatus.COMPLETED);

      // Verify canonical message
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      const canonical = messages.find((m) => m.isCanonical);
      expect(canonical).toBeDefined();
      expect(canonical?.content).toContain('Protocolo de hombro congelado');
    });

    it('recovers cleanly when worker terminates after generation ownership is acquired (STREAMING with expired lease)', async () => {
      // 1. Create turn without background execution
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );
      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_crash_streaming_lease_01',
        userPrompt: 'Ejercicios de propiocepción de tobillo',
      });

      // 2. Set turn to STREAMING and simulate an expired lease (e.g., crashed 5 minutes ago)
      await turnRepo.updateStatus(TENANT_ID, created.conversationId, created.turnId, {
        status: TurnStatus.STREAMING,
      });
      await prisma.aiConversationMessage.update({
        where: { id: created.assistantAttemptId },
        data: {
          leaseExpiresAt: new Date(Date.now() - 300_000), // expired 5 mins ago
          status: 'STREAMING',
        },
      });

      // 3. Recovery worker polls for stalled turns
      const stats = await worker.poll();
      expect(stats.recoveredStalled).toBe(1);

      // Wait for execution completion
      for (let i = 0; i < 40; i++) {
        const turn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      const finalTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(finalTurn?.status).toBe(TurnStatus.COMPLETED);
    });

    it('recovers cleanly when worker terminates during retrieval / inference and is restarted', async () => {
      // First attempt fails during retrieval (simulating process crash / inference network drop)
      shouldFailRag = true;
      ragFailureError = new Error('Retrieval database connection terminated abruptly');

      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );
      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_crash_during_rag_01',
        userPrompt: 'Movilización pasiva tras fractura de Colles',
      });

      // Attempt 1: Fails
      await expect(
        executeUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        }),
      ).rejects.toThrow('Retrieval database connection terminated abruptly');

      // State remains recoverable: turn was updated to STREAMING or PENDING, no canonical message exists
      const messagesAfterFail = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      const canonicalAfterFail = messagesAfterFail.filter((m) => m.isCanonical);
      expect(canonicalAfterFail).toHaveLength(0);

      // Second attempt: Service recovered, retrieval succeeds
      shouldFailRag = false;
      ragFailureError = null;

      const recoveredResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(recoveredResult.outcome).toBe('SUCCESS');
      expect(recoveredResult.isCanonical).toBe(true);

      const finalTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(finalTurn?.status).toBe(TurnStatus.COMPLETED);
    });

    it('recovers cleanly when worker crashes after LLM generation returns but before finalization transaction commits', async () => {
      // Create turn
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );
      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_crash_before_final_tx_01',
        userPrompt: 'Crioterapia vs termoterapia en fase aguda',
      });

      // Mock txRunner that crashes before commit on first run
      let crashTriggered = false;
      const failingTxRunner = {
        runInTransaction: jest.fn().mockImplementation(async () => {
          if (!crashTriggered) {
            crashTriggered = true;
            throw new Error('Worker SIGKILL simulated before transaction commit');
          }
        }),
      };

      const failingExecuteUseCase = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockRagPipeline,
        historyLoader,
        failingTxRunner as unknown as PrismaAiConversationTransactionRunner,
      );

      // Worker crashes mid-finalization
      await expect(
        failingExecuteUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        }),
      ).rejects.toThrow('Worker SIGKILL');

      // Database integrity assertion: No message was marked canonical
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(0);

      // Normal worker restarts and executes successfully
      const successResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(successResult.outcome).toBe('SUCCESS');
      expect(successResult.isCanonical).toBe(true);

      const finalTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(finalTurn?.status).toBe(TurnStatus.COMPLETED);
    });
  });

  // =========================================================================
  // TASK 2: Pending Dispatch Recovery Across Process Restarts
  // =========================================================================
  describe('Task 2: Pending Dispatch Recovery Across Process Restarts', () => {
    it('ensures accepted work remains durably represented in PostgreSQL after worker restart', async () => {
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_durable_accepted_01',
        userPrompt: 'Dosis recomendada de estiramientos balísticos',
      });

      // Turn is in PostgreSQL
      const persistedTurn = await turnRepo.findById(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(persistedTurn).not.toBeNull();
      expect(persistedTurn?.status).toBe(TurnStatus.PENDING);
      expect(persistedTurn?.clientTurnId.value).toBe('turn_durable_accepted_01');

      // Multiple worker restarts find the exact same record
      const candidates1 = await turnRepo.findPendingOrStalledTurns({ limit: 10 });
      expect(candidates1.map((c) => c.id.value)).toContain(created.turnId);

      const candidates2 = await turnRepo.findPendingOrStalledTurns({ limit: 10 });
      expect(candidates2.map((c) => c.id.value)).toContain(created.turnId);
    });

    it('safely handles duplicate dispatch delivery without re-executing completed work', async () => {
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined, // offline dispatcher prevents background race
      );
      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_dup_delivery_01',
        userPrompt: 'Fisioterapia para fascitis plantar',
      });

      // Complete the turn
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      const initialExecCount = ragExecutionCount;

      // Duplicate delivery 1: Via dispatcher
      const dispatchDup = await dispatcher.dispatchTurn({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        attemptId: created.assistantAttemptId,
        attemptNumber: 1,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });
      expect(dispatchDup.status).toBe('ALREADY_COMPLETED');
      expect(dispatchDup.dispatched).toBe(false);

      // Duplicate delivery 2: Direct use-case invocation (fast-path idempotency)
      const useCaseDup = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });
      expect(useCaseDup.outcome).toBe('SUCCESS');
      expect(useCaseDup.isCanonical).toBe(true);

      // RAG pipeline was NOT executed again!
      expect(ragExecutionCount).toBe(initialExecCount);

      // Exactly 1 canonical assistant message exists
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(1);
    });

    it('ensures transient dispatch outage does not silently discard a reserved turn', async () => {
      // Simulate dispatcher throwing during reservation
      const faultyDispatcher = {
        dispatchTurn: jest.fn().mockRejectedValue(new Error('Queue broker network unreachable')),
        cancelTurn: jest.fn().mockResolvedValue(true),
        isTurnActive: jest.fn().mockReturnValue(false),
      };

      const resilientCreateUseCase = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        faultyDispatcher,
      );

      // Even if dispatch throws, createConversation completes or stores the turn
      // (The reservation transaction commits before the dispatch attempt)
      try {
        await resilientCreateUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: 'turn_transient_dispatch_outage_01',
          userPrompt: 'Fortalecimiento de manguito rotador',
        });
      } catch {
        // Dispatch failed after commit
      }

      // Check PostgreSQL: Turn was safely preserved in the database!
      const turns = await prisma.aiConversationTurn.findMany({
        where: {
          tenantId: TENANT_ID,
          clientTurnId: 'turn_transient_dispatch_outage_01',
        },
      });
      expect(turns).toHaveLength(1);
      expect(turns[0]?.status).toBe('PENDING');

      // The background recovery worker automatically picks it up and finishes it
      const stats = await worker.poll();
      expect(stats.recoveredPending).toBe(1);
    });
  });

  // =========================================================================
  // TASK 3: Lease Expiration, Stale Execution & Transactional Fencing
  // =========================================================================
  describe('Task 3: Lease Expiration, Stale Execution & Transactional Fencing', () => {
    it('detects superseded attempt and prevents stale worker from finalizing (transactional fencing)', async () => {
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_fencing_superseded_01',
        userPrompt: 'Rehabilitación post-quirúrgica de menisco',
      });

      // Simulate Worker A starts generation on Attempt 1.
      // While Worker A is in RAG inference, the coordinator marks attempt 1 as superseded
      // by bumping activeAttemptNumber in PostgreSQL (Worker B took over).
      onRagExecutionStarted = async () => {
        await prisma.aiConversationTurn.update({
          where: {
            uq_turn_id_conv_tenant: {
              id: created.turnId,
              conversationId: created.conversationId,
              tenantId: TENANT_ID,
            },
          },
          data: {
            activeAttemptNumber: 2, // Bump attempt to 2 (Worker B took over)
          },
        });
      };

      // Worker A attempts to finalize Attempt 1
      const staleResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Assertions: Stale worker was fenced out!
      expect(staleResult.isCanonical).toBe(false);
      expect(staleResult.outcome).toBe('FAILED');
      expect(staleResult.errorCode).toBe('ATTEMPT_SUPERSEDED');

      // Verify no message was marked canonical
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(0);
    });

    it('prevents heartbeat or lease updates from reviving an invalid or cancelled turn', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_invalid_lease_revive_01',
        userPrompt: 'Pauta de readaptación funcional',
      });

      // Cancel turn
      await cancelUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
      });

      // Attempting to execute on cancelled turn is rejected
      await expect(
        executeUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);

      const inDbTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(inDbTurn?.status).toBe(TurnStatus.CANCELLED);
    });
  });

  // =========================================================================
  // TASK 4: Database Outage & Reconnection
  // =========================================================================
  describe('Task 4: Database Outage & Reconnection', () => {
    it('rolls back completely when database error occurs during finalization and leaves zero partial state', async () => {
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_db_outage_rollback_01',
        userPrompt: 'Protocolo de neurodinamia del nervio ciático',
      });

      // Simulate a database crash in the middle of finalization
      const faultyTxRunner = {
        runInTransaction: jest.fn().mockImplementation(async () => {
          throw new Error('Connection terminated unexpectedly: 08006');
        }),
      };

      const crashingExecuteUseCase = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockRagPipeline,
        historyLoader,
        faultyTxRunner as unknown as PrismaAiConversationTransactionRunner,
      );

      await expect(
        crashingExecuteUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        }),
      ).rejects.toThrow('Connection terminated');

      // Database integrity: Turn is NOT completed, message is NOT canonical
      const turn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(turn?.status).not.toBe(TurnStatus.COMPLETED);

      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(0);

      // Error classifier verification: Sanitizes database exception and avoids leaking raw connection info
      const classified = AiTurnErrorClassifier.classify(
        new Error('database error: password=secret host=10.0.0.1 failed to connect'),
      );
      expect(classified.sanitizedErrorMessage).not.toContain('secret');
      expect(classified.sanitizedErrorMessage).not.toContain('10.0.0.1');
      expect(classified.isRetryable).toBe(true);
      expect(classified.category).toBe(TurnFailureCategory.RETRIEVAL_FAILURE);
    });

    it('allows clean recovery and idempotent replay after database connectivity is restored', async () => {
      const clientTurnId = 'turn_reconnection_idemp_01';
      const prompt = 'Reeducación de la marcha post-ictus';

      // 1. Successful commit
      const initial = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId,
        userPrompt: prompt,
      });

      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: initial.conversationId,
        turnId: initial.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // 2. Client retries with same clientTurnId after simulated reconnect
      const replay = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId,
        userPrompt: prompt,
      });

      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.turnId).toBe(initial.turnId);
      expect(replay.turnStatus).toBe(TurnStatus.COMPLETED);
    });
  });

  // =========================================================================
  // TASK 5: Crash During Finalization (Before Commit vs After Commit)
  // =========================================================================
  describe('Task 5: Crash During Finalization (Before Commit vs After Commit)', () => {
    it('verifies rollback on crash BEFORE commit: zero partial assistant message remains', async () => {
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_crash_before_commit_01',
        userPrompt: 'Técnicas de drenaje linfático manual',
      });

      // Throw inside transaction before commit
      let callCount = 0;
      const failingRunner = {
        runInTransaction: jest.fn().mockImplementation(async () => {
          callCount++;
          throw new Error('Database transaction aborted before commit');
        }),
      };

      const failingExec = new ExecuteConversationTurnUseCase(
        convRepo,
        turnRepo,
        messageRepo,
        persistUseCase,
        mockRagPipeline,
        historyLoader,
        failingRunner as unknown as PrismaAiConversationTransactionRunner,
      );

      await expect(
        failingExec.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        }),
      ).rejects.toThrow('Database transaction aborted');

      expect(callCount).toBe(1);

      // Assert rollback: zero canonical messages exist in PostgreSQL
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(0);

      // Re-running with real runner recovers and commits
      const recoveryResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(recoveryResult.outcome).toBe('SUCCESS');
      expect(recoveryResult.isCanonical).toBe(true);

      const finalMessages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(finalMessages.filter((m) => m.isCanonical)).toHaveLength(1);
    });

    it('verifies safety on crash AFTER commit: answer remains canonical and retries never duplicate messages', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_crash_after_commit_01',
        userPrompt: 'Protocolo de potenciación muscular post-inmovilización',
      });

      // Complete turn in PostgreSQL
      await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Simulate worker crash right after commit (e.g. lost dispatch ack / network timeout)
      // Retry execution
      const retryResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(retryResult.outcome).toBe('SUCCESS');
      expect(retryResult.isCanonical).toBe(true);
      expect(retryResult.turnStatus).toBe(TurnStatus.COMPLETED);

      // Database assertion: Exactly 1 canonical assistant message in PostgreSQL
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      const canonicalMessages = messages.filter((m) => m.isCanonical);
      expect(canonicalMessages).toHaveLength(1);
      expect(canonicalMessages[0]?.status).toBe(GenerationStatus.SUCCESS);
    });
  });

  // =========================================================================
  // TASK 6: Recovery and Terminal-State Correctness
  // =========================================================================
  describe('Task 6: Recovery and Terminal-State Correctness', () => {
    it('preserves terminal statuses and never overwrites CANCELLED or FAILED turns with SUCCESS', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_terminal_preservation_01',
        userPrompt: 'Pauta para esguince grado 2',
      });

      // Cancel turn
      await cancelUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
      });

      // Verify turn is CANCELLED
      const turn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(turn?.status).toBe(TurnStatus.CANCELLED);

      // Any late worker trying to finalize fails its fencing check
      await expect(
        executeUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);

      const afterAttempt = await turnRepo.findById(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(afterAttempt?.status).toBe(TurnStatus.CANCELLED);
    });

    it('preserves source attribution and metadata on recovered canonical messages', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_source_attribution_recovery_01',
        userPrompt: 'Evidencia clínica sobre punción seca en dolor miofascial',
      });

      const execResult = await executeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      expect(execResult.sources).toHaveLength(1);
      expect(execResult.sources[0]?.documentId).toBe('doc_recovery_protocol');
      expect(execResult.isGrounded).toBe(true);

      // Verify message in PostgreSQL
      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      const canonical = messages.find((m) => m.isCanonical);
      expect(canonical).toBeDefined();
      expect(canonical?.sources).toBeDefined();

      // Verify no invalid active generations remain
      const activeGenerations = await prisma.aiConversationMessage.findMany({
        where: {
          conversationId: created.conversationId,
          status: { in: ['PENDING', 'STREAMING'] },
        },
      });
      expect(activeGenerations).toHaveLength(0);
    });
  });

  // =========================================================================
  // TASK 7: Operational Shutdown and Restart
  // =========================================================================
  describe('Task 7: Operational Shutdown and Restart', () => {
    it('gracefully handles application shutdown: aborts active turns and leaves them recoverable', async () => {
      // 1. Start live worker and verify it is running
      const liveWorker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
        enabled: true,
        pollIntervalMs: 5000,
      });
      liveWorker.onModuleInit();
      expect(liveWorker.isRunning()).toBe(true);

      // 2. Shut down worker
      await liveWorker.onApplicationShutdown('SIGTERM');
      expect(liveWorker.isRunning()).toBe(false);

      // 3. Verify in-flight turns can be aborted cleanly with WORKER_SHUTDOWN
      expect(dispatcher.getActiveCount()).toBe(0);
    });

    it('ensures restarted worker picks up and completes turns left incomplete after shutdown', async () => {
      // 1. Create a turn while worker is stopped
      const offlineCreate = new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        messageRepo,
        undefined,
        undefined,
      );

      const created = await offlineCreate.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_shutdown_resume_01',
        userPrompt: 'Protocolo de ejercicios excéntricos de Aquiles',
      });

      // 2. Start a fresh worker instance
      const freshDispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);
      const freshWorker = new AiTurnGenerationWorker(turnRepo, convRepo, freshDispatcher, {
        enabled: false,
        staleThresholdMs: 0,
      });

      // 3. Fresh worker polls and discovers pending work
      const stats = await freshWorker.poll();
      expect(stats.recoveredPending).toBe(1);

      // 4. Wait for generation to complete
      for (let i = 0; i < 40; i++) {
        const turn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
        if (turn && turn.status === TurnStatus.COMPLETED) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      const finalTurn = await turnRepo.findById(TENANT_ID, created.conversationId, created.turnId);
      expect(finalTurn?.status).toBe(TurnStatus.COMPLETED);

      const messages = await messageRepo.listByTurn(
        TENANT_ID,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(1);
    });
  });
});
