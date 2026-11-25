import { PrismaClient, FeedbackRating as PrismaFeedbackRating } from '@prisma/client';
import {
  SubmitMessageFeedbackUseCase,
  GetMessageFeedbackUseCase,
  RevokeMessageFeedbackUseCase,
  AiMessageFeedback,
  FeedbackRating,
  FeedbackTargetNotAssistantMessageError,
  MessageNotBelongingToConversationError,
  ConversationNotFoundError,
  TenantOwnershipViolationError,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiMessageFeedbackRepository,
} from '@kinergy-platform/core/server';
import { AiConversationController } from '../conversation/ai-conversation.controller';
import { SubmitFeedbackRequestDto } from '../conversation/dtos/ai-conversation.dtos';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';

/**
 * AI-09.5 - FB.02: Feedback Domain Model & Backend Persistence Integration Test Suite
 *
 * Verifies on live PostgreSQL:
 * 1. PrismaAiMessageFeedbackRepository persistence, idempotency, and cascading constraints.
 * 2. SubmitMessageFeedbackUseCase, GetMessageFeedbackUseCase, RevokeMessageFeedbackUseCase invariants.
 * 3. AiConversationController feedback endpoints and error filtering.
 */
describe('AI Message Feedback Persistence & Integration (AI-09.5 - FB.02)', () => {
  let prisma: PrismaClient;

  let convRepo: PrismaAiConversationRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let feedbackRepo: PrismaAiMessageFeedbackRepository;

  let submitUseCase: SubmitMessageFeedbackUseCase;
  let getUseCase: GetMessageFeedbackUseCase;
  let revokeUseCase: RevokeMessageFeedbackUseCase;

  let controller: AiConversationController;

  const TENANT_ID = 'tenant_fb02_test';
  const OTHER_TENANT_ID = 'tenant_fb02_intruder';
  const USER_A = 'usr_fb02_physio_a';
  const USER_B = 'usr_fb02_physio_b';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    feedbackRepo = new PrismaAiMessageFeedbackRepository(prisma);

    submitUseCase = new SubmitMessageFeedbackUseCase(convRepo, messageRepo, feedbackRepo);
    getUseCase = new GetMessageFeedbackUseCase(convRepo, messageRepo, feedbackRepo);
    revokeUseCase = new RevokeMessageFeedbackUseCase(convRepo, messageRepo, feedbackRepo);

    // Instantiate controller with feedback use cases
    controller = new AiConversationController(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      submitUseCase,
      getUseCase,
      revokeUseCase,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_message_feedback" WHERE "tenant_id" IN ('${TENANT_ID}', '${OTHER_TENANT_ID}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ID}', '${OTHER_TENANT_ID}')`,
    );
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_message_feedback" WHERE "tenant_id" IN ('${TENANT_ID}', '${OTHER_TENANT_ID}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ID}', '${OTHER_TENANT_ID}')`,
    );
  });

  async function seedConversationFixture(opts: {
    convId: string;
    turnId: string;
    userMsgId: string;
    asstMsgId: string;
    tenantId?: string;
    userId?: string;
  }) {
    const tenantId = opts.tenantId ?? TENANT_ID;
    const userId = opts.userId ?? USER_A;
    const now = new Date();

    await prisma.aiConversation.create({
      data: {
        id: opts.convId,
        tenantId,
        userId,
        title: 'Feedback Test Conversation',
        turnCounter: 1,
        messageCounter: 2,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationTurn.create({
      data: {
        id: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        turnIndex: 1,
        status: 'COMPLETED',
        clientTurnId: `client-${opts.turnId}`,
        idempotencyKey: `${opts.convId}_1`,
        idempotencyPayloadHash: 'hash_1',
        activeAttemptId: null,
        activeAttemptNumber: 1,
        createdAt: now,
        completedAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationMessage.create({
      data: {
        id: opts.userMsgId,
        turnId: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        role: 'USER',
        sequenceNumber: 1,
        attemptNumber: 1,
        status: 'SUCCESS',
        isCanonical: false,
        content: '¿Cuáles son las pautas para desgarro de menisco?',
        createdAt: now,
        completedAt: now,
        updatedAt: now,
      },
    });

    await prisma.aiConversationMessage.create({
      data: {
        id: opts.asstMsgId,
        turnId: opts.turnId,
        conversationId: opts.convId,
        tenantId,
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        status: 'SUCCESS',
        isCanonical: true,
        content: 'El tratamiento inicial se basa en crioterapia intermitente y reposo relativo.',
        createdAt: now,
        completedAt: now,
        updatedAt: now,
      },
    });
  }

  describe('1. PrismaAiMessageFeedbackRepository (PostgreSQL)', () => {
    it('persists a new feedback record and handles idempotent upsert on duplicate submission', async () => {
      const convId = 'conv_repo_01';
      const turnId = 'turn_repo_01';
      const userMsgId = 'msg_u_01';
      const asstMsgId = 'msg_a_01';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId });

      const feedback = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        userId: USER_A,
        rating: FeedbackRating.POSITIVE,
        explanation: 'Excelente recomendación clínica.',
        category: 'ACCURACY',
      });

      // 1. Initial save
      const saved = await feedbackRepo.save(feedback);
      expect(saved.id.value).toBe(feedback.id.value);
      expect(saved.rating).toBe(FeedbackRating.POSITIVE);
      expect(saved.explanation).toBe('Excelente recomendación clínica.');

      // Verify physical persistence in PostgreSQL
      const persisted = await prisma.aiMessageFeedback.findUnique({
        where: {
          uq_message_user_feedback: {
            messageId: asstMsgId,
            userId: USER_A,
          },
        },
      });
      expect(persisted).toBeDefined();
      expect(persisted!.rating).toBe(PrismaFeedbackRating.POSITIVE);
      expect(persisted!.explanation).toBe('Excelente recomendación clínica.');

      // 2. Idempotent Upsert (update rating and explanation without duplicate row)
      feedback.update(
        FeedbackRating.NEGATIVE,
        'Tras revisar la guía, falta dosificación.',
        'INCOMPLETE',
      );
      await feedbackRepo.save(feedback);

      const allFeedbackRows = await prisma.aiMessageFeedback.findMany({
        where: { messageId: asstMsgId, userId: USER_A },
      });
      expect(allFeedbackRows).toHaveLength(1); // Enforces strictly 1 record per user & message
      expect(allFeedbackRows[0]!.rating).toBe(PrismaFeedbackRating.NEGATIVE);
      expect(allFeedbackRows[0]!.explanation).toBe('Tras revisar la guía, falta dosificación.');
      expect(allFeedbackRows[0]!.category).toBe('INCOMPLETE');
    });

    it('cascades deletion when parent conversation is deleted', async () => {
      const convId = 'conv_cascade_01';
      const turnId = 'turn_cascade_01';
      const userMsgId = 'msg_u_casc';
      const asstMsgId = 'msg_a_casc';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId });

      const feedback = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        userId: USER_A,
        rating: FeedbackRating.POSITIVE,
      });
      await feedbackRepo.save(feedback);

      // Delete parent conversation
      await prisma.aiConversation.delete({ where: { id: convId } });

      // Invariant: Feedback record must be deleted cascade, zero orphaned records
      const remainingFeedback = await prisma.aiMessageFeedback.findMany({
        where: { conversationId: convId },
      });
      expect(remainingFeedback).toHaveLength(0);
    });

    it('cascades deletion when parent message is deleted', async () => {
      const convId = 'conv_cascade_02';
      const turnId = 'turn_cascade_02';
      const userMsgId = 'msg_u_casc2';
      const asstMsgId = 'msg_a_casc2';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId });

      const feedback = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: convId,
        messageId: asstMsgId,
        userId: USER_A,
        rating: FeedbackRating.NEGATIVE,
      });
      await feedbackRepo.save(feedback);

      // Delete parent message
      await prisma.aiConversationMessage.delete({ where: { id: asstMsgId } });

      const remainingFeedback = await prisma.aiMessageFeedback.findMany({
        where: { messageId: asstMsgId },
      });
      expect(remainingFeedback).toHaveLength(0);
    });
  });

  describe('2. SubmitMessageFeedbackUseCase & Invariants', () => {
    it('successfully submits and updates feedback with verified domain invariants', async () => {
      const convId = 'conv_uc_01';
      const turnId = 'turn_uc_01';
      const userMsgId = 'msg_u_uc1';
      const asstMsgId = 'msg_a_uc1';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId });

      // 1. Submit initial positive feedback
      const initialResult = await submitUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        rating: FeedbackRating.POSITIVE,
        explanation: 'Respuesta muy útil para la sesión.',
      });

      expect(initialResult.isUpdate).toBe(false);
      expect(initialResult.feedback.rating).toBe(FeedbackRating.POSITIVE);
      expect(initialResult.feedback.explanation).toBe('Respuesta muy útil para la sesión.');
      expect(initialResult.feedback.userId).toBe(USER_A);

      // 2. Submit update on existing feedback
      const updatedResult = await submitUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_A,
        conversationId: convId,
        messageId: asstMsgId,
        rating: FeedbackRating.NEGATIVE,
        explanation: 'Corrijo: faltó advertir sobre la contraindicación.',
      });

      expect(updatedResult.isUpdate).toBe(true);
      expect(updatedResult.feedback.rating).toBe(FeedbackRating.NEGATIVE);
      expect(updatedResult.feedback.explanation).toBe(
        'Corrijo: faltó advertir sobre la contraindicación.',
      );
    });

    it('rejects feedback on user messages with FeedbackTargetNotAssistantMessageError', async () => {
      const convId = 'conv_uc_02';
      const turnId = 'turn_uc_02';
      const userMsgId = 'msg_u_uc2';
      const asstMsgId = 'msg_a_uc2';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId });

      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_A,
          conversationId: convId,
          messageId: userMsgId, // Target is user message!
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(FeedbackTargetNotAssistantMessageError);
    });

    it('rejects feedback submission across tenant or user boundaries', async () => {
      const convId = 'conv_uc_03';
      const turnId = 'turn_uc_03';
      const userMsgId = 'msg_u_uc3';
      const asstMsgId = 'msg_a_uc3';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId, userId: USER_A });

      // User B tries to submit feedback on User A's conversation
      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_B, // Intruder
          conversationId: convId,
          messageId: asstMsgId,
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);

      // Foreign tenant tries to submit feedback
      await expect(
        submitUseCase.execute({
          tenantId: OTHER_TENANT_ID,
          userId: USER_A,
          conversationId: convId,
          messageId: asstMsgId,
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('rejects feedback when message does not belong to specified conversation', async () => {
      const conv1Id = 'conv_uc_mismatch_1';
      const turn1Id = 'turn_uc_mismatch_1';
      const user1MsgId = 'msg_u_m1';
      const asst1MsgId = 'msg_a_m1';

      const conv2Id = 'conv_uc_mismatch_2';
      const turn2Id = 'turn_uc_mismatch_2';
      const user2MsgId = 'msg_u_m2';
      const asst2MsgId = 'msg_a_m2';

      await seedConversationFixture({
        convId: conv1Id,
        turnId: turn1Id,
        userMsgId: user1MsgId,
        asstMsgId: asst1MsgId,
      });
      await seedConversationFixture({
        convId: conv2Id,
        turnId: turn2Id,
        userMsgId: user2MsgId,
        asstMsgId: asst2MsgId,
      });

      // Attempt to submit feedback referencing conv1Id but asst2MsgId (from conv2)
      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_A,
          conversationId: conv1Id,
          messageId: asst2MsgId,
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(MessageNotBelongingToConversationError);
    });
  });

  describe('3. AiConversationController Endpoints (HTTP Integration)', () => {
    it('executes submitFeedback, getFeedback, and revokeFeedback through controller', async () => {
      const convId = 'conv_ctrl_01';
      const turnId = 'turn_ctrl_01';
      const userMsgId = 'msg_u_ctrl1';
      const asstMsgId = 'msg_a_ctrl1';

      await seedConversationFixture({ convId, turnId, userMsgId, asstMsgId });

      const authContext: TrustedAiContext = {
        tenantId: TENANT_ID,
        actorId: USER_A,
        roles: ['Physiotherapist'],
        permissions: ['ai:read', 'ai:feedback'],
      };

      // 1. Submit Feedback
      const body: SubmitFeedbackRequestDto = {
        rating: FeedbackRating.POSITIVE,
        explanation: 'Respuesta validada clínicamente.',
        category: 'ACCURACY',
      };

      const submitRes = await controller.submitFeedback(authContext, convId, asstMsgId, body);
      expect(submitRes.id).toBeDefined();
      expect(submitRes.rating).toBe('POSITIVE');
      expect(submitRes.explanation).toBe('Respuesta validada clínicamente.');
      expect(submitRes.userId).toBe(USER_A);
      expect(submitRes.messageId).toBe(asstMsgId);

      // 2. Get Feedback
      const getRes = await controller.getFeedback(authContext, convId, asstMsgId);
      expect(getRes.id).toBe(submitRes.id);
      expect(getRes.rating).toBe('POSITIVE');
      expect(getRes.explanation).toBe('Respuesta validada clínicamente.');

      // 3. Revoke Feedback
      const revokeRes = await controller.revokeFeedback(authContext, convId, asstMsgId);
      expect(revokeRes.revoked).toBe(true);
      expect(revokeRes.messageId).toBe(asstMsgId);

      // 4. Verify physical deletion in PostgreSQL
      const persistedAfterRevocation = await prisma.aiMessageFeedback.findUnique({
        where: {
          uq_message_user_feedback: {
            messageId: asstMsgId,
            userId: USER_A,
          },
        },
      });
      expect(persistedAfterRevocation).toBeNull();
    });
  });
});
