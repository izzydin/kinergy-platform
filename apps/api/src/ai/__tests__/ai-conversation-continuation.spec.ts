import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  GetMessageHistoryUseCase,
  LoadCanonicalConversationHistoryUseCase,
  ArchiveConversationUseCase,
  ConversationNotFoundError,
  InvalidConversationLifecycleError,
  TurnAlreadyInProgressError,
  IAiTurnDispatcherPort,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';

/**
 * FE.08 — Backend Conversation Continuation & Context Window Acceptance Test
 *
 * Verifies multi-turn continuation against real PostgreSQL:
 * 1. Reserving subsequent turns associates messages with correct conversation and increments turnIndex.
 * 2. Sequence numbers advance monotonically without gaps or collisions (seq 1, 2, 3, 4...).
 * 3. Canonical history loading selects preceding completed turns and enforces bounded context window.
 * 4. Idempotency replay on continuation recovers existing turn without duplicate messages.
 * 5. Concurrency protection: prohibits reserving subsequent turn while an active turn is in progress.
 * 6. Lifecycle guard: prohibits reserving a turn on an archived conversation.
 * 7. Tenant isolation: cross-tenant continuation attempts fail with ConversationNotFoundError (404).
 */
describe('FE.08: Backend Conversation Continuation & Context Window (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveTurnUseCase: ReserveConversationTurnUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let archiveConvUseCase: ArchiveConversationUseCase;

  const TENANT_ALPHA = 'tenant_fe08_alpha';
  const TENANT_BETA = 'tenant_fe08_beta';
  const USER_ALPHA = 'usr_fe08_alpha';

  const mockDispatcher: IAiTurnDispatcherPort = {
    dispatchTurn: jest.fn().mockResolvedValue({ turnId: 'turn_mock', dispatched: true }),
    cancelTurn: jest.fn().mockResolvedValue(true),
    isTurnActive: jest.fn().mockReturnValue(false),
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

    createConvUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );

    reserveTurnUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );

    getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
    archiveConvUseCase = new ArchiveConversationUseCase(convRepo, turnRepo);

    // Clean up test tenants
    await prisma.aiConversationAuditLog.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.aiConversationMessage.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.aiConversationTurn.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.aiConversation.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
  });

  afterAll(async () => {
    await prisma.aiConversationAuditLog.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.aiConversationMessage.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.aiConversationTurn.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.aiConversation.deleteMany({
      where: { tenantId: { in: [TENANT_ALPHA, TENANT_BETA] } },
    });
    await prisma.$disconnect();
  });

  it('1. Successfully continues conversation: advances turnIndex and assigns sequential sequence numbers', async () => {
    // 1. Initial turn creation
    const turn1 = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe08_1',
      userPrompt: 'Primer prompt sobre biomecánica de sentadilla',
      title: 'Biomecánica de Sentadilla',
    });

    expect(turn1.turnIndex).toBe(1);

    // Complete Turn 1
    await prisma.aiConversationMessage.update({
      where: { id: turn1.assistantAttemptId },
      data: { status: 'SUCCESS', content: 'Respuesta biomecánica inicial.', isCanonical: true },
    });
    await prisma.aiConversationTurn.update({
      where: { id: turn1.turnId },
      data: { status: 'COMPLETED' },
    });

    // 2. Reserve subsequent turn on existing conversation
    const turn2 = await reserveTurnUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: turn1.conversationId,
      clientTurnId: 'turn_client_fe08_2',
      userPrompt: 'Segundo prompt: ¿Qué ángulo de flexión de rodilla es óptimo?',
    });

    expect(turn2.conversationId).toBe(turn1.conversationId);
    expect(turn2.turnIndex).toBe(2);
    expect(turn2.turnStatus).toBe('PENDING');

    // 3. Verify sequence numbers in database
    const userMsg2 = await prisma.aiConversationMessage.findUnique({
      where: { id: turn2.userMessageId },
    });
    const asstMsg2 = await prisma.aiConversationMessage.findUnique({
      where: { id: turn2.assistantAttemptId },
    });

    expect(userMsg2).not.toBeNull();
    expect(userMsg2!.sequenceNumber).toBe(3);
    expect(asstMsg2).not.toBeNull();
    expect(asstMsg2!.sequenceNumber).toBe(4);

    // Complete Turn 2
    await prisma.aiConversationMessage.update({
      where: { id: turn2.assistantAttemptId },
      data: {
        status: 'SUCCESS',
        content: 'El ángulo óptimo depende del objetivo.',
        isCanonical: true,
      },
    });
    await prisma.aiConversationTurn.update({
      where: { id: turn2.turnId },
      data: { status: 'COMPLETED' },
    });

    // 4. Verify canonical message history retrieval order
    const history = await getHistoryUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: turn1.conversationId,
    });

    expect(history.messages.length).toBe(4);
    const sequenceNumbers = history.messages.map((m) => m.sequenceNumber);
    expect(sequenceNumbers).toEqual([1, 2, 3, 4]);
  });

  it('2. Context window loading: injects prior completed turns and bounds history to max window', async () => {
    const turn1 = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe08_cw_1',
      userPrompt: 'Context Window Prompt 1',
    });

    await prisma.aiConversationMessage.update({
      where: { id: turn1.assistantAttemptId },
      data: { status: 'SUCCESS', content: 'Context Window Answer 1', isCanonical: true },
    });
    await prisma.aiConversationTurn.update({
      where: { id: turn1.turnId },
      data: { status: 'COMPLETED' },
    });

    const turn2 = await reserveTurnUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: turn1.conversationId,
      clientTurnId: 'turn_client_fe08_cw_2',
      userPrompt: 'Context Window Prompt 2',
    });

    // Load canonical context history for Turn 2
    const contextResult = await historyLoader.execute({
      tenantId: TENANT_ALPHA,
      conversationId: turn1.conversationId,
      turnId: turn2.turnId,
      maxCompletedTurns: 10,
    });

    expect(contextResult.conversationId).toBe(turn1.conversationId);
    expect(contextResult.currentTurnId).toBe(turn2.turnId);
    expect(contextResult.completedTurnsCount).toBe(1);
    expect(contextResult.isContextTruncated).toBe(false);
    expect(contextResult.priorCanonicalMessages.length).toBe(2); // Turn 1 user + Turn 1 asst
    expect(contextResult.priorCanonicalMessages[0]?.content).toBe('Context Window Prompt 1');
    expect(contextResult.priorCanonicalMessages[1]?.content).toBe('Context Window Answer 1');

    // Clean up turn 2
    await prisma.aiConversationMessage.update({
      where: { id: turn2.assistantAttemptId },
      data: { status: 'SUCCESS', content: 'Context Window Answer 2', isCanonical: true },
    });
    await prisma.aiConversationTurn.update({
      where: { id: turn2.turnId },
      data: { status: 'COMPLETED' },
    });
  });

  it('3. Enforces idempotency on continuation: repeated clientTurnId returns existing turn without duplicates', async () => {
    const turn1 = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe08_idem_1',
      userPrompt: 'Idempotency prompt inicial',
    });

    await prisma.aiConversationMessage.update({
      where: { id: turn1.assistantAttemptId },
      data: { status: 'SUCCESS', content: 'Respuesta inicial completada', isCanonical: true },
    });
    await prisma.aiConversationTurn.update({
      where: { id: turn1.turnId },
      data: { status: 'COMPLETED' },
    });

    const promptText = 'Pregunta para prueba de idempotencia en continuación';

    // First reservation
    const turn2A = await reserveTurnUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: turn1.conversationId,
      clientTurnId: 'turn_client_fe08_idem_2',
      userPrompt: promptText,
    });

    expect(turn2A.isIdempotentReplay).toBe(false);

    // Repeated reservation with identical clientTurnId and prompt
    const turn2B = await reserveTurnUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      conversationId: turn1.conversationId,
      clientTurnId: 'turn_client_fe08_idem_2',
      userPrompt: promptText,
    });

    expect(turn2B.isIdempotentReplay).toBe(true);
    expect(turn2B.turnId).toBe(turn2A.turnId);
    expect(turn2B.userMessageId).toBe(turn2A.userMessageId);

    // Clean up turn 2
    await prisma.aiConversationMessage.update({
      where: { id: turn2A.assistantAttemptId },
      data: { status: 'SUCCESS', content: 'Turn 2 resuelto', isCanonical: true },
    });
    await prisma.aiConversationTurn.update({
      where: { id: turn2A.turnId },
      data: { status: 'COMPLETED' },
    });

    // Verify no duplicate turns exist in PostgreSQL
    const turns = await prisma.aiConversationTurn.findMany({
      where: { conversationId: turn1.conversationId },
    });
    expect(turns.length).toBe(2); // Turn 1 + Turn 2
  });

  it('4. Concurrency guard: rejects turn reservation when another turn is actively generating', async () => {
    const turn1 = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe08_conc_1',
      userPrompt: 'Prompt para prueba de concurrencia',
    });

    // Turn 1 is currently in PENDING state (active)
    await expect(
      reserveTurnUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA,
        conversationId: turn1.conversationId,
        clientTurnId: 'turn_client_fe08_conc_2',
        userPrompt: 'Intento concurrente no permitido',
      }),
    ).rejects.toThrow(TurnAlreadyInProgressError);
  });

  it('5. Lifecycle guard: rejects turn reservation on archived conversation', async () => {
    const turn1 = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe08_arch_1',
      userPrompt: 'Prompt de conversación a archivar',
    });

    await prisma.aiConversationTurn.update({
      where: { id: turn1.turnId },
      data: { status: 'COMPLETED' },
    });

    await archiveConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: turn1.conversationId,
    });

    // Attempting to continue archived conversation must fail
    await expect(
      reserveTurnUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA,
        conversationId: turn1.conversationId,
        clientTurnId: 'turn_client_fe08_arch_2',
        userPrompt: 'Intento de continuar conversación archivada',
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('6. Tenant isolation: cross-tenant continuation attempts fail with 404', async () => {
    const turn1 = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe08_iso_1',
      userPrompt: 'Prompt en tenant Alpha',
    });

    await prisma.aiConversationTurn.update({
      where: { id: turn1.turnId },
      data: { status: 'COMPLETED' },
    });

    // Attempting to reserve turn on Alpha conversation from TENANT_BETA
    await expect(
      reserveTurnUseCase.execute({
        tenantId: TENANT_BETA,
        userId: USER_ALPHA,
        conversationId: turn1.conversationId,
        clientTurnId: 'turn_client_fe08_iso_2',
        userPrompt: 'Intento de inyección cross-tenant',
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });
});
