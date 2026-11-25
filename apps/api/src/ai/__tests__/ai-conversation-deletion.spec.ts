import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ArchiveConversationUseCase,
  ReserveConversationTurnUseCase,
  ListConversationsUseCase,
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
 * FE.07 — Backend Conversation Deletion & Retention Acceptance Test
 *
 * Verifies deletion semantics, lifecycle guards, and audit retention against real PostgreSQL:
 * 1. Soft-delete execution: sets deletedAt timestamp and marks isArchived in database.
 * 2. Query isolation: soft-deleted conversations are filtered from ordinary user history.
 * 3. Lifecycle invariant: turns cannot be reserved on archived conversations.
 * 4. Concurrency invariant: conversations cannot be archived while an active generation is in progress.
 * 5. Idempotent/Lifecycle guard: cannot re-archive an already archived conversation.
 * 6. Tenant isolation: cross-tenant deletion fails with ConversationNotFoundError (404).
 * 7. Regulatory retention: audit log records persist independently and are never pruned on archival.
 */
describe('FE.07: Backend Conversation Deletion & Retention (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveTurnUseCase: ReserveConversationTurnUseCase;
  let archiveConvUseCase: ArchiveConversationUseCase;
  let listConvUseCase: ListConversationsUseCase;

  const TENANT_ALPHA = 'tenant_fe07_alpha';
  const TENANT_BETA = 'tenant_fe07_beta';
  const USER_ALPHA = 'usr_fe07_alpha';

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

    archiveConvUseCase = new ArchiveConversationUseCase(convRepo, turnRepo);
    listConvUseCase = new ListConversationsUseCase(convRepo);

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

  it('1. Successfully soft-deletes (archives) conversation, setting deletedAt in PostgreSQL', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_1',
      userPrompt: 'Consulta sobre entrenamiento de resistencia',
      title: 'Resistencia Aeróbica',
    });

    // Mark the initial turn completed so conversation is idle
    await prisma.aiConversationTurn.update({
      where: { id: created.turnId },
      data: { status: 'COMPLETED' },
    });

    const archiveResult = await archiveConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    expect(archiveResult.conversationId).toBe(created.conversationId);
    expect(archiveResult.isArchived).toBe(true);
    expect(archiveResult.archivedAt).toBeDefined();

    // Verify database state: row still exists (soft delete) with deletedAt set
    const dbRecord = await prisma.aiConversation.findUnique({
      where: { id: created.conversationId },
    });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.deletedAt).not.toBeNull();
  });

  it('2. Soft-deleted conversation is omitted from ordinary history queries', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_2',
      userPrompt: 'Protocolo de movilidad articular',
    });

    await prisma.aiConversationTurn.update({
      where: { id: created.turnId },
      data: { status: 'COMPLETED' },
    });

    // Before archive: conversation appears in list
    const beforeList = await listConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
    });
    expect(beforeList.items.some((c) => c.id === created.conversationId)).toBe(true);

    // Archive conversation
    await archiveConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    // After archive: omitted from ordinary list (includeArchived: false)
    const afterList = await listConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
    });
    expect(afterList.items.some((c) => c.id === created.conversationId)).toBe(false);

    // Included when includeArchived: true is explicitly requested
    const archivedList = await listConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      includeArchived: true,
    });
    expect(archivedList.items.some((c) => c.id === created.conversationId)).toBe(true);
  });

  it('3. Prohibits reserving a turn on an archived or deleted conversation', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_3',
      userPrompt: 'Evaluación funcional de rodilla',
    });

    await prisma.aiConversationTurn.update({
      where: { id: created.turnId },
      data: { status: 'COMPLETED' },
    });

    await archiveConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    // Attempting to reserve a new turn must fail
    await expect(
      reserveTurnUseCase.execute({
        tenantId: TENANT_ALPHA,
        userId: USER_ALPHA,
        conversationId: created.conversationId,
        clientTurnId: 'turn_client_fe07_subsequent',
        userPrompt: 'Intento de prompt en hilo archivado',
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('4. Prohibits archiving a conversation while a generation turn is actively in progress', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_4',
      userPrompt: 'Cálculo de umbral anaeróbico',
    });

    // Initial turn is in PENDING/STREAMING state
    await expect(
      archiveConvUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: created.conversationId,
      }),
    ).rejects.toThrow(TurnAlreadyInProgressError);
  });

  it('5. Prohibits re-archiving an already archived conversation', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_5',
      userPrompt: 'Consulta sobre hidratación deportiva',
    });

    await prisma.aiConversationTurn.update({
      where: { id: created.turnId },
      data: { status: 'COMPLETED' },
    });

    await archiveConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    // Second archive attempt must fail
    await expect(
      archiveConvUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: created.conversationId,
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('6. Enforces tenant isolation: cross-tenant deletion fails with 404', async () => {
    const createdInAlpha = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_6',
      userPrompt: 'Plan preventivo de lesiones',
    });

    await prisma.aiConversationTurn.update({
      where: { id: createdInAlpha.turnId },
      data: { status: 'COMPLETED' },
    });

    // Attempting to archive from TENANT_BETA
    await expect(
      archiveConvUseCase.execute({
        tenantId: TENANT_BETA,
        conversationId: createdInAlpha.conversationId,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('7. Preserves regulatory audit trail records independently across archival', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe07_7',
      userPrompt: 'Protocolo clínico confidencial',
    });

    await prisma.aiConversationTurn.update({
      where: { id: created.turnId },
      data: { status: 'COMPLETED' },
    });

    // Create a regulatory audit log record
    await prisma.aiConversationAuditLog.create({
      data: {
        id: 'audit_fe07_1',
        conversationId: created.conversationId,
        tenantId: TENANT_ALPHA,
        conversationTitleSnapshot: 'Protocolo clínico confidencial',
        conversationOwnerUserId: USER_ALPHA,
        inspectorUserId: 'auditor_compliance',
        inspectorRole: 'ComplianceOfficer',
        action: 'CLINICAL_CONVERSATION_INSPECTED',
        reason: 'Revisión periódica de cumplimiento HIPAA',
      },
    });

    // Perform archival
    await archiveConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
    });

    // Verify audit log record persists intact
    const auditRecord = await prisma.aiConversationAuditLog.findUnique({
      where: { id: 'audit_fe07_1' },
    });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord!.conversationId).toBe(created.conversationId);
  });
});
