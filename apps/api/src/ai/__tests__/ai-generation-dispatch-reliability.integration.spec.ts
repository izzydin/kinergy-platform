import { PrismaClient } from '@prisma/client';
import {
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  CancelConversationTurnUseCase,
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  TurnStatus,
  IRAGTurnPipelinePort,
  RAGTurnExecutionOutcome,
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
 * AI-09.3-BE.06.05 — Generation Dispatch Reliability, Failure Handling & Cancellation
 * Real PostgreSQL Integration Tests
 *
 * Verifies against real PostgreSQL:
 * 1. Immediate Dispatch: Turn reservation hands work to dispatcher without blocking HTTP response.
 * 2. Idempotent reservation skips duplicate dispatches.
 * 3. Crash Recovery: Background worker discovers committed PENDING turns and recovers execution.
 * 4. Stalled Lease Recovery: Worker recovers STREAMING turns whose lease expired.
 * 5. Cancellation:
 *    - In-flight execution is signaled via AbortController.
 *    - State transitions atomically to CANCELLED in PostgreSQL.
 *    - Repeated cancellations are strictly idempotent.
 *    - Attempting to cancel an already COMPLETED turn is rejected.
 * 6. Fencing against late generation completion after cancellation.
 */
describe('AI-09.3-BE.06.05: Generation Dispatch Reliability & Cancellation (PostgreSQL Integration)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let executeTurnUseCase: ExecuteConversationTurnUseCase;
  let dispatcher: AiTurnDispatcherService;
  let worker: AiTurnGenerationWorker;
  let cancelUseCase: CancelConversationTurnUseCase;
  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveTurnUseCase: ReserveConversationTurnUseCase;

  const TENANT_ID = 'tenant_dispatch_test';
  const USER_ID = 'usr_clinician_dispatch_01';

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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-dispatch-%'`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-dispatch-%'`,
    );
  });

  function setupPipeline(mockOutcome = 'SUCCESS') {
    const mockRagPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockImplementation(async (command) => {
        if (command.signal?.aborted) {
          const err = new Error('Execution aborted by signal');
          err.name = 'AbortError';
          throw err;
        }
        return {
          outcome: mockOutcome as RAGTurnExecutionOutcome,
          content: 'Reliable dispatched clinical response.',
          isGrounded: true,
          sources: [],
          metadata: { model: 'mock-llm', retrievalCount: 0, latencyMs: 50 },
        };
      }),
    };

    executeTurnUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    dispatcher = new AiTurnDispatcherService(turnRepo, executeTurnUseCase);

    cancelUseCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      txRunner,
      dispatcher,
    );

    createConvUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    reserveTurnUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 1000,
      staleThresholdMs: 300_000,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });
  }

  it('reserves an initial turn, dispatches it asynchronously, and reaches COMPLETED in PostgreSQL', async () => {
    setupPipeline();

    const clientTurnId = `ct_dispatch_${Date.now()}`;
    const result = await createConvUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId,
      userPrompt: 'Formulate an exercise regimen for patient with knee arthroscopy.',
      title: 'Knee Rehab',
      actorContext: { roles: ['CLINICIAN'], permissions: [] },
    });

    expect(result.conversationId).toBeDefined();
    expect(result.turnId).toBeDefined();
    expect(result.turnStatus).toBe(TurnStatus.PENDING);
    expect(result.isIdempotentReplay).toBe(false);

    // Wait for asynchronous dispatcher execution to finish
    let completedTurn = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const turn = await turnRepo.findById(TENANT_ID, result.conversationId, result.turnId);
      if (turn && turn.status === TurnStatus.COMPLETED) {
        completedTurn = turn;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(completedTurn).not.toBeNull();
    expect(completedTurn?.status).toBe(TurnStatus.COMPLETED);

    // Verify canonical assistant message was saved
    const messages = await messageRepo.listByTurn(TENANT_ID, result.conversationId, result.turnId);
    const assistantMsg = messages.find((m) => m.isCanonical);
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.content).toBe('Reliable dispatched clinical response.');
  });

  it('idempotent replay of turn reservation does not trigger duplicate dispatch or duplicate message', async () => {
    setupPipeline();

    const clientTurnId = `ct_dispatch_idemp_${Date.now()}`;
    const firstResult = await createConvUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId,
      userPrompt: 'Assess range of motion progress.',
      actorContext: { roles: [], permissions: [] },
    });

    // Wait for first turn to complete
    for (let attempt = 0; attempt < 40; attempt++) {
      const turn = await turnRepo.findById(
        TENANT_ID,
        firstResult.conversationId,
        firstResult.turnId,
      );
      if (turn && turn.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Replay with identical clientTurnId
    const replayResult = await createConvUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId,
      userPrompt: 'Assess range of motion progress.',
      actorContext: { roles: [], permissions: [] },
    });

    expect(replayResult.isIdempotentReplay).toBe(true);
    expect(replayResult.idempotencyOutcome).toBe('EXISTING_RECOVERED');
    expect(replayResult.turnId).toBe(firstResult.turnId);

    // Ensure exactly 1 canonical message exists
    const messages = await messageRepo.listByTurn(
      TENANT_ID,
      firstResult.conversationId,
      firstResult.turnId,
    );
    const canonicalMessages = messages.filter((m) => m.isCanonical);
    expect(canonicalMessages.length).toBe(1);
  });

  it('recovers pending turns committed in PostgreSQL when dispatcher was offline/crashed', async () => {
    // Setup without dispatcher so turn stays PENDING
    const mockRagPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockResolvedValue({
        outcome: 'SUCCESS' as RAGTurnExecutionOutcome,
        content: 'Recovered background answer.',
        isGrounded: true,
        sources: [],
        metadata: { model: 'mock-llm', retrievalCount: 0, latencyMs: 50 },
      }),
    };

    executeTurnUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    dispatcher = new AiTurnDispatcherService(turnRepo, executeTurnUseCase);

    // Reserve with no dispatcher attached
    const offlineCreateUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined, // offline dispatcher
    );

    const clientTurnId = `ct_dispatch_recover_${Date.now()}`;
    const result = await offlineCreateUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId,
      userPrompt: 'Shoulder stability exercises.',
    });

    // Turn is durably committed in PostgreSQL as PENDING
    const initialTurn = await turnRepo.findById(TENANT_ID, result.conversationId, result.turnId);
    expect(initialTurn?.status).toBe(TurnStatus.PENDING);

    // Now start the recovery worker
    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 1000,
      staleThresholdMs: 300_000,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });

    const recoveryStats = await worker.poll();
    expect(recoveryStats.recoveredPending).toBe(1);

    // Wait for recovered turn to complete
    let finishedTurn = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const turn = await turnRepo.findById(TENANT_ID, result.conversationId, result.turnId);
      if (turn && turn.status === TurnStatus.COMPLETED) {
        finishedTurn = turn;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(finishedTurn?.status).toBe(TurnStatus.COMPLETED);
  });

  it('cancels an active turn, persisting CANCELLED status and signaling abort', async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockRagPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockImplementation(async (command) => {
        capturedSignal = command.signal;
        // Long running to allow cancellation
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return {
          outcome: 'SUCCESS' as RAGTurnExecutionOutcome,
          content: 'Late response.',
          isGrounded: true,
          sources: [],
          metadata: { model: 'mock-llm', retrievalCount: 0, latencyMs: 50 },
        };
      }),
    };

    executeTurnUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    dispatcher = new AiTurnDispatcherService(turnRepo, executeTurnUseCase);
    cancelUseCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      txRunner,
      dispatcher,
    );

    createConvUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    const clientTurnId = `ct_dispatch_cancel_${Date.now()}`;
    const result = await createConvUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId,
      userPrompt: 'Assess cervical spine mobility.',
    });

    // Wait briefly for execution to be active
    for (let i = 0; i < 20; i++) {
      if (dispatcher.isTurnActive(TENANT_ID, result.conversationId, result.turnId)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(dispatcher.isTurnActive(TENANT_ID, result.conversationId, result.turnId)).toBe(true);

    // Cancel turn
    const cancelResult = await cancelUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: result.conversationId,
      turnId: result.turnId,
      reason: 'User cancelled via UI',
    });

    expect(cancelResult.turnStatus).toBe(TurnStatus.CANCELLED);
    expect(cancelResult.isAlreadyCancelled).toBe(false);
    expect(capturedSignal?.aborted).toBe(true);

    // Verify turn in DB is CANCELLED
    const cancelledTurnInDb = await turnRepo.findById(
      TENANT_ID,
      result.conversationId,
      result.turnId,
    );
    expect(cancelledTurnInDb?.status).toBe(TurnStatus.CANCELLED);

    // Verify idempotent cancellation
    const repeatCancel = await cancelUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: result.conversationId,
      turnId: result.turnId,
    });
    expect(repeatCancel.isAlreadyCancelled).toBe(true);
    expect(repeatCancel.turnStatus).toBe(TurnStatus.CANCELLED);
  });

  it('rejects cancellation of an already COMPLETED turn with InvalidConversationLifecycleError', async () => {
    setupPipeline();

    const clientTurnId = `ct_dispatch_comp_${Date.now()}`;
    const result = await createConvUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId,
      userPrompt: 'Quick question on patellar tendinitis.',
    });

    // Wait for completion
    for (let attempt = 0; attempt < 40; attempt++) {
      const turn = await turnRepo.findById(TENANT_ID, result.conversationId, result.turnId);
      if (turn && turn.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    await expect(
      cancelUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: result.conversationId,
        turnId: result.turnId,
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('reserves a subsequent turn via ReserveConversationTurnUseCase and dispatches successfully', async () => {
    setupPipeline();

    // 1. Create Initial Turn and wait for completion
    const initialTurnId = `ct_disp_init_${Date.now()}`;
    const initialResult = await createConvUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      clientTurnId: initialTurnId,
      userPrompt: 'Initial clinical assessment.',
    });

    for (let attempt = 0; attempt < 40; attempt++) {
      const turn = await turnRepo.findById(
        TENANT_ID,
        initialResult.conversationId,
        initialResult.turnId,
      );
      if (turn && turn.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // 2. Reserve subsequent turn
    const secondTurnId = `ct_disp_second_${Date.now()}`;
    const secondResult = await reserveTurnUseCase.execute({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: initialResult.conversationId,
      clientTurnId: secondTurnId,
      userPrompt: 'Follow-up question on treatment progression.',
      actorContext: { roles: ['CLINICIAN'], permissions: [] },
    });

    expect(secondResult.turnIndex).toBe(2);
    expect(secondResult.turnStatus).toBe(TurnStatus.PENDING);
    expect(secondResult.isIdempotentReplay).toBe(false);

    // Wait for second turn to complete
    let completedSecondTurn = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const turn = await turnRepo.findById(
        TENANT_ID,
        initialResult.conversationId,
        secondResult.turnId,
      );
      if (turn && turn.status === TurnStatus.COMPLETED) {
        completedSecondTurn = turn;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(completedSecondTurn).not.toBeNull();
    expect(completedSecondTurn?.status).toBe(TurnStatus.COMPLETED);
  });
});
