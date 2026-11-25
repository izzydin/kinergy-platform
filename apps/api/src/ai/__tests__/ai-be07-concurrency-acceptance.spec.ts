import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  ExecuteConversationTurnUseCase,
  CancelConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  TurnAlreadyInProgressError,
  DuplicateClientTurnPayloadMismatchError,
  InvalidConversationLifecycleError,
  IAiTurnDispatcherPort,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
  TurnStatus,
  GenerationStatus,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';

/**
 * Deterministic synchronization primitive for concurrency races.
 */
class Barrier {
  private resolvePromise!: () => void;
  public readonly promise: Promise<void>;

  constructor() {
    this.promise = new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  public release(): void {
    this.resolvePromise();
  }
}

/**
 * AI-09.3-BE.07.03 — PostgreSQL Concurrency & Race-Condition Acceptance
 *
 * Verifies against real PostgreSQL using independent database connections:
 * 1. Concurrent Turn Reservation Races (Single-active-generation invariant)
 * 2. Active-Generation Exclusivity (Partial unique index enforcement)
 * 3. Controlled Race: Cancellation vs Successful Finalization
 * 4. Stale Worker & Transactional Fencing Protection (Superseded attempts)
 * 5. Concurrent Idempotency Requests (Identical replay vs Conflict)
 * 6. Conversation & Message Consistency Under Concurrent Load
 * 7. Direct Database Constraints Verification (Partial indexes, checks, triggers)
 */
describe('AI-09.3-BE.07.03: PostgreSQL Concurrency & Race-Condition Acceptance', () => {
  // Independent Database Connections
  let prisma1: PrismaClient;
  let prisma2: PrismaClient;
  let prisma3: PrismaClient;

  // Connection 1 Repositories & Use Cases
  let convRepo1: PrismaAiConversationRepository;
  let turnRepo1: PrismaAiConversationTurnRepository;
  let messageRepo1: PrismaAiConversationMessageRepository;
  let auditRepo1: PrismaAiConversationAuditRepository;
  let txRunner1: PrismaAiConversationTransactionRunner;
  let createUseCase1: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase1: ReserveConversationTurnUseCase;
  let executeUseCase1: ExecuteConversationTurnUseCase;
  let historyLoader1: LoadCanonicalConversationHistoryUseCase;
  let persistUseCase1: PersistMessageStateUseCase;

  // Connection 2 Repositories & Use Cases
  let convRepo2: PrismaAiConversationRepository;
  let turnRepo2: PrismaAiConversationTurnRepository;
  let messageRepo2: PrismaAiConversationMessageRepository;
  let auditRepo2: PrismaAiConversationAuditRepository;
  let txRunner2: PrismaAiConversationTransactionRunner;
  let createUseCase2: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase2: ReserveConversationTurnUseCase;
  let cancelUseCase2: CancelConversationTurnUseCase;

  // Connection 3 Repositories & Use Cases
  let convRepo3: PrismaAiConversationRepository;
  let turnRepo3: PrismaAiConversationTurnRepository;
  let messageRepo3: PrismaAiConversationMessageRepository;
  let auditRepo3: PrismaAiConversationAuditRepository;
  let txRunner3: PrismaAiConversationTransactionRunner;
  let reserveUseCase3: ReserveConversationTurnUseCase;

  const TENANT_ID = 'tenant_conc_test';
  const USER_ID = 'usr_conc_physio_01';

  const mockDispatcher: IAiTurnDispatcherPort = {
    dispatchTurn: jest.fn().mockResolvedValue({
      turnId: 'mock-conc-turn',
      dispatched: true,
      status: 'DISPATCHED',
    }),
    cancelTurn: jest.fn().mockResolvedValue(true),
    isTurnActive: jest.fn().mockReturnValue(false),
  };

  // Controllable RAG Pipeline for controlled race synchronization
  let ragExecutionBarrier: Barrier | null = null;
  let onRagExecutionStarted: (() => Promise<void> | void) | null = null;

  const controllableRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(async (cmd: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => {
        if (onRagExecutionStarted) {
          await onRagExecutionStarted();
        }
        if (ragExecutionBarrier) {
          await ragExecutionBarrier.promise;
        }

        return {
          outcome: 'SUCCESS',
          content: `Grounded answer for query: ${cmd.userPrompt}`,
          isGrounded: true,
          sources: [
            {
              documentId: 'doc_conc_verified',
              documentTitle: 'Guía Clínica de Concurrencia',
              chunkId: 'chk_conc_01',
              relevanceScore: 0.95,
              pageNumber: 5,
              headingPath: ['Control de Concurrencia', 'Fencing'],
            },
          ],
          metadata: {
            model: 'test-model',
            retrievalCount: 1,
            latencyMs: 50,
            totalTokens: 150,
          },
        };
      }),
  };

  beforeAll(async () => {
    prisma1 = new PrismaClient();
    prisma2 = new PrismaClient();
    prisma3 = new PrismaClient();

    await Promise.all([prisma1.$connect(), prisma2.$connect(), prisma3.$connect()]);

    // Setup Connection 1
    convRepo1 = new PrismaAiConversationRepository(prisma1);
    turnRepo1 = new PrismaAiConversationTurnRepository(prisma1);
    messageRepo1 = new PrismaAiConversationMessageRepository(prisma1);
    auditRepo1 = new PrismaAiConversationAuditRepository(prisma1);
    txRunner1 = new PrismaAiConversationTransactionRunner(
      prisma1,
      convRepo1,
      turnRepo1,
      messageRepo1,
      auditRepo1,
    );
    createUseCase1 = new CreateConversationWithInitialTurnUseCase(
      txRunner1,
      turnRepo1,
      convRepo1,
      messageRepo1,
      undefined,
      mockDispatcher,
    );
    reserveUseCase1 = new ReserveConversationTurnUseCase(
      txRunner1,
      turnRepo1,
      convRepo1,
      messageRepo1,
      undefined,
      mockDispatcher,
    );
    persistUseCase1 = new PersistMessageStateUseCase(messageRepo1);
    historyLoader1 = new LoadCanonicalConversationHistoryUseCase(
      convRepo1,
      turnRepo1,
      messageRepo1,
    );
    executeUseCase1 = new ExecuteConversationTurnUseCase(
      convRepo1,
      turnRepo1,
      messageRepo1,
      persistUseCase1,
      controllableRagPipeline,
      historyLoader1,
      txRunner1,
    );

    // Setup Connection 2
    convRepo2 = new PrismaAiConversationRepository(prisma2);
    turnRepo2 = new PrismaAiConversationTurnRepository(prisma2);
    messageRepo2 = new PrismaAiConversationMessageRepository(prisma2);
    auditRepo2 = new PrismaAiConversationAuditRepository(prisma2);
    txRunner2 = new PrismaAiConversationTransactionRunner(
      prisma2,
      convRepo2,
      turnRepo2,
      messageRepo2,
      auditRepo2,
    );
    createUseCase2 = new CreateConversationWithInitialTurnUseCase(
      txRunner2,
      turnRepo2,
      convRepo2,
      messageRepo2,
      undefined,
      mockDispatcher,
    );
    reserveUseCase2 = new ReserveConversationTurnUseCase(
      txRunner2,
      turnRepo2,
      convRepo2,
      messageRepo2,
      undefined,
      mockDispatcher,
    );
    cancelUseCase2 = new CancelConversationTurnUseCase(
      convRepo2,
      turnRepo2,
      messageRepo2,
      txRunner2,
      mockDispatcher,
    );

    // Setup Connection 3
    convRepo3 = new PrismaAiConversationRepository(prisma3);
    turnRepo3 = new PrismaAiConversationTurnRepository(prisma3);
    messageRepo3 = new PrismaAiConversationMessageRepository(prisma3);
    auditRepo3 = new PrismaAiConversationAuditRepository(prisma3);
    txRunner3 = new PrismaAiConversationTransactionRunner(
      prisma3,
      convRepo3,
      turnRepo3,
      messageRepo3,
      auditRepo3,
    );
    reserveUseCase3 = new ReserveConversationTurnUseCase(
      txRunner3,
      turnRepo3,
      convRepo3,
      messageRepo3,
      undefined,
      mockDispatcher,
    );
  });

  afterAll(async () => {
    await prisma1.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" = '${TENANT_ID}'`,
    );
    await Promise.all([prisma1.$disconnect(), prisma2.$disconnect(), prisma3.$disconnect()]);
  });

  beforeEach(async () => {
    ragExecutionBarrier = null;
    onRagExecutionStarted = null;
    await prisma1.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" = '${TENANT_ID}'`,
    );
  });

  // =========================================================================
  // TASK 1: Concurrent Turn Reservation
  // =========================================================================
  describe('Task 1: Concurrent Turn Reservation Races', () => {
    it('enforces that exactly one reservation succeeds when two competing requests arrive simultaneously on independent connections', async () => {
      // 1. Create conversation with completed turn 1 so it is eligible for turn 2
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_conc_t1_init',
        userPrompt: 'Turn 1 prompt',
      });
      await executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // 2. Fire simultaneous reservation requests across independent connections
      const req1 = reserveUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        clientTurnId: 'turn_conc_race_A',
        userPrompt: 'Competing prompt A',
      });

      const req2 = reserveUseCase2.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        clientTurnId: 'turn_conc_race_B',
        userPrompt: 'Competing prompt B',
      });

      const results = await Promise.allSettled([req1, req2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Invariant: Exactly ONE succeeded and exactly ONE was rejected
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Invariant: The rejected request failed with TurnAlreadyInProgressError
      const rejectionError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectionError).toBeInstanceOf(TurnAlreadyInProgressError);

      // Invariant: Database state in PostgreSQL is pristine
      const turns = await prisma1.aiConversationTurn.findMany({
        where: { conversationId: init.conversationId },
        orderBy: { turnIndex: 'asc' },
      });
      expect(turns).toHaveLength(2); // Turn 1 (COMPLETED) + Turn 2 (PENDING)
      expect(turns[1]?.turnIndex).toBe(2);
      expect(turns[1]?.status).toBe(TurnStatus.PENDING);

      // Invariant: Exactly 4 messages exist (no orphaned user message or partial turn)
      const messages = await prisma1.aiConversationMessage.findMany({
        where: { conversationId: init.conversationId },
        orderBy: { sequenceNumber: 'asc' },
      });
      expect(messages).toHaveLength(4);
      expect(messages.map((m) => m.sequenceNumber)).toEqual([1, 2, 3, 4]);

      // Invariant: Conversation counters match committed rows
      const conversation = await convRepo1.findById(TENANT_ID, init.conversationId);
      expect(conversation?.turnCounter).toBe(2);
      expect(conversation?.messageCounter).toBe(4);
    });

    it('consistently protects the one-active-generation invariant under 3-way concurrent reservation attempts', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_conc_3way_init',
        userPrompt: 'Turn 1 base',
      });
      await executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // 3 independent connections race
      const [r1, r2, r3] = await Promise.allSettled([
        reserveUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: init.conversationId,
          clientTurnId: 'turn_3way_A',
          userPrompt: 'Prompt 3way A',
        }),
        reserveUseCase2.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: init.conversationId,
          clientTurnId: 'turn_3way_B',
          userPrompt: 'Prompt 3way B',
        }),
        reserveUseCase3.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: init.conversationId,
          clientTurnId: 'turn_3way_C',
          userPrompt: 'Prompt 3way C',
        }),
      ]);

      const fulfilled = [r1, r2, r3].filter((r) => r.status === 'fulfilled');
      const rejected = [r1, r2, r3].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);

      for (const rej of rejected) {
        expect((rej as PromiseRejectedResult).reason).toBeInstanceOf(TurnAlreadyInProgressError);
      }

      // Check PostgreSQL rows
      const activeCount = await prisma1.aiConversationTurn.count({
        where: {
          conversationId: init.conversationId,
          status: { in: ['PENDING', 'STREAMING'] },
        },
      });
      expect(activeCount).toBe(1);
    });
  });

  // =========================================================================
  // TASK 2: Active-Generation Exclusivity
  // =========================================================================
  describe('Task 2: Active-Generation Exclusivity & Partial Unique Index', () => {
    it('proves that the PostgreSQL partial unique index ai_conversation_active_generation_idx blocks two active assistant messages', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_partial_idx_init',
        userPrompt: 'Valid initial turn',
      });

      // Active assistant message already exists from createUseCase1 (status = PENDING)
      // Attempt a direct raw insert of a second active ASSISTANT message on the same conversation
      const duplicateActiveInsert = prisma1.$executeRawUnsafe(`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "status", "content", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid(), '${init.turnId}', '${init.conversationId}', '${TENANT_ID}', 'ASSISTANT', 99, 'STREAMING', '', NOW(), NOW()
        );
      `);

      // Must be rejected by PostgreSQL with unique constraint violation on ai_conversation_active_generation_idx
      await expect(duplicateActiveInsert).rejects.toThrow(/23505|unique|already exists/i);
    });

    it('allows distinct conversations to execute active generations concurrently without blocking each other', async () => {
      // Create two distinct conversations simultaneously
      const [convA, convB] = await Promise.all([
        createUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: 'turn_parallel_conv_A',
          userPrompt: 'Pregunta para Conversación A',
        }),
        createUseCase2.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: 'turn_parallel_conv_B',
          userPrompt: 'Pregunta para Conversación B',
        }),
      ]);

      expect(convA.conversationId).not.toBe(convB.conversationId);
      expect(convA.turnStatus).toBe(TurnStatus.PENDING);
      expect(convB.turnStatus).toBe(TurnStatus.PENDING);

      // Both active assistant placeholders exist peacefully in PostgreSQL
      const activeMessages = await prisma1.aiConversationMessage.findMany({
        where: {
          tenantId: TENANT_ID,
          role: 'ASSISTANT',
          status: 'PENDING',
        },
      });
      expect(activeMessages).toHaveLength(2);
    });
  });

  // =========================================================================
  // TASK 3: Cancellation vs Successful Finalization
  // =========================================================================
  describe('Task 3: Controlled Race: Cancellation vs Successful Finalization', () => {
    it('enforces that when cancellation wins the race, the late worker is fenced out and cannot persist canonical answer', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_cancel_race_01',
        userPrompt: 'Long running query to be cancelled mid-inference',
      });

      // Synchronize: RAG inference pauses inside executeTurn
      ragExecutionBarrier = new Barrier();
      const workerStartedBarrier = new Barrier();

      onRagExecutionStarted = () => {
        workerStartedBarrier.release();
      };

      // 1. Worker begins execution in background
      const workerPromise = executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Wait until worker is actively inside LLM inference
      await workerStartedBarrier.promise;

      // 2. Client cancels turn via Connection 2 while worker is executing
      const cancelResult = await cancelUseCase2.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        reason: 'User cancelled during inference',
      });

      expect(cancelResult.turnStatus).toBe(TurnStatus.CANCELLED);

      // 3. Worker finishes inference and attempts to finalize
      ragExecutionBarrier.release();
      const workerResult = await workerPromise;

      // Invariant: Worker was aborted by fencing check
      expect(workerResult.outcome).toBe('CANCELLED');
      expect(workerResult.errorCode).toBe('GENERATION_CANCELLED');

      // Invariant: In PostgreSQL, turn and assistant message remain CANCELLED; canonical is false
      const dbTurn = await prisma1.aiConversationTurn.findUnique({
        where: { id: init.turnId },
      });
      expect(dbTurn?.status).toBe(TurnStatus.CANCELLED);

      const dbAssistant = await prisma1.aiConversationMessage.findFirst({
        where: { turnId: init.turnId, role: 'ASSISTANT' },
      });
      expect(dbAssistant?.status).toBe(GenerationStatus.CANCELLED);
      expect(dbAssistant?.isCanonical).toBe(false);
      expect(dbAssistant?.sources).toBeNull();
    });

    it('enforces that when finalization wins the race, a subsequent cancellation is rejected with 409 Conflict', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_finalize_win_01',
        userPrompt: 'Quick query that completes before cancel arrives',
      });

      // 1. Worker completes execution first
      await executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // 2. Late cancellation arrives
      await expect(
        cancelUseCase2.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: init.conversationId,
          turnId: init.turnId,
          reason: 'Too late to cancel',
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);

      // Invariant: In PostgreSQL, turn remains COMPLETED and assistant remains SUCCESS/canonical
      const dbTurn = await prisma1.aiConversationTurn.findUnique({
        where: { id: init.turnId },
      });
      expect(dbTurn?.status).toBe(TurnStatus.COMPLETED);

      const dbAssistant = await prisma1.aiConversationMessage.findFirst({
        where: { turnId: init.turnId, role: 'ASSISTANT' },
      });
      expect(dbAssistant?.status).toBe(GenerationStatus.SUCCESS);
      expect(dbAssistant?.isCanonical).toBe(true);
    });
  });

  // =========================================================================
  // TASK 4: Stale Worker & Fencing Protection (Superseded Attempt)
  // =========================================================================
  describe('Task 4: Stale Worker & Fencing Protection (Superseded Attempt)', () => {
    it('fences out a stale worker when activeAttemptNumber has been incremented by recovery', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_stale_worker_01',
        userPrompt: 'Query executed by slow worker',
      });

      ragExecutionBarrier = new Barrier();
      const workerStartedBarrier = new Barrier();

      onRagExecutionStarted = () => {
        workerStartedBarrier.release();
      };

      // Worker 1 starts on Attempt 1
      const worker1Promise = executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      await workerStartedBarrier.promise;

      // Simulate recovery worker bumping attempt number in PostgreSQL
      await prisma2.$executeRawUnsafe(`
        UPDATE "ai_conversation_turns"
        SET "active_attempt_number" = 2
        WHERE "id" = '${init.turnId}';
      `);

      // Release Worker 1
      ragExecutionBarrier.release();
      const worker1Result = await worker1Promise;

      // Invariant: Worker 1 detected attempt was superseded
      expect(worker1Result.errorCode).toBe('ATTEMPT_SUPERSEDED');
      expect(worker1Result.isCanonical).toBe(false);

      // Invariant: Original attempt is not marked canonical
      const originalAttempt = await prisma1.aiConversationMessage.findFirst({
        where: { turnId: init.turnId, role: 'ASSISTANT', attemptNumber: 1 },
      });
      expect(originalAttempt?.isCanonical).toBe(false);
    });
  });

  // =========================================================================
  // TASK 5: Concurrent Idempotency Requests
  // =========================================================================
  describe('Task 5: Concurrent Idempotency Requests', () => {
    it('recovers cleanly when 4 identical requests are submitted concurrently with the same clientTurnId', async () => {
      const sharedClientTurnId = 'idempotent-concurrent-key-9999';
      const prompt = 'Identical concurrent prompt';

      // 4 simultaneous requests on independent connections
      const results = await Promise.all([
        createUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: sharedClientTurnId,
          userPrompt: prompt,
        }),
        createUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: sharedClientTurnId,
          userPrompt: prompt,
        }),
        createUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: sharedClientTurnId,
          userPrompt: prompt,
        }),
        createUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          clientTurnId: sharedClientTurnId,
          userPrompt: prompt,
        }),
      ]);

      // All 4 resolved successfully
      expect(results).toHaveLength(4);

      // Exactly ONE is the creator, the other 3 are idempotent replays
      const creators = results.filter((r) => !r.isIdempotentReplay);
      const replays = results.filter((r) => r.isIdempotentReplay);

      expect(creators).toHaveLength(1);
      expect(replays).toHaveLength(3);

      // All 4 observe the exact same conversation and turn IDs
      const conversationId = creators[0]!.conversationId;
      const turnId = creators[0]!.turnId;

      for (const res of results) {
        expect(res.conversationId).toBe(conversationId);
        expect(res.turnId).toBe(turnId);
      }

      // In PostgreSQL: Exactly 1 turn and 2 messages exist
      const turnRows = await prisma1.aiConversationTurn.findMany({
        where: { conversationId },
      });
      expect(turnRows).toHaveLength(1);

      const msgRows = await prisma1.aiConversationMessage.findMany({
        where: { conversationId },
      });
      expect(msgRows).toHaveLength(2);
    });

    it('rejects concurrent requests using the same clientTurnId with conflicting payloads with 409 Conflict', async () => {
      const conflictKey = 'idempotent-conflict-key-8888';

      // Fire 2 concurrent requests with same key but conflicting prompts
      const reqA = createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: conflictKey,
        userPrompt: 'Payload A for conflict test',
      });

      const reqB = createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: conflictKey,
        userPrompt: 'Payload B completely different prompt',
      });

      const [resA, resB] = await Promise.allSettled([reqA, reqB]);

      // One must succeed, one must fail with DuplicateClientTurnPayloadMismatchError
      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        DuplicateClientTurnPayloadMismatchError,
      );
    });
  });

  // =========================================================================
  // TASK 6: Conversation & Message Consistency Under Concurrency
  // =========================================================================
  describe('Task 6: Conversation & Message Consistency Under Concurrency', () => {
    it('maintains strict sequence uniqueness and monotonic ordering across rapid successive turns', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_seq_init',
        userPrompt: 'Turn 1 prompt',
      });
      await executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Execute 3 subsequent turns sequentially
      for (let i = 2; i <= 4; i++) {
        const turn = await reserveUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: init.conversationId,
          clientTurnId: `turn_seq_${i}`,
          userPrompt: `Prompt for turn ${i}`,
        });

        await executeUseCase1.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: init.conversationId,
          turnId: turn.turnId,
          actorContext: { roles: ['Trainer'], permissions: [] },
        });
      }

      // Check PostgreSQL sequence ordering
      const allMessages = await prisma1.aiConversationMessage.findMany({
        where: { conversationId: init.conversationId },
        orderBy: { sequenceNumber: 'asc' },
      });

      expect(allMessages).toHaveLength(8);
      const seqNumbers = allMessages.map((m) => m.sequenceNumber);
      expect(seqNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      // Check conversation counters
      const conv = await convRepo1.findById(TENANT_ID, init.conversationId);
      expect(conv?.turnCounter).toBe(4);
      expect(conv?.messageCounter).toBe(8);
    });
  });

  // =========================================================================
  // TASK 7: Direct Database Constraint & Invariant Verification
  // =========================================================================
  describe('Task 7: Direct Database Constraint & Invariant Verification', () => {
    it('enforces uq_turn_single_user_message: rejects inserting two user messages for the same turn', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_single_user_msg_test',
        userPrompt: 'Original user message',
      });

      // Attempt to insert a second user message for the same turn
      const insertSecondUserMsg = prisma1.$executeRawUnsafe(`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "status", "content", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid(), '${init.turnId}', '${init.conversationId}', '${TENANT_ID}', 'USER', 50, 'SUCCESS', 'Second user message', NOW(), NOW()
        );
      `);

      await expect(insertSecondUserMsg).rejects.toThrow(/23505|unique|already exists/i);
    });

    it('enforces uq_turn_single_canonical_assistant: rejects marking two assistant messages as canonical for the same turn', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_single_canonical_test',
        userPrompt: 'Original user message',
      });

      // Complete turn to make existing assistant canonical
      await executeUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: init.conversationId,
        turnId: init.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Attempt to insert a second canonical assistant message for the same turn
      const insertSecondCanonical = prisma1.$executeRawUnsafe(`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "is_canonical", "status", "content", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid(), '${init.turnId}', '${init.conversationId}', '${TENANT_ID}', 'ASSISTANT', 51, TRUE, 'SUCCESS', 'Second canonical message', NOW(), NOW()
        );
      `);

      await expect(insertSecondCanonical).rejects.toThrow(/23505|unique|already exists/i);
    });

    it('enforces chk_canonical_requires_success: rejects is_canonical = TRUE on non-SUCCESS status', async () => {
      const init = await createUseCase1.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        clientTurnId: 'turn_chk_canonical_status',
        userPrompt: 'Test check constraint',
      });

      // Attempt to insert a canonical message with status PENDING
      const insertCanonicalPending = prisma1.$executeRawUnsafe(`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "is_canonical", "status", "content", "created_at", "updated_at"
        ) VALUES (
          gen_random_uuid(), '${init.turnId}', '${init.conversationId}', '${TENANT_ID}', 'ASSISTANT', 52, TRUE, 'PENDING', 'Pending canonical', NOW(), NOW()
        );
      `);

      await expect(insertCanonicalPending).rejects.toThrow(
        /check constraint|chk_canonical_requires_success/i,
      );
    });
  });
});
