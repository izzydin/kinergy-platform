import { PrismaClient } from '@prisma/client';
import { PrismaAiConversationRepository } from '../repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../repositories/prisma-ai-conversation-audit.repository';
import { PrismaAiConversationTransactionRunner } from '../prisma-ai-conversation-transaction-runner';
import { CreateConversationWithInitialTurnUseCase } from '../../../../application/use-cases/create-conversation-with-initial-turn.use-case';
import { GetConversationUseCase } from '../../../../application/use-cases/get-conversation.use-case';
import { ListConversationsUseCase } from '../../../../application/use-cases/list-conversations.use-case';
import { GetMessageHistoryUseCase } from '../../../../application/use-cases/get-message-history.use-case';
import { UpdateConversationTitleUseCase } from '../../../../application/use-cases/update-conversation-title.use-case';
import { ArchiveConversationUseCase } from '../../../../application/use-cases/archive-conversation.use-case';
import { PersistMessageStateUseCase } from '../../../../application/use-cases/persist-message-state.use-case';
import {
  ConversationNotFoundError,
  InvalidConversationLifecycleError,
  InvalidMessageOperationError,
  TurnAlreadyInProgressError,
} from '../../../../application/errors/ai-conversation-application.error';
import { GenerationStatus } from '../../../../domain/enums/generation-status.enum';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';

describe('AI-09.3-BE.04.04 — Conversation & Message Workflows PostgreSQL Integration Tests', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let getConvUseCase: GetConversationUseCase;
  let listConvUseCase: ListConversationsUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let updateTitleUseCase: UpdateConversationTitleUseCase;
  let archiveConvUseCase: ArchiveConversationUseCase;
  let persistMsgUseCase: PersistMessageStateUseCase;

  let isDbAvailable = false;

  const testTenant = `tenant_wkflow_${Date.now()}`;
  const testTenantOther = `tenant_wkflow_other_${Date.now()}`;
  const testUserId = `user_wkflow_${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;

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
      );
      getConvUseCase = new GetConversationUseCase(convRepo, turnRepo);
      listConvUseCase = new ListConversationsUseCase(convRepo);
      getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
      updateTitleUseCase = new UpdateConversationTitleUseCase(convRepo);
      archiveConvUseCase = new ArchiveConversationUseCase(convRepo, turnRepo);
      persistMsgUseCase = new PersistMessageStateUseCase(messageRepo);
    } catch (err) {
      isDbAvailable = false;
      console.warn('PostgreSQL database not available for integration tests; skipping.', err);
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      await prisma.aiConversationAuditLog.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantOther] } },
      });
      await prisma.aiConversationMessage.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantOther] } },
      });
      await prisma.aiConversationTurn.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantOther] } },
      });
      await prisma.aiConversation.deleteMany({
        where: { tenantId: { in: [testTenant, testTenantOther] } },
      });
      await prisma.$disconnect();
    }
  });

  it('1. verifies tenant-scoped GetConversationUseCase and prevents cross-tenant access', async () => {
    if (!isDbAvailable) return;

    const created = await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_turn_get_${Date.now()}`,
      userPrompt: 'Tell me about metabolic fitness protocols',
    });

    // 1. Valid tenant read with turns
    const detail = await getConvUseCase.execute({
      tenantId: testTenant,
      conversationId: created.conversationId,
      includeTurns: true,
    });

    expect(detail.id).toBe(created.conversationId);
    expect(detail.tenantId).toBe(testTenant);
    expect(detail.turns).toBeDefined();
    expect(detail.turns?.length).toBe(1);
    expect(detail.turns?.[0]?.clientTurnId).toBe(created.clientTurnId);
    expect(detail.activeTurnId).toBe(created.turnId); // Initial turn is PENDING

    // 2. Cross-tenant read rejected
    await expect(
      getConvUseCase.execute({
        tenantId: testTenantOther,
        conversationId: created.conversationId,
      }),
    ).rejects.toThrow(ConversationNotFoundError);
  });

  it('2. verifies ListConversationsUseCase with deterministic keyset pagination', async () => {
    if (!isDbAvailable) return;

    // Create 2 conversations for user
    await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_list_1_${Date.now()}`,
      userPrompt: 'First conversation topic',
    });

    await new Promise((r) => setTimeout(r, 20));

    await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_list_2_${Date.now()}`,
      userPrompt: 'Second conversation topic',
    });

    // Page 1 with limit = 1
    const page1 = await listConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      limit: 1,
    });

    expect(page1.items).toHaveLength(1);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    // Page 2 using cursor
    const page2 = await listConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      cursor: page1.nextCursor,
      limit: 1,
    });

    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);
  });

  it('3. verifies GetMessageHistoryUseCase retrieves canonical sequence without orphan attempts', async () => {
    if (!isDbAvailable) return;

    const conv = await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_hist_${Date.now()}`,
      userPrompt: 'What are the physiological markers of VO2 max?',
    });

    // Finalize assistant placeholder with content and canonical = true
    await persistMsgUseCase.execute({
      tenantId: testTenant,
      conversationId: conv.conversationId,
      messageId: conv.assistantAttemptId,
      status: GenerationStatus.SUCCESS,
      content: 'VO2 max markers include ventilatory threshold and stroke volume.',
      isCanonical: true,
      completedAt: new Date(),
    });

    // Also mark turn completed so we can test clean history
    await turnRepo.updateStatus(testTenant, conv.conversationId, conv.turnId, {
      status: TurnStatus.COMPLETED,
    });

    const history = await getHistoryUseCase.execute({
      tenantId: testTenant,
      conversationId: conv.conversationId,
      limit: 10,
    });

    expect(history.messages).toHaveLength(2);
    expect(history.messages[0]?.sequenceNumber).toBe(1);
    expect(history.messages[0]?.role).toBe('USER');
    expect(history.messages[1]?.sequenceNumber).toBe(2);
    expect(history.messages[1]?.role).toBe('ASSISTANT');
    expect(history.messages[1]?.isCanonical).toBe(true);
    expect(history.messages[1]?.content).toContain('VO2 max markers');
  });

  it('4. verifies UpdateConversationTitleUseCase persists new title and rejects archived updates', async () => {
    if (!isDbAvailable) return;

    const conv = await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_title_${Date.now()}`,
      userPrompt: 'Original prompt that creates title',
    });

    const updated = await updateTitleUseCase.execute({
      tenantId: testTenant,
      conversationId: conv.conversationId,
      title: 'Renamed Clinical Session',
    });

    expect(updated.conversationId).toBe(conv.conversationId);
    expect(updated.title).toBe('Renamed Clinical Session');

    // Verify in database
    const fetched = await convRepo.findById(testTenant, conv.conversationId);
    expect(fetched?.title.value).toBe('Renamed Clinical Session');
  });

  it('5. verifies ArchiveConversationUseCase enforces no active generation and persists soft delete', async () => {
    if (!isDbAvailable) return;

    const conv = await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_archive_${Date.now()}`,
      userPrompt: 'Conversation to test archive',
    });

    // 1. Turn is initially PENDING; archiving must be rejected
    await expect(
      archiveConvUseCase.execute({
        tenantId: testTenant,
        conversationId: conv.conversationId,
      }),
    ).rejects.toThrow(TurnAlreadyInProgressError);

    // 2. Mark turn completed
    await turnRepo.updateStatus(testTenant, conv.conversationId, conv.turnId, {
      status: TurnStatus.COMPLETED,
    });

    // 3. Archiving should now succeed
    const archived = await archiveConvUseCase.execute({
      tenantId: testTenant,
      conversationId: conv.conversationId,
    });

    expect(archived.isArchived).toBe(true);
    expect(archived.archivedAt).toBeDefined();

    // 4. Subsequent archive attempt must reject with InvalidConversationLifecycleError
    await expect(
      archiveConvUseCase.execute({
        tenantId: testTenant,
        conversationId: conv.conversationId,
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);

    // 5. Updating title on archived conversation must reject
    await expect(
      updateTitleUseCase.execute({
        tenantId: testTenant,
        conversationId: conv.conversationId,
        title: 'New Title On Archived',
      }),
    ).rejects.toThrow(InvalidConversationLifecycleError);
  });

  it('6. verifies PersistMessageStateUseCase enforces USER immutability and canonical invariants', async () => {
    if (!isDbAvailable) return;

    const conv = await createConvUseCase.execute({
      tenantId: testTenant,
      userId: testUserId,
      clientTurnId: `client_persist_${Date.now()}`,
      userPrompt: 'Test message immutability',
    });

    // 1. Attempt to change user message status out of SUCCESS
    await expect(
      persistMsgUseCase.execute({
        tenantId: testTenant,
        conversationId: conv.conversationId,
        messageId: conv.userMessageId,
        status: GenerationStatus.FAILED,
      }),
    ).rejects.toThrow(InvalidMessageOperationError);

    // 2. Attempt to make assistant message canonical when status is STREAMING
    await expect(
      persistMsgUseCase.execute({
        tenantId: testTenant,
        conversationId: conv.conversationId,
        messageId: conv.assistantAttemptId,
        status: GenerationStatus.STREAMING,
        isCanonical: true,
      }),
    ).rejects.toThrow(InvalidMessageOperationError);

    // 3. Valid completion with SUCCESS and canonical = true
    const result = await persistMsgUseCase.execute({
      tenantId: testTenant,
      conversationId: conv.conversationId,
      messageId: conv.assistantAttemptId,
      status: GenerationStatus.SUCCESS,
      content: 'Properly completed content',
      isCanonical: true,
      completedAt: new Date(),
    });

    expect(result.status).toBe(GenerationStatus.SUCCESS);
    expect(result.isCanonical).toBe(true);
  });
});
