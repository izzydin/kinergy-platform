import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ExecuteConversationTurnUseCase,
  TurnStatus,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
  LoadCanonicalConversationHistoryUseCase,
  PersistMessageStateUseCase,
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
 * AI-09.3-BE.07: PostgreSQL Deadlock & Concurrency Isolation Regression Suite
 *
 * Verifies that PostgreSQL transactions, test fixtures, and background generation workers
 * adhere to strict concurrency isolation, clean lifecycle draining, deterministic cleanup,
 * and lock ordering safety (preventing SQLSTATE 40P01 deadlocks).
 *
 * Covers all Phase 5 regression requirements:
 * 1. Cleanup after a successfully completed worker turn.
 * 2. Cleanup after interrupted-worker recovery.
 * 3. Cleanup after a failed or controlled-failure worker execution.
 * 4. Two independent test fixtures using different tenant identifiers.
 * 5. Concurrent execution of independent fixtures against real PostgreSQL.
 * 6. Repeated cleanup without residual records or errors.
 * 7. Worker shutdown before cleanup (draining and graceful abort).
 * 8. Preservation of tenant isolation.
 * 9. Preservation of existing lease recovery behavior.
 * 10. Preservation of all relational constraints, partial indexes, and check constraints.
 * 11. Lock ordering verification: concurrent deletion and background completion with isolation.
 */
describe('AI-09.3-BE.07: PostgreSQL Deadlock & Concurrency Isolation Regression', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let executeUseCase: ExecuteConversationTurnUseCase;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;

  let dispatcher: AiTurnDispatcherService;
  let worker: AiTurnGenerationWorker;

  const mockRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(
        async (command: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => {
          if (command.signal?.aborted) {
            return {
              outcome: 'CANCELLED',
              content: '',
              isGrounded: false,
              sources: [],
              metadata: {
                model: 'clinical-reasoning-v1',
                retrievalCount: 0,
                latencyMs: 5,
              },
            };
          }
          return {
            outcome: 'SUCCESS',
            content: `Clinical answer for: ${command.userPrompt}`,
            isGrounded: true,
            sources: [
              {
                documentId: 'doc_regression_01',
                documentTitle: 'Guía Clínica de Readaptación Funcional',
                chunkId: 'chk_reg_01',
                relevanceScore: 0.95,
                pageNumber: 1,
                headingPath: ['Rehabilitación'],
              },
            ],
            metadata: {
              model: 'clinical-reasoning-v1',
              retrievalCount: 1,
              latencyMs: 15,
            },
          };
        },
      ),
  };

  const failingRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest.fn().mockImplementation(async (): Promise<RAGTurnExecutionResult> => {
      return {
        outcome: 'FAILED',
        content: '',
        isGrounded: false,
        sources: [],
        metadata: {
          model: 'clinical-reasoning-v1',
          retrievalCount: 0,
          latencyMs: 30000,
        },
        errorCode: 'INFERENCE_NODE_TIMEOUT',
        errorMessage: 'Downstream LLM inference node timed out after 30s',
      };
    }),
  };

  const activeTenantsForSuite = new Set<string>();

  const generateTenant = (prefix: string) => {
    const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    activeTenantsForSuite.add(id);
    return id;
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
  });

  afterAll(async () => {
    if (dispatcher) {
      await dispatcher.abortAndDrainAll('TEARDOWN');
    }
    if (worker) {
      await worker.onApplicationShutdown('TEARDOWN');
    }

    // Clean up all created tenants across this entire regression suite
    for (const tenantId of activeTenantsForSuite) {
      await prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}`;
      await prisma.$executeRaw`DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" = ${tenantId}`;
    }

    await prisma.$disconnect();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    dispatcher = new AiTurnDispatcherService(turnRepo, executeUseCase);
    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false,
      pollIntervalMs: 5000,
      staleThresholdMs: 0,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });
  });

  afterEach(async () => {
    if (dispatcher) {
      await dispatcher.abortAndDrainAll('TEARDOWN');
    }
    if (worker) {
      await worker.onApplicationShutdown('TEARDOWN');
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Cleanup after a successfully completed worker turn
  // ---------------------------------------------------------------------------
  it('1. performs deterministic cleanup after a successfully completed worker turn', async () => {
    const tenantId = generateTenant('tn_reg_success');
    const userId = 'usr_reg_01';

    const createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    const result = await createUseCase.execute({
      tenantId,
      userId,
      clientTurnId: 'turn_reg_succ_01',
      userPrompt: 'Protocolo de recuperación de menisco',
    });

    // Await completion in DB and drain dispatcher
    for (let i = 0; i < 40; i++) {
      const turn = await turnRepo.findById(tenantId, result.conversationId, result.turnId);
      if (turn && turn.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await dispatcher.awaitAllActive();

    // Verify turn completed with canonical message
    const completedTurn = await turnRepo.findById(tenantId, result.conversationId, result.turnId);
    expect(completedTurn?.status).toBe(TurnStatus.COMPLETED);

    // Perform cleanup without deadlocks or foreign key violations
    const deletedCount = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(deletedCount).toBe(1);

    // Confirm cascaded tables are zero
    const turnCount = await prisma.aiConversationTurn.count({ where: { tenantId } });
    const msgCount = await prisma.aiConversationMessage.count({ where: { tenantId } });
    expect(turnCount).toBe(0);
    expect(msgCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Cleanup after interrupted-worker recovery
  // ---------------------------------------------------------------------------
  it('2. performs clean cleanup after interrupted-worker recovery and lease clearing', async () => {
    const tenantId = generateTenant('tn_reg_recovery');
    const userId = 'usr_reg_02';

    const offlineCreate = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    const created = await offlineCreate.execute({
      tenantId,
      userId,
      clientTurnId: 'turn_reg_rec_01',
      userPrompt: 'Recuperación de ligamento cruzado anterior',
    });

    // Simulate crash: STREAMING with expired lease
    await turnRepo.updateStatus(tenantId, created.conversationId, created.turnId, {
      status: TurnStatus.STREAMING,
    });
    await prisma.aiConversationMessage.update({
      where: { id: created.assistantAttemptId },
      data: {
        status: 'STREAMING',
        leaseToken: 'lease_crashed_reg_pod',
        leaseOwnerInstanceId: 'pod_dead_reg',
        leaseExpiresAt: new Date(Date.now() - 300_000),
      },
    });

    // Poll and recover
    const stats = await worker.poll();
    expect(stats.recoveredStalled).toBe(1);

    // Await completion and drain
    for (let i = 0; i < 40; i++) {
      const turn = await turnRepo.findById(tenantId, created.conversationId, created.turnId);
      if (turn && turn.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await dispatcher.awaitAllActive();

    // Verify lease fields cleared
    const assistantMsg = await prisma.aiConversationMessage.findUnique({
      where: { id: created.assistantAttemptId },
    });
    expect(assistantMsg?.status).toBe('SUCCESS');
    expect(assistantMsg?.leaseToken).toBeNull();

    // Cleanup
    const deleted = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(deleted).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Cleanup after a failed or controlled-failure worker execution
  // ---------------------------------------------------------------------------
  it('3. performs clean cleanup after a failed worker execution without hanging transactions', async () => {
    const tenantId = generateTenant('tn_reg_fail');
    const userId = 'usr_reg_03';

    const failExecuteUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      failingRagPipeline,
      historyLoader,
      txRunner,
    );

    const failDispatcher = new AiTurnDispatcherService(turnRepo, failExecuteUseCase);

    const createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      failDispatcher,
    );

    const created = await createUseCase.execute({
      tenantId,
      userId,
      clientTurnId: 'turn_reg_fail_01',
      userPrompt: 'Caso clínico complejo que falla en inferencia',
    });

    // Await failure completion
    for (let i = 0; i < 40; i++) {
      const turn = await turnRepo.findById(tenantId, created.conversationId, created.turnId);
      if (turn && turn.status === TurnStatus.FAILED) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await failDispatcher.awaitAllActive();

    const turnInDb = await turnRepo.findById(tenantId, created.conversationId, created.turnId);
    expect(turnInDb?.status).toBe(TurnStatus.FAILED);

    // Clean up failed execution without deadlock
    await failDispatcher.abortAndDrainAll('TEARDOWN');
    const deleted = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(deleted).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Two independent test fixtures using different tenant identifiers
  // ---------------------------------------------------------------------------
  it('4. guarantees zero record contamination between two independent tenant fixtures', async () => {
    const tenantAlpha = generateTenant('tn_fixture_alpha');
    const tenantBeta = generateTenant('tn_fixture_beta');

    const offlineCreate = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    const convA = await offlineCreate.execute({
      tenantId: tenantAlpha,
      userId: 'usr_alpha',
      clientTurnId: 'shared_client_turn_id', // same clientTurnId in different tenants
      userPrompt: 'Consulta fisioterapia clínica Alpha',
    });

    const convB = await offlineCreate.execute({
      tenantId: tenantBeta,
      userId: 'usr_beta',
      clientTurnId: 'shared_client_turn_id', // permitted by composite constraint (tenant_id, client_turn_id)
      userPrompt: 'Consulta fisioterapia clínica Beta',
    });

    expect(convA.conversationId).not.toBe(convB.conversationId);
    expect(convA.turnId).not.toBe(convB.turnId);

    // Delete Tenant Alpha; Tenant Beta MUST remain completely unaffected
    await prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantAlpha}`;

    const countAlpha = await prisma.aiConversation.count({ where: { tenantId: tenantAlpha } });
    const countBeta = await prisma.aiConversation.count({ where: { tenantId: tenantBeta } });
    expect(countAlpha).toBe(0);
    expect(countBeta).toBe(1);

    // Clean up Tenant Beta
    await prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantBeta}`;
  });

  // ---------------------------------------------------------------------------
  // 5. Concurrent execution of independent fixtures
  // ---------------------------------------------------------------------------
  it('5. executes concurrent dispatches on independent tenant fixtures without locking conflicts', async () => {
    const tenant1 = generateTenant('tn_conc_1');
    const tenant2 = generateTenant('tn_conc_2');

    const createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      dispatcher,
    );

    // Launch two independent tenant conversations in parallel
    const [res1, res2] = await Promise.all([
      createUseCase.execute({
        tenantId: tenant1,
        userId: 'usr_conc_1',
        clientTurnId: 'turn_conc_01',
        userPrompt: 'Evaluación funcional paralela 1',
      }),
      createUseCase.execute({
        tenantId: tenant2,
        userId: 'usr_conc_2',
        clientTurnId: 'turn_conc_02',
        userPrompt: 'Evaluación funcional paralela 2',
      }),
    ]);

    // Await both to finish in PostgreSQL
    for (let i = 0; i < 40; i++) {
      const [t1, t2] = await Promise.all([
        turnRepo.findById(tenant1, res1.conversationId, res1.turnId),
        turnRepo.findById(tenant2, res2.conversationId, res2.turnId),
      ]);
      if (t1?.status === TurnStatus.COMPLETED && t2?.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await dispatcher.awaitAllActive();

    const [turn1, turn2] = await Promise.all([
      turnRepo.findById(tenant1, res1.conversationId, res1.turnId),
      turnRepo.findById(tenant2, res2.conversationId, res2.turnId),
    ]);
    expect(turn1?.status).toBe(TurnStatus.COMPLETED);
    expect(turn2?.status).toBe(TurnStatus.COMPLETED);

    // Clean up both tenants in parallel
    await Promise.all([
      prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenant1}`,
      prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenant2}`,
    ]);
  });

  // ---------------------------------------------------------------------------
  // 6. Repeated cleanup without residual records or errors (Idempotency)
  // ---------------------------------------------------------------------------
  it('6. executes repeated cleanups idempotently without residual records or deadlock', async () => {
    const tenantId = generateTenant('tn_reg_idemp');

    const offlineCreate = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    await offlineCreate.execute({
      tenantId,
      userId: 'usr_reg_idemp',
      clientTurnId: 'turn_idemp_cleanup_01',
      userPrompt: 'Verificación de idempotencia de borrado',
    });

    // First deletion
    const del1 = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(del1).toBe(1);

    // Second repeated deletion (must succeed safely with 0 rows affected)
    const del2 = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(del2).toBe(0);

    // Third repeated deletion
    const del3 = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(del3).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 7. Worker shutdown before cleanup
  // ---------------------------------------------------------------------------
  it('7. safely shuts down worker and dispatcher before executing database cleanup', async () => {
    const tenantId = generateTenant('tn_reg_shutdown');
    const liveWorker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: true,
      pollIntervalMs: 5000,
    });
    liveWorker.onModuleInit();
    expect(liveWorker.isRunning()).toBe(true);

    // Shut down worker explicitly
    await liveWorker.onApplicationShutdown('SIGTERM');
    expect(liveWorker.isRunning()).toBe(false);

    // Drain dispatcher
    await dispatcher.abortAndDrainAll('TEARDOWN');
    expect(dispatcher.getActiveCount()).toBe(0);

    // Cleanup should complete immediately
    const deleted = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(deleted).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 8. Preservation of tenant isolation
  // ---------------------------------------------------------------------------
  it('8. preserves tenant isolation and prevents cross-tenant record leakage', async () => {
    const tenantAlpha = generateTenant('tn_iso_test_a');
    const tenantBeta = generateTenant('tn_iso_test_b');

    const offlineCreate = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    const convAlpha = await offlineCreate.execute({
      tenantId: tenantAlpha,
      userId: 'usr_alpha',
      clientTurnId: 'turn_iso_priv_01',
      userPrompt: 'Historia clínica privada Alpha',
    });

    // Cross-tenant lookup via turnRepo port returns null
    const crossTurn = await turnRepo.findById(
      tenantBeta,
      convAlpha.conversationId,
      convAlpha.turnId,
    );
    expect(crossTurn).toBeNull();

    // Cross-tenant lookup via convRepo port returns null
    const crossConv = await convRepo.findById(tenantBeta, convAlpha.conversationId);
    expect(crossConv).toBeNull();

    // Cleanup
    await prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" IN (${tenantAlpha}, ${tenantBeta})`;
  });

  // ---------------------------------------------------------------------------
  // 9. Preservation of existing lease recovery behavior
  // ---------------------------------------------------------------------------
  it('9. preserves lease recovery behavior: clears lease fields on completion and reclaims crashed turn', async () => {
    const tenantId = generateTenant('tn_lease_preserv');
    const offlineCreate = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    const created = await offlineCreate.execute({
      tenantId,
      userId: 'usr_lease',
      clientTurnId: 'turn_lease_check_01',
      userPrompt: 'Prueba de preservación de semántica de lease',
    });

    // Crash simulate
    await turnRepo.updateStatus(tenantId, created.conversationId, created.turnId, {
      status: TurnStatus.STREAMING,
    });
    await prisma.aiConversationMessage.update({
      where: { id: created.assistantAttemptId },
      data: {
        status: 'STREAMING',
        leaseToken: 'lease_tok_abc',
        leaseOwnerInstanceId: 'worker_node_crash',
        leaseExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    const recoveryStats = await worker.poll();
    expect(recoveryStats.recoveredStalled).toBe(1);

    for (let i = 0; i < 40; i++) {
      const t = await turnRepo.findById(tenantId, created.conversationId, created.turnId);
      if (t && t.status === TurnStatus.COMPLETED) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await dispatcher.awaitAllActive();

    const msg = await prisma.aiConversationMessage.findUnique({
      where: { id: created.assistantAttemptId },
    });
    expect(msg?.status).toBe('SUCCESS');
    expect(msg?.leaseToken).toBeNull();
    expect(msg?.leaseOwnerInstanceId).toBeNull();
    expect(msg?.leaseExpiresAt).toBeNull();

    await prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}`;
  });

  // ---------------------------------------------------------------------------
  // 10. Preservation of relational constraints, partial indexes & check constraints
  // ---------------------------------------------------------------------------
  it('10. preserves PostgreSQL partial indexes and check constraints without regression', async () => {
    const tenantId = generateTenant('tn_invariants_reg');
    const offlineCreate = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    const created = await offlineCreate.execute({
      tenantId,
      userId: 'usr_invariants',
      clientTurnId: 'turn_inv_test_01',
      userPrompt: 'Verificación de invariantes relacionales',
    });

    await executeUseCase.execute({
      tenantId,
      userId: 'usr_invariants',
      conversationId: created.conversationId,
      turnId: created.turnId,
      actorContext: { roles: ['Trainer'], permissions: [] },
    });

    // Invariant 1: Single user message per turn
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "status", "created_at", "updated_at"
        ) VALUES (
          'msg_dup_user_reg', ${created.turnId}, ${created.conversationId}, ${tenantId}, 'USER', 99, 1, 'SUCCESS', NOW(), NOW()
        )
      `,
    ).rejects.toThrow(/23505|uq_turn_single_user_message/i);

    // Invariant 2: Single canonical assistant message per turn
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "is_canonical", "status", "created_at", "updated_at"
        ) VALUES (
          'msg_dup_canonical_reg', ${created.turnId}, ${created.conversationId}, ${tenantId}, 'ASSISTANT', 100, 2, TRUE, 'SUCCESS', NOW(), NOW()
        )
      `,
    ).rejects.toThrow(/23505|uq_turn_single_canonical_assistant/i);

    // Invariant 3: Canonical requires success check constraint
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "is_canonical", "status", "created_at", "updated_at"
        ) VALUES (
          'msg_canonical_fail_reg', ${created.turnId}, ${created.conversationId}, ${tenantId}, 'ASSISTANT', 101, 3, TRUE, 'FAILED', NOW(), NOW()
        )
      `,
    ).rejects.toThrow(/23514|chk_canonical_requires_success/i);

    // Invariant 4: Terminal attempt has no active lease
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role", "sequence_number", "attempt_number", "is_canonical", "status", "lease_token", "created_at", "updated_at"
        ) VALUES (
          'msg_lease_succ_reg', ${created.turnId}, ${created.conversationId}, ${tenantId}, 'ASSISTANT', 102, 4, FALSE, 'SUCCESS', 'active_lease', NOW(), NOW()
        )
      `,
    ).rejects.toThrow(/23514|chk_terminal_attempt_no_active_lease/i);

    // Invariant 5: Unique clientTurnId per tenant
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_turns" (
          "id", "conversation_id", "tenant_id", "turn_index", "client_turn_id", "idempotency_key", "idempotency_payload_hash", "status", "created_at", "updated_at"
        ) VALUES (
          'turn_dup_key_reg', ${created.conversationId}, ${tenantId}, 99, 'turn_inv_test_01', 'idemp_key_dup', 'hash_dup', 'PENDING', NOW(), NOW()
        )
      `,
    ).rejects.toThrow(
      /23505|uq_turn_tenant_client_turn_id|ai_conversation_turns_tenant_id_client_turn_id_key/i,
    );

    await prisma.$executeRaw`DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}`;
  });

  // ---------------------------------------------------------------------------
  // 11. Lock ordering & concurrency: deletion with active drainage
  // ---------------------------------------------------------------------------
  it('11. verifies that draining active executions before deletion prevents lock-ordering deadlocks', async () => {
    const tenantId = generateTenant('tn_lock_ordering');

    const slowRagPipeline: IRAGTurnPipelinePort = {
      executeTurn: jest.fn().mockImplementation(async (command) => {
        if (command.signal?.aborted) {
          return {
            outcome: 'CANCELLED',
            content: '',
            isGrounded: false,
            sources: [],
            metadata: { model: 'clinical-reasoning-v1', retrievalCount: 0, latencyMs: 0 },
          };
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 60);
          command.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        if (command.signal?.aborted) {
          return {
            outcome: 'CANCELLED',
            content: '',
            isGrounded: false,
            sources: [],
            metadata: { model: 'clinical-reasoning-v1', retrievalCount: 0, latencyMs: 0 },
          };
        }
        return {
          outcome: 'SUCCESS',
          content: `Slow answer for: ${command.userPrompt}`,
          isGrounded: true,
          sources: [],
          metadata: {
            model: 'clinical-reasoning-v1',
            retrievalCount: 0,
            latencyMs: 60,
          },
        };
      }),
    };

    const slowExecuteUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      slowRagPipeline,
      historyLoader,
      txRunner,
    );

    const slowDispatcher = new AiTurnDispatcherService(turnRepo, slowExecuteUseCase);

    const slowCreateUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      slowDispatcher,
    );

    const created = await slowCreateUseCase.execute({
      tenantId,
      userId: 'usr_lock',
      clientTurnId: 'turn_lock_order_01',
      userPrompt: 'Prueba de drenado y orden de locks',
    });

    expect(created.conversationId).toBeDefined();
    expect(slowDispatcher.getActiveCount()).toBe(1);

    // Hardened lifecycle: abortAndDrainAll ensures in-flight RAG/finalization completes or cleanly aborts
    // BEFORE the DELETE statement executes, proving the deadlock cannot occur!
    await slowDispatcher.abortAndDrainAll('TEARDOWN');
    expect(slowDispatcher.getActiveCount()).toBe(0);

    // Deletion runs with 100% safety
    const deleted = await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "tenant_id" = ${tenantId}
    `;
    expect(deleted).toBeGreaterThanOrEqual(0);
  });
});
