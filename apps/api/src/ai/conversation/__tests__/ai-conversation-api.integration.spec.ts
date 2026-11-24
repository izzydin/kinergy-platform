import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AiConversationController } from '../ai-conversation.controller';
import { AiConversationModule } from '../ai-conversation.module';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';
import { TurnStatus } from '@kinergy-platform/core';

/**
 * AI-09.3-BE.05.03 — Conversation REST API PostgreSQL Integration Tests
 *
 * Verifies end-to-end REST controller dispatch through actual PostgreSQL persistence,
 * relational constraints, idempotency guarantees, and tenant isolation.
 */
describe('AI-09.3-BE.05.03: Conversation REST Controller (PostgreSQL Integration)', () => {
  let module: TestingModule;
  let controller: AiConversationController;
  let prisma: PrismaClient;

  const TENANT_ALPHA = 'tenant_int_alpha';
  const TENANT_BETA = 'tenant_int_beta';
  const USER_ALPHA = 'usr_int_doc_01';
  const USER_BETA = 'usr_int_doc_02';

  const authAlpha: TrustedAiContext = {
    actorId: USER_ALPHA,
    tenantId: TENANT_ALPHA,
    roles: ['Doctor'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc.alpha@kinergy.test',
  };

  const authAlphaOwner: TrustedAiContext = {
    actorId: 'usr_int_owner_01',
    tenantId: TENANT_ALPHA,
    roles: ['Owner'],
    permissions: ['ai.conversations.audit'],
    email: 'owner.alpha@kinergy.test',
  };

  const authBeta: TrustedAiContext = {
    actorId: USER_BETA,
    tenantId: TENANT_BETA,
    roles: ['Doctor'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc.beta@kinergy.test',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    module = await Test.createTestingModule({
      imports: [AiConversationModule],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiConversationController>(AiConversationController);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$disconnect();
    await module.close();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
  });

  it('1. POST / creates a conversation aggregate, initial turn, and messages in PostgreSQL', async () => {
    const clientTurnId = 'turn_pg_test_001';
    const response = await controller.createConversation(authAlpha, {
      clientTurnId,
      userPrompt: 'Formulate an ACL rehabilitation plan for stage 3',
      title: 'ACL Stage 3 Rehabilitation',
      metadata: { clinicalTrial: true },
    });

    expect(response.conversationId).toBeDefined();
    expect(response.turnId).toBeDefined();
    expect(response.clientTurnId).toBe(clientTurnId);
    expect(response.turnIndex).toBe(1);
    expect(response.turnStatus).toBe(TurnStatus.PENDING);
    expect(response.isIdempotentReplay).toBe(false);
    expect(response.idempotencyOutcome).toBe('CREATED');

    // Authoritative check in PostgreSQL
    const dbConv = await prisma.aiConversation.findUnique({
      where: { id: response.conversationId },
    });
    expect(dbConv).not.toBeNull();
    expect(dbConv?.tenantId).toBe(TENANT_ALPHA);
    expect(dbConv?.userId).toBe(USER_ALPHA);
    expect(dbConv?.turnCounter).toBe(1);
    expect(dbConv?.messageCounter).toBe(2);

    const dbTurns = await prisma.aiConversationTurn.findMany({
      where: { conversationId: response.conversationId },
    });
    expect(dbTurns).toHaveLength(1);
    expect(dbTurns[0]?.clientTurnId).toBe(clientTurnId);
    expect(dbTurns[0]?.turnIndex).toBe(1);

    const dbMessages = await prisma.aiConversationMessage.findMany({
      where: { conversationId: response.conversationId },
    });
    expect(dbMessages).toHaveLength(2);
  });

  it('2. POST / handles idempotent retry recovering the exact same conversation and turn', async () => {
    const clientTurnId = 'turn_pg_test_idempotent';
    const payload = {
      clientTurnId,
      userPrompt: 'Explain cardiac autonomic modulation during recovery',
      title: 'Cardiac Autonomic Modulation',
    };

    // First request
    const firstRes = await controller.createConversation(authAlpha, payload);
    expect(firstRes.isIdempotentReplay).toBe(false);
    expect(firstRes.idempotencyOutcome).toBe('CREATED');

    // Duplicate request with identical payload
    const secondRes = await controller.createConversation(authAlpha, payload);
    expect(secondRes.isIdempotentReplay).toBe(true);
    expect(secondRes.idempotencyOutcome).toBe('EXISTING_RECOVERED');
    expect(secondRes.conversationId).toBe(firstRes.conversationId);
    expect(secondRes.turnId).toBe(firstRes.turnId);

    // Verify in PostgreSQL that no duplicate turn or conversation was inserted
    const convCount = await prisma.aiConversation.count({
      where: { tenantId: TENANT_ALPHA },
    });
    expect(convCount).toBe(1);

    const turnCount = await prisma.aiConversationTurn.count({
      where: { tenantId: TENANT_ALPHA },
    });
    expect(turnCount).toBe(1);
  });

  it('3. GET / lists conversations scoped to authenticated tenant and user', async () => {
    // Create 2 conversations in Tenant Alpha
    await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_list_01',
      userPrompt: 'Protocol Alpha 1',
      title: 'Alpha Protocol 1',
    });
    await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_list_02',
      userPrompt: 'Protocol Alpha 2',
      title: 'Alpha Protocol 2',
    });

    // Create 1 conversation in Tenant Beta
    await controller.createConversation(authBeta, {
      clientTurnId: 'turn_list_beta_01',
      userPrompt: 'Protocol Beta 1',
      title: 'Beta Protocol 1',
    });

    const listAlpha = await controller.listConversations(authAlpha, { limit: 10 });
    expect(listAlpha.items).toHaveLength(2);
    expect(listAlpha.items.every((i) => i.title.startsWith('Alpha'))).toBe(true);

    const listBeta = await controller.listConversations(authBeta, { limit: 10 });
    expect(listBeta.items).toHaveLength(1);
    expect(listBeta.items[0]?.title).toBe('Beta Protocol 1');
  });

  it('4. GET /:id retrieves conversation and enforces tenant isolation', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_iso_01',
      userPrompt: 'Confidential clinical query',
      title: 'Confidential Session',
    });

    // Tenant Alpha can retrieve its own conversation
    const detailAlpha = await controller.getConversation(authAlpha, created.conversationId);
    expect(detailAlpha.id).toBe(created.conversationId);
    expect(detailAlpha.turns).toHaveLength(1);

    // Tenant Beta attempting to retrieve Alpha's conversation MUST be rejected
    await expect(controller.getConversation(authBeta, created.conversationId)).rejects.toThrow();
  });

  it('5. PATCH /:id/title updates conversation title in PostgreSQL', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_title_01',
      userPrompt: 'Initial prompt',
      title: 'Original Title',
    });

    const updated = await controller.updateTitle(authAlpha, created.conversationId, {
      title: 'Updated Clinical Plan Title',
    });

    expect(updated.title).toBe('Updated Clinical Plan Title');

    // Verify in PostgreSQL
    const dbConv = await prisma.aiConversation.findUnique({
      where: { id: created.conversationId },
    });
    expect(dbConv?.title).toBe('Updated Clinical Plan Title');
  });

  it('6. DELETE /:id archives conversation safely in PostgreSQL', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_archive_01',
      userPrompt: 'Archivable prompt',
      title: 'To Be Archived',
    });

    // In BE.04 / BE.05, turn 1 is initialized in status PENDING.
    // An active generation prevents archiving, so let's mark the turn assistant message completed
    // so the conversation is safely archivable:
    await prisma.aiConversationMessage.updateMany({
      where: { conversationId: created.conversationId },
      data: { status: 'SUCCESS' },
    });
    await prisma.aiConversationTurn.updateMany({
      where: { conversationId: created.conversationId },
      data: { status: 'COMPLETED' },
    });

    const archiveRes = await controller.archiveConversation(authAlpha, created.conversationId);
    expect(archiveRes.isArchived).toBe(true);

    // Verify in PostgreSQL (soft-deleted via deletedAt)
    const dbConv = await prisma.aiConversation.findUnique({
      where: { id: created.conversationId },
    });
    expect(dbConv?.deletedAt).not.toBeNull();
  });

  it('7. POST /:id/turns reserves a subsequent turn and messages in PostgreSQL', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_pg_t1',
      userPrompt: 'Turn 1 prompt',
      title: 'Multiturn Protocol',
    });

    // Mark Turn 1 assistant message as SUCCESS so conversation can accept Turn 2
    await prisma.aiConversationMessage.updateMany({
      where: { conversationId: created.conversationId, role: 'ASSISTANT' },
      data: { status: 'SUCCESS', isCanonical: true },
    });
    await prisma.aiConversationTurn.updateMany({
      where: { conversationId: created.conversationId },
      data: { status: 'COMPLETED' },
    });

    const turn2 = await controller.reserveTurn(authAlpha, created.conversationId, {
      clientTurnId: 'turn_pg_t2',
      userPrompt: 'Turn 2 follow-up question',
    });

    expect(turn2.conversationId).toBe(created.conversationId);
    expect(turn2.turnIndex).toBe(2);
    expect(turn2.clientTurnId).toBe('turn_pg_t2');
    expect(turn2.turnStatus).toBe(TurnStatus.PENDING);
    expect(turn2.isIdempotentReplay).toBe(false);

    // Verify in PostgreSQL
    const turns = await prisma.aiConversationTurn.findMany({
      where: { conversationId: created.conversationId },
      orderBy: { turnIndex: 'asc' },
    });
    expect(turns).toHaveLength(2);
    expect(turns[1]?.turnIndex).toBe(2);
    expect(turns[1]?.clientTurnId).toBe('turn_pg_t2');

    const messages = await prisma.aiConversationMessage.findMany({
      where: { conversationId: created.conversationId },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(messages).toHaveLength(4); // Turn 1 (user, asst) + Turn 2 (user, asst)
    expect(messages[2]?.sequenceNumber).toBe(3);
    expect(messages[3]?.sequenceNumber).toBe(4);
  });

  it('8. POST /:id/turns recovers existing subsequent turn idempotently', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_idem_t1',
      userPrompt: 'Turn 1 prompt',
    });

    await prisma.aiConversationMessage.updateMany({
      where: { conversationId: created.conversationId, role: 'ASSISTANT' },
      data: { status: 'SUCCESS', isCanonical: true },
    });
    await prisma.aiConversationTurn.updateMany({
      where: { conversationId: created.conversationId },
      data: { status: 'COMPLETED' },
    });

    const turn2Payload = {
      clientTurnId: 'turn_idem_t2',
      userPrompt: 'Turn 2 prompt for idempotency check',
    };

    const first = await controller.reserveTurn(authAlpha, created.conversationId, turn2Payload);
    expect(first.isIdempotentReplay).toBe(false);

    const retry = await controller.reserveTurn(authAlpha, created.conversationId, turn2Payload);
    expect(retry.isIdempotentReplay).toBe(true);
    expect(retry.idempotencyOutcome).toBe('EXISTING_RECOVERED');
    expect(retry.turnId).toBe(first.turnId);

    // Verify count in database remained 2
    const turnCount = await prisma.aiConversationTurn.count({
      where: { conversationId: created.conversationId },
    });
    expect(turnCount).toBe(2);
  });

  it('9. POST /:id/turns rejects concurrent generation when an active turn exists', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_active_t1',
      userPrompt: 'Turn 1 prompt',
    });

    // Turn 1 is still PENDING (assistant generation in progress).
    // Attempting to reserve Turn 2 MUST be rejected with 409 TurnAlreadyInProgressError
    await expect(
      controller.reserveTurn(authAlpha, created.conversationId, {
        clientTurnId: 'turn_active_t2',
        userPrompt: 'Turn 2 prompt while Turn 1 active',
      }),
    ).rejects.toThrow();
  });

  it('10. GET /:id/messages returns message history ordered by sequenceNumber ASC', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_hist_t1',
      userPrompt: 'What is eccentric hypertrophy?',
    });

    // 1. Prior to assistant completion, only the canonical USER message is in history
    const initialHistory = await controller.getMessageHistory(authAlpha, created.conversationId, {
      limit: 10,
    });
    expect(initialHistory.messages).toHaveLength(1);
    expect(initialHistory.messages[0]?.sequenceNumber).toBe(1);
    expect(initialHistory.messages[0]?.role).toBe('USER');
    expect(initialHistory.messages[0]?.content).toBe('What is eccentric hypertrophy?');

    // 2. Complete assistant generation and mark canonical
    await prisma.aiConversationMessage.updateMany({
      where: { conversationId: created.conversationId, role: 'ASSISTANT' },
      data: {
        status: 'SUCCESS',
        isCanonical: true,
        content: 'Eccentric hypertrophy involves longitudinal addition of sarcomeres.',
      },
    });

    // 3. Keyset Pagination: Page 1 with limit: 1 returns only first message and nextCursor
    const page1 = await controller.getMessageHistory(authAlpha, created.conversationId, {
      limit: 1,
    });
    expect(page1.messages).toHaveLength(1);
    expect(page1.messages[0]?.sequenceNumber).toBe(1);
    expect(page1.messages[0]?.role).toBe('USER');
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    // 4. Keyset Pagination: Page 2 using nextCursor returns second message
    const page2 = await controller.getMessageHistory(authAlpha, created.conversationId, {
      cursor: page1.nextCursor ?? undefined,
      limit: 1,
    });
    expect(page2.messages).toHaveLength(1);
    expect(page2.messages[0]?.sequenceNumber).toBe(2);
    expect(page2.messages[0]?.role).toBe('ASSISTANT');
    expect(page2.hasMore).toBe(false);

    // 5. Verify no duplicates between pages and stable monotonic sequence order
    expect(page1.messages[0]?.id).not.toBe(page2.messages[0]?.id);
    expect(page1.messages[0]!.sequenceNumber).toBeLessThan(page2.messages[0]!.sequenceNumber);
  });

  it('11. POST /:id/audit-inspect allows Owner to inspect conversation and persists audit log in PostgreSQL', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_audit_t1',
      userPrompt: 'Confidential patient clinical query',
    });

    const auditResponse = await controller.auditInspect(authAlphaOwner, created.conversationId, {
      reason: 'Mandatory clinical audit for clinical protocol verification #1049',
    });

    expect(auditResponse.auditLogId).toBeDefined();
    expect(auditResponse.conversation.id).toBe(created.conversationId);
    expect(auditResponse.conversation.title).toBe('Confidential patient clinical query');
    expect(auditResponse.messages.length).toBeGreaterThanOrEqual(1);

    // Verify persistence directly in PostgreSQL
    const auditRecord = await prisma.aiConversationAuditLog.findUnique({
      where: { id: auditResponse.auditLogId },
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.tenantId).toBe(TENANT_ALPHA);
    expect(auditRecord?.conversationId).toBe(created.conversationId);
    expect(auditRecord?.inspectorUserId).toBe(authAlphaOwner.actorId);
    expect(auditRecord?.inspectorRole).toBe('Owner');
    expect(auditRecord?.action).toBe('PRIVILEGED_CONVERSATION_INSPECTED');
    expect(auditRecord?.reason).toBe(
      'Mandatory clinical audit for clinical protocol verification #1049',
    );
  });

  it('12. POST /:id/audit-inspect rejects non-Owner role with 403 and writes ZERO audit logs', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_audit_rej_t1',
      userPrompt: 'Query for rejection test',
    });

    // authAlpha has role 'Doctor', not 'Owner'
    await expect(
      controller.auditInspect(authAlpha, created.conversationId, {
        reason: 'Doctor trying to perform privileged inspection',
      }),
    ).rejects.toThrow();

    // Verify zero audit logs were created
    const auditCount = await prisma.aiConversationAuditLog.count({
      where: { conversationId: created.conversationId },
    });
    expect(auditCount).toBe(0);
  });

  it('13. Cross-tenant defense: Tenant Beta cannot access or mutate Tenant Alpha conversation (returns 404)', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_cross_t1',
      userPrompt: 'Data belonging exclusively to Tenant Alpha',
    });

    // Tenant Beta attempting GET
    await expect(controller.getConversation(authBeta, created.conversationId)).rejects.toThrow();

    // Tenant Beta attempting turn reservation
    await expect(
      controller.reserveTurn(authBeta, created.conversationId, {
        clientTurnId: 'turn_cross_beta_1',
        userPrompt: 'Intrusion turn attempt',
      }),
    ).rejects.toThrow();

    // Tenant Beta attempting message history retrieval
    await expect(
      controller.getMessageHistory(authBeta, created.conversationId, { limit: 10 }),
    ).rejects.toThrow();

    // Tenant Beta attempting privileged inspection
    const authBetaOwner: TrustedAiContext = {
      actorId: 'usr_beta_owner',
      tenantId: TENANT_BETA,
      roles: ['Owner'],
      permissions: ['ai.conversations.audit'],
      email: 'owner@beta.test',
    };
    await expect(
      controller.auditInspect(authBetaOwner, created.conversationId, {
        reason: 'Cross-tenant privileged inspection probe',
      }),
    ).rejects.toThrow();
  });

  it('14. Cancel turn endpoint: successfully cancels a turn and enforces idempotency', async () => {
    const created = await controller.createConversation(authAlpha, {
      clientTurnId: 'turn_cancel_api_1',
      userPrompt: 'Cancelable query prompt',
    });

    // 1. Cancel turn
    const cancelResult = await controller.cancelTurn(
      authAlpha,
      created.conversationId,
      created.turnId,
      { reason: 'User cancellation request' },
    );

    expect(cancelResult.conversationId).toBe(created.conversationId);
    expect(cancelResult.turnId).toBe(created.turnId);
    expect(cancelResult.turnStatus).toBe(TurnStatus.CANCELLED);
    expect(cancelResult.isAlreadyCancelled).toBe(false);

    // 2. Repeat cancel (idempotent)
    const repeatCancel = await controller.cancelTurn(
      authAlpha,
      created.conversationId,
      created.turnId,
    );
    expect(repeatCancel.turnStatus).toBe(TurnStatus.CANCELLED);
    expect(repeatCancel.isAlreadyCancelled).toBe(true);
  });
});
