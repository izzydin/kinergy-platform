import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  UpdateConversationTitleUseCase,
  ConversationNotFoundError,
  InvalidTurnInputError,
  InvalidConversationLifecycleError,
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
 * FE.06 — Backend Conversation Renaming & Metadata Acceptance Test
 *
 * Verifies backend renaming invariants against real PostgreSQL:
 * 1. Authenticated rename updates active conversation title and persists in PostgreSQL.
 * 2. UpdatedAt timestamp is updated to reflect modification time.
 * 3. Input validation enforces title constraints (1-255 chars, rejects empty/whitespace-only).
 * 4. Tenant isolation: cross-tenant rename attempts fail with ConversationNotFoundError (404).
 * 5. Lifecycle invariant: renaming an archived conversation fails with InvalidConversationLifecycleError.
 */
describe('FE.06: Backend Conversation Renaming & Metadata (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;
  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let updateTitleUseCase: UpdateConversationTitleUseCase;

  const TENANT_ALPHA = 'tenant_fe06_alpha';
  const TENANT_BETA = 'tenant_fe06_beta';
  const USER_ALPHA = 'usr_fe06_alpha';

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

    updateTitleUseCase = new UpdateConversationTitleUseCase(convRepo);

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

  it('1. Successfully updates active conversation title and advances updatedAt', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe06_1',
      userPrompt: 'Protocolo inicial de entrenamiento interválico',
      title: 'Título Inicial',
    });

    const initialConv = await convRepo.findById(TENANT_ALPHA, created.conversationId);
    expect(initialConv).not.toBeNull();
    const initialUpdatedAt = initialConv!.updatedAt.getTime();

    // Small delay to ensure timestamp progression
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await updateTitleUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
      title: 'Protocolo de Alta Intensidad (HIIT) Actualizado',
    });

    expect(result.conversationId).toBe(created.conversationId);
    expect(result.title).toBe('Protocolo de Alta Intensidad (HIIT) Actualizado');

    // Verify DB persistence
    const persisted = await convRepo.findById(TENANT_ALPHA, created.conversationId);
    expect(persisted).not.toBeNull();
    expect(persisted!.title.value).toBe('Protocolo de Alta Intensidad (HIIT) Actualizado');
    expect(persisted!.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt);
  });

  it('2. Enforces input validation: rejects empty, whitespace-only, and excessively long titles', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe06_2',
      userPrompt: 'Consulta sobre marcadores bioquímicos',
    });

    // Empty title
    await expect(
      updateTitleUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: created.conversationId,
        title: '',
      }),
    ).rejects.toThrow(InvalidTurnInputError);

    // Whitespace only
    await expect(
      updateTitleUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: created.conversationId,
        title: '   \t  \n  ',
      }),
    ).rejects.toThrow(InvalidTurnInputError);

    // Excessively long (> 255 chars)
    const longTitle = 'a'.repeat(256);
    await expect(
      updateTitleUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: created.conversationId,
        title: longTitle,
      }),
    ).rejects.toThrow(InvalidTurnInputError);
  });

  it('3. Trims whitespace properly around valid titles', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe06_3',
      userPrompt: 'Consulta sobre suplementación con creatina',
    });

    const result = await updateTitleUseCase.execute({
      tenantId: TENANT_ALPHA,
      conversationId: created.conversationId,
      title: '   Suplementación con Creatina Monohidrato   ',
    });

    expect(result.title).toBe('Suplementación con Creatina Monohidrato');

    const persisted = await convRepo.findById(TENANT_ALPHA, created.conversationId);
    expect(persisted!.title.value).toBe('Suplementación con Creatina Monohidrato');
  });

  it('4. Enforces strict tenant isolation: rejects cross-tenant rename with 404', async () => {
    const createdInAlpha = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe06_4',
      userPrompt: 'Plan nutricional personalizado',
    });

    // Attempt rename from TENANT_BETA
    await expect(
      updateTitleUseCase.execute({
        tenantId: TENANT_BETA,
        conversationId: createdInAlpha.conversationId,
        title: 'Intento de Inyección Cross-Tenant',
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('5. Enforces lifecycle invariant: rejects rename on archived conversations', async () => {
    const created = await createConvUseCase.execute({
      tenantId: TENANT_ALPHA,
      userId: USER_ALPHA,
      clientTurnId: 'turn_client_fe06_5',
      userPrompt: 'Conversación a archivar',
    });

    // Archive the conversation directly
    const conv = await convRepo.findById(TENANT_ALPHA, created.conversationId);
    expect(conv).not.toBeNull();
    conv!.archive();
    await convRepo.save(conv!);

    // Attempt rename on archived conversation
    await expect(
      updateTitleUseCase.execute({
        tenantId: TENANT_ALPHA,
        conversationId: created.conversationId,
        title: 'Nuevo Título Post-Archivo',
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);
  });
});
