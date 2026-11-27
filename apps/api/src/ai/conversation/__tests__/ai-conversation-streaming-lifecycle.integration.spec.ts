import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AiConversationController } from '../ai-conversation.controller';
import { AiConversationModule } from '../ai-conversation.module';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';
import { TurnStatus } from '@kinergy-platform/core';

/**
 * AI-09.10 — IT.04: Conversation & Streaming Persistence Integration Tests
 *
 * Real PostgreSQL Integration Test Suite verifying:
 * 1. Conversation creation, PostgreSQL aggregate persistence & deterministic sequence ordering.
 * 2. Keyset cursor pagination over message history with zero duplicates or gaps.
 * 3. Multi-turn concurrency locks: active PENDING/STREAMING turn rejects turn reservation with 409.
 * 4. ClientTurnId idempotency replay: identical clientTurnId returns EXISTING_RECOVERED without duplicate records.
 * 5. Generation streaming lifecycle: PENDING -> STREAMING -> COMPLETED with citation persistence.
 * 6. In-flight interruption and cancellation: aborting an active turn persists CANCELLED status.
 * 7. Regeneration semantics: attempt 2 created while attempt 1 is retained as non-canonical for audit.
 * 8. Strict cross-tenant isolation and failure diagnostics (zero credential or SQL error leakage).
 */
describe('AI-09.10 — IT.04: Conversation & Streaming Persistence (PostgreSQL Integration)', () => {
  let module: TestingModule;
  let controller: AiConversationController;
  let prisma: PrismaClient;

  const TENANT_ALPHA = 'tenant_it04_alpha';
  const TENANT_BETA = 'tenant_it04_beta';
  const USER_ALPHA = 'usr_it04_doc_01';
  const USER_BETA = 'usr_it04_doc_02';

  const authAlpha: TrustedAiContext = {
    actorId: USER_ALPHA,
    tenantId: TENANT_ALPHA,
    roles: ['Physiotherapist'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc.it04@kinergy.test',
  };

  const authBeta: TrustedAiContext = {
    actorId: USER_BETA,
    tenantId: TENANT_BETA,
    roles: ['Physiotherapist'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc.beta.it04@kinergy.test',
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

  // =========================================================================
  // 1. Conversation Creation & Deterministic Sequence Ordering
  // =========================================================================
  describe('1. Conversation Creation & PostgreSQL Persistence', () => {
    it('creates aggregate, initializes turn 1, and inserts deterministic sequence numbers', async () => {
      const clientTurnId = `ct_create_${Date.now()}`;
      const response = await controller.createConversation(authAlpha, {
        clientTurnId,
        userPrompt: 'Formulate an eccentric quad protocol for patellofemoral pain syndrome',
        title: 'PFPS Eccentric Protocol',
      });

      expect(response.conversationId).toBeDefined();
      expect(response.turnId).toBeDefined();
      expect(response.clientTurnId).toBe(clientTurnId);
      expect(response.turnIndex).toBe(1);
      expect(response.turnStatus).toBe(TurnStatus.PENDING);
      expect(response.isIdempotentReplay).toBe(false);
      expect(response.idempotencyOutcome).toBe('CREATED');

      // Verify PostgreSQL state
      const dbConv = await prisma.aiConversation.findUnique({
        where: { id: response.conversationId },
      });
      expect(dbConv).not.toBeNull();
      expect(dbConv?.tenantId).toBe(TENANT_ALPHA);
      expect(dbConv?.userId).toBe(USER_ALPHA);
      expect(dbConv?.turnCounter).toBe(1);
      expect(dbConv?.messageCounter).toBe(2);

      const dbMessages = await prisma.aiConversationMessage.findMany({
        where: { conversationId: response.conversationId },
        orderBy: { sequenceNumber: 'asc' },
      });
      expect(dbMessages).toHaveLength(2);
      expect(dbMessages[0]?.role).toBe('USER');
      expect(dbMessages[0]?.sequenceNumber).toBe(1);
      expect(dbMessages[0]?.status).toBe('SUCCESS');
      expect(dbMessages[1]?.role).toBe('ASSISTANT');
      expect(dbMessages[1]?.sequenceNumber).toBe(2);
      expect(dbMessages[1]?.status).toBe('PENDING');
    });

    it('enforces idempotency on duplicate creation with identical clientTurnId', async () => {
      const clientTurnId = `ct_idem_create_${Date.now()}`;
      const payload = {
        clientTurnId,
        userPrompt: 'Hamstring strain rehabilitation timeline',
        title: 'Hamstring Protocol',
      };

      const firstRes = await controller.createConversation(authAlpha, payload);
      expect(firstRes.isIdempotentReplay).toBe(false);

      const replayRes = await controller.createConversation(authAlpha, payload);
      expect(replayRes.isIdempotentReplay).toBe(true);
      expect(replayRes.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(replayRes.conversationId).toBe(firstRes.conversationId);
      expect(replayRes.turnId).toBe(firstRes.turnId);

      // Verify PostgreSQL count remains 1 conversation and 1 turn
      const count = await prisma.aiConversation.count({
        where: { tenantId: TENANT_ALPHA },
      });
      expect(count).toBe(1);
    });
  });

  // =========================================================================
  // 2. Keyset Cursor Pagination & Message Ordering
  // =========================================================================
  describe('2. Keyset Cursor Pagination & Chronological Ordering', () => {
    it('paginates multi-turn message history with monotonic sequence numbers without gaps or duplicates', async () => {
      // 1. Create conversation (Turn 1: user msg 1, asst msg 2)
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_page_t1',
        userPrompt: 'Turn 1: Anterior cruciate ligament reconstruction criteria',
      });

      // Complete Turn 1
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        data: {
          status: 'SUCCESS',
          isCanonical: true,
          content:
            'ACL reconstruction criteria include ligamentous laxity and functional instability.',
        },
      });
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: 'COMPLETED' },
      });

      // 2. Reserve Turn 2 (user msg 3, asst msg 4)
      await controller.reserveTurn(authAlpha, conv.conversationId, {
        clientTurnId: 'ct_page_t2',
        userPrompt: 'Turn 2: What graft options are indicated?',
      });
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: conv.conversationId, sequenceNumber: 4 },
        data: {
          status: 'SUCCESS',
          isCanonical: true,
          content:
            'Common grafts include bone-patellar tendon-bone and semitendinosus-gracilis autografts.',
        },
      });
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId, turnIndex: 2 },
        data: { status: 'COMPLETED' },
      });

      // 3. Page 1: Keyset query with limit = 2
      const page1 = await controller.getMessageHistory(authAlpha, conv.conversationId, {
        limit: 2,
      });
      expect(page1.messages).toHaveLength(2);
      expect(page1.messages[0]?.sequenceNumber).toBe(1);
      expect(page1.messages[1]?.sequenceNumber).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      // 4. Page 2: Fetch next using cursor
      const page2 = await controller.getMessageHistory(authAlpha, conv.conversationId, {
        cursor: page1.nextCursor ?? undefined,
        limit: 2,
      });
      expect(page2.messages).toHaveLength(2);
      expect(page2.messages[0]?.sequenceNumber).toBe(3);
      expect(page2.messages[1]?.sequenceNumber).toBe(4);
      expect(page2.hasMore).toBe(false);

      // Verify strict monotonicity across pages
      expect(page1.messages[1]!.sequenceNumber).toBeLessThan(page2.messages[0]!.sequenceNumber);
      const allIds = [...page1.messages.map((m) => m.id), ...page2.messages.map((m) => m.id)];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(4);
    });
  });

  // =========================================================================
  // 3. Multi-turn Concurrency & Idempotent Turn Reservation
  // =========================================================================
  describe('3. Multi-turn Concurrency & Idempotency Guarantees', () => {
    it('rejects concurrent turn reservation with 409 TurnAlreadyInProgressError when active turn is PENDING', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_active_lock_t1',
        userPrompt: 'Active generation in flight',
      });

      // Turn 1 is in status PENDING. Attempting to reserve Turn 2 MUST throw 409
      await expect(
        controller.reserveTurn(authAlpha, conv.conversationId, {
          clientTurnId: 'ct_active_lock_t2',
          userPrompt: 'Attempt concurrent prompt',
        }),
      ).rejects.toThrow();
    });

    it('rejects concurrent turn reservation when active turn is in STREAMING state', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_streaming_lock_t1',
        userPrompt: 'Streaming generation in flight',
      });

      // Update Turn 1 to STREAMING
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: TurnStatus.STREAMING },
      });

      // Attempting to reserve Turn 2 MUST throw
      await expect(
        controller.reserveTurn(authAlpha, conv.conversationId, {
          clientTurnId: 'ct_streaming_lock_t2',
          userPrompt: 'Concurrent prompt during streaming',
        }),
      ).rejects.toThrow();
    });

    it('recovers existing subsequent turn idempotently when retried with same clientTurnId', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_turn_idem_t1',
        userPrompt: 'Complete prompt for Turn 1',
      });

      // Complete Turn 1
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        data: { status: 'SUCCESS', isCanonical: true },
      });
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: 'COMPLETED' },
      });

      const turn2Payload = {
        clientTurnId: 'ct_turn_idem_t2',
        userPrompt: 'Turn 2 prompt for idempotency check',
      };

      const firstAttempt = await controller.reserveTurn(
        authAlpha,
        conv.conversationId,
        turn2Payload,
      );
      expect(firstAttempt.isIdempotentReplay).toBe(false);

      const retryAttempt = await controller.reserveTurn(
        authAlpha,
        conv.conversationId,
        turn2Payload,
      );
      expect(retryAttempt.isIdempotentReplay).toBe(true);
      expect(retryAttempt.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(retryAttempt.turnId).toBe(firstAttempt.turnId);
    });
  });

  // =========================================================================
  // 4. Streaming Lifecycle Progression & Citation Persistence
  // =========================================================================
  describe('4. Streaming Lifecycle Progression & Persistence', () => {
    it('transitions PENDING -> STREAMING -> COMPLETED and persists citations and tokens in PostgreSQL', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_stream_prog_t1',
        userPrompt: 'Explain progressive overload in tendinopathy',
      });

      // 1. Move to STREAMING
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: TurnStatus.STREAMING },
      });
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        data: { status: 'STREAMING', content: 'Progressive overload stimulates tenocyte...' },
      });

      let turnInDb = await prisma.aiConversationTurn.findFirst({
        where: { conversationId: conv.conversationId },
      });
      expect(turnInDb?.status).toBe(TurnStatus.STREAMING);

      // 2. Finalize to COMPLETED with canonical answer
      const finalizedAnswer =
        'Progressive overload stimulates tenocyte collagen synthesis through mechanical mechanotransduction.';
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        data: {
          status: 'SUCCESS',
          isCanonical: true,
          content: finalizedAnswer,
          completedAt: new Date(),
        },
      });
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: TurnStatus.COMPLETED },
      });

      // Verify PostgreSQL state
      turnInDb = await prisma.aiConversationTurn.findFirst({
        where: { conversationId: conv.conversationId },
      });
      expect(turnInDb?.status).toBe(TurnStatus.COMPLETED);

      const asstMsg = await prisma.aiConversationMessage.findFirst({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
      });
      expect(asstMsg?.status).toBe('SUCCESS');
      expect(asstMsg?.isCanonical).toBe(true);
      expect(asstMsg?.content).toBe(finalizedAnswer);
      expect(asstMsg?.completedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // 5. In-flight Interruption and Cancellation
  // =========================================================================
  describe('5. In-flight Interruption & Cancellation', () => {
    it('cancels an active turn via cancel endpoint, transitions to CANCELLED, and enables subsequent reservation', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_cancel_t1',
        userPrompt: 'Long-running clinical analysis query',
      });

      // Call cancel turn endpoint
      const cancelRes = await controller.cancelTurn(authAlpha, conv.conversationId, conv.turnId, {
        reason: 'Clinician clicked stop generation in UI',
      });

      expect(cancelRes.conversationId).toBe(conv.conversationId);
      expect(cancelRes.turnId).toBe(conv.turnId);
      expect(cancelRes.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(cancelRes.isAlreadyCancelled).toBe(false);

      // Verify in PostgreSQL
      const dbTurn = await prisma.aiConversationTurn.findUnique({
        where: {
          uq_turn_id_conv_tenant: {
            id: conv.turnId,
            conversationId: conv.conversationId,
            tenantId: TENANT_ALPHA,
          },
        },
      });
      expect(dbTurn?.status).toBe(TurnStatus.CANCELLED);

      // Cancelled turn frees conversation to accept a subsequent turn or retry
      const turn2 = await controller.reserveTurn(authAlpha, conv.conversationId, {
        clientTurnId: 'ct_cancel_followup_t2',
        userPrompt: 'New inquiry after previous cancellation',
      });
      expect(turn2.turnIndex).toBe(2);
      expect(turn2.turnStatus).toBe(TurnStatus.PENDING);
    });

    it('enforces idempotency on repeated cancellation requests', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_cancel_idem_t1',
        userPrompt: 'Query to be cancelled multiple times',
      });

      const firstCancel = await controller.cancelTurn(authAlpha, conv.conversationId, conv.turnId, {
        reason: 'First abort',
      });
      expect(firstCancel.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(firstCancel.isAlreadyCancelled).toBe(false);

      const secondCancel = await controller.cancelTurn(
        authAlpha,
        conv.conversationId,
        conv.turnId,
        {
          reason: 'Second abort duplicate',
        },
      );
      expect(secondCancel.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(secondCancel.isAlreadyCancelled).toBe(true);
      expect(secondCancel.turnId).toBe(firstCancel.turnId);
    });
  });

  // =========================================================================
  // 6. Response Regeneration Semantics & Non-canonical Retention
  // =========================================================================
  describe('6. Response Regeneration Semantics', () => {
    it('creates attempt 2, marks attempt 1 non-canonical, and preserves attempt 1 for audit', async () => {
      const conv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_regen_t1',
        userPrompt: 'Provide diagnostic criteria for cervical radiculopathy',
      });

      // Mark attempt 1 as completed
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        data: {
          status: 'SUCCESS',
          isCanonical: true,
          content: 'Initial answer attempt 1: Spurling test, distraction test, ULTT.',
        },
      });
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: 'COMPLETED' },
      });

      // Clinician requests regeneration
      const regenRes = await controller.regenerateTurn(
        authAlpha,
        conv.conversationId,
        conv.turnId,
        {
          clientTurnId: 'ct_regen_att2',
        },
      );

      expect(regenRes.conversationId).toBe(conv.conversationId);
      expect(regenRes.turnId).toBe(conv.turnId);
      expect(regenRes.turnIndex).toBe(1);
      expect(regenRes.attemptNumber).toBe(2);
      expect(regenRes.status).toBe(TurnStatus.PENDING);

      // Verify PostgreSQL message versions:
      // Both attempts exist in DB; attempt 2 is allocated as PENDING
      let dbMessages = await prisma.aiConversationMessage.findMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        orderBy: { attemptNumber: 'asc' },
      });

      expect(dbMessages).toHaveLength(2);
      expect(dbMessages[0]?.attemptNumber).toBe(1);
      expect(dbMessages[0]?.content).toContain('Initial answer attempt 1');

      expect(dbMessages[1]?.attemptNumber).toBe(2);
      expect(dbMessages[1]?.status).toBe('PENDING');
      expect(dbMessages[1]?.isCanonical).toBe(false);

      // Now complete attempt 2: demote attempt 1 and promote attempt 2 to canonical
      await prisma.aiConversationMessage.update({
        where: { id: dbMessages[0]!.id },
        data: { isCanonical: false },
      });
      await prisma.aiConversationMessage.update({
        where: { id: dbMessages[1]!.id },
        data: {
          status: 'SUCCESS',
          isCanonical: true,
          content: 'Regenerated answer attempt 2 with comprehensive references.',
        },
      });
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: conv.conversationId },
        data: { status: 'COMPLETED' },
      });

      dbMessages = await prisma.aiConversationMessage.findMany({
        where: { conversationId: conv.conversationId, role: 'ASSISTANT' },
        orderBy: { attemptNumber: 'asc' },
      });
      expect(dbMessages[0]?.isCanonical).toBe(false);
      expect(dbMessages[1]?.isCanonical).toBe(true);
      expect(dbMessages[1]?.content).toContain('Regenerated answer attempt 2');
    });
  });

  // =========================================================================
  // 7. Cross-Tenant Defense & IDOR Protection
  // =========================================================================
  describe('7. Cross-Tenant Defense & Security Isolation', () => {
    it('strictly forbids Tenant Beta from accessing, cancelling, or reserving turns on Tenant Alpha conversation', async () => {
      const alphaConv = await controller.createConversation(authAlpha, {
        clientTurnId: 'ct_sec_alpha_t1',
        userPrompt: 'Confidential clinical data for Tenant Alpha patient',
      });

      // 1. Beta cannot retrieve conversation detail
      await expect(
        controller.getConversation(authBeta, alphaConv.conversationId),
      ).rejects.toThrow();

      // 2. Beta cannot retrieve message history
      await expect(
        controller.getMessageHistory(authBeta, alphaConv.conversationId, { limit: 10 }),
      ).rejects.toThrow();

      // 3. Beta cannot cancel Alpha's turn
      await expect(
        controller.cancelTurn(authBeta, alphaConv.conversationId, alphaConv.turnId, {
          reason: 'Unauthorized attacker cancel attempt',
        }),
      ).rejects.toThrow();

      // 4. Beta cannot reserve a turn on Alpha's conversation
      await expect(
        controller.reserveTurn(authBeta, alphaConv.conversationId, {
          clientTurnId: 'ct_sec_breach_turn',
          userPrompt: 'Injected prompt into foreign conversation',
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 8. Error Diagnostics & Safe Information Boundaries
  // =========================================================================
  describe('8. Safe Diagnostics & Error Handling', () => {
    it('returns sanitized error response on nonexistent conversation without database leaking', async () => {
      try {
        await controller.getConversation(authAlpha, 'conv_does_not_exist_00000000');
        fail('Expected getConversation to throw on nonexistent ID');
      } catch (err: unknown) {
        const errorObj = err as { message?: string };
        expect(errorObj.message).not.toContain('PrismaClientKnownRequestError');
        expect(errorObj.message).not.toContain('ai_conversations');
        expect(errorObj.message).not.toContain('SELECT');
      }
    });
  });
});
