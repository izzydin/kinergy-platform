import { PrismaClient } from '@prisma/client';
import {
  LoadCanonicalConversationHistoryUseCase,
  ConversationNotFoundError,
  TurnNotFoundError,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
} from '@kinergy-platform/core/server';

/**
 * AI-09.3-BE.06.02 — Canonical Conversation History & RAG Context Assembly
 * PostgreSQL Integration Tests
 *
 * Verifies against real PostgreSQL:
 * 1. Filtering of non-terminal, failed, and cancelled turns from conversational context.
 * 2. Approved context-window bounding (up to 10 completed canonical turns).
 * 3. Monotonic sequence-based chronological ordering.
 * 4. Isolation of current turn user prompt and exclusion of assistant placeholder.
 * 5. Strict tenant isolation without cross-tenant existence leaks.
 */
describe('AI-09.3-BE.06.02: Canonical Conversation History & Context Assembly (Integration)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let useCase: LoadCanonicalConversationHistoryUseCase;

  const TENANT_A = 'tenant_context_a';
  const TENANT_B = 'tenant_context_b';
  const USER_1 = 'user_context_1';
  const CONV_ID = 'test-conv-context-1';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    useCase = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-context-%'`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-context-%'`,
    );
  });

  async function createConversation(id: string, tenantId: string) {
    await prisma.aiConversation.create({
      data: {
        id,
        tenantId,
        userId: USER_1,
        title: 'Clinical Evaluation Context',
        turnCounter: 0,
        messageCounter: 0,
      },
    });
  }

  async function createTurn(data: {
    id: string;
    conversationId: string;
    tenantId: string;
    turnIndex: number;
    status: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    activeAttemptId?: string;
  }) {
    await prisma.aiConversationTurn.create({
      data: {
        id: data.id,
        conversationId: data.conversationId,
        tenantId: data.tenantId,
        turnIndex: data.turnIndex,
        status: data.status,
        clientTurnId: `client-${data.id}`,
        idempotencyKey: `idem-${data.id}`,
        idempotencyPayloadHash: `hash-${data.id}`,
        activeAttemptId: null,
        activeAttemptNumber: 1,
      },
    });
  }

  async function setActiveAttempt(
    turnId: string,
    conversationId: string,
    tenantId: string,
    messageId: string,
  ) {
    await prisma.aiConversationTurn.update({
      where: {
        uq_turn_id_conv_tenant: {
          id: turnId,
          conversationId,
          tenantId,
        },
      },
      data: {
        activeAttemptId: messageId,
      },
    });
  }

  async function createMessage(data: {
    id: string;
    turnId: string;
    conversationId: string;
    tenantId: string;
    role: 'USER' | 'ASSISTANT';
    sequenceNumber: number;
    content: string;
    isCanonical?: boolean;
    status: 'PENDING' | 'STREAMING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  }) {
    await prisma.aiConversationMessage.create({
      data: {
        id: data.id,
        turnId: data.turnId,
        conversationId: data.conversationId,
        tenantId: data.tenantId,
        role: data.role,
        sequenceNumber: data.sequenceNumber,
        attemptNumber: 1,
        content: data.content,
        isCanonical: data.isCanonical ?? false,
        status: data.status,
      },
    });
  }

  it('1. filters out failed and cancelled turns from completed canonical context in PostgreSQL', async () => {
    await createConversation(CONV_ID, TENANT_A);

    // Turn 1: COMPLETED
    await createTurn({
      id: 'turn-1',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 1,
      status: 'COMPLETED',
    });
    await createMessage({
      id: 'msg-u1',
      turnId: 'turn-1',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 1,
      content: 'Consulta 1',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a1',
      turnId: 'turn-1',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 2,
      content: 'Respuesta 1',
      isCanonical: true,
      status: 'SUCCESS',
    });

    // Turn 2: FAILED
    await createTurn({
      id: 'turn-2',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 2,
      status: 'FAILED',
    });
    await createMessage({
      id: 'msg-u2',
      turnId: 'turn-2',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 3,
      content: 'Consulta 2',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a2',
      turnId: 'turn-2',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 4,
      content: '',
      isCanonical: false,
      status: 'FAILED',
    });

    // Turn 3: CANCELLED
    await createTurn({
      id: 'turn-3',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 3,
      status: 'CANCELLED',
    });
    await createMessage({
      id: 'msg-u3',
      turnId: 'turn-3',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 5,
      content: 'Consulta 3',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a3',
      turnId: 'turn-3',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 6,
      content: '',
      isCanonical: false,
      status: 'CANCELLED',
    });

    // Turn 4: COMPLETED
    await createTurn({
      id: 'turn-4',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 4,
      status: 'COMPLETED',
    });
    await createMessage({
      id: 'msg-u4',
      turnId: 'turn-4',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 7,
      content: 'Consulta 4',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a4',
      turnId: 'turn-4',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 8,
      content: 'Respuesta 4',
      isCanonical: true,
      status: 'SUCCESS',
    });

    // Turn 5: PENDING (Active turn)
    await createTurn({
      id: 'turn-5',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 5,
      status: 'PENDING',
    });
    await createMessage({
      id: 'msg-u5',
      turnId: 'turn-5',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 9,
      content: 'Consulta activa 5',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a5',
      turnId: 'turn-5',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 10,
      content: '',
      isCanonical: false,
      status: 'PENDING',
    });
    await setActiveAttempt('turn-5', CONV_ID, TENANT_A, 'msg-a5');

    const result = await useCase.execute({
      tenantId: TENANT_A,
      conversationId: CONV_ID,
      turnId: 'turn-5',
    });

    expect(result.conversationId).toBe(CONV_ID);
    expect(result.currentTurnId).toBe('turn-5');
    expect(result.currentUserMessage.content).toBe('Consulta activa 5');
    expect(result.completedTurnsCount).toBe(2); // Only Turn 1 and Turn 4
    expect(result.isContextTruncated).toBe(false);

    // Prior messages strictly contain Turn 1 and Turn 4 in sequence order
    expect(result.priorCanonicalMessages).toHaveLength(4);
    expect(result.priorCanonicalMessages[0]).toEqual({ role: 'user', content: 'Consulta 1' });
    expect(result.priorCanonicalMessages[1]).toEqual({ role: 'assistant', content: 'Respuesta 1' });
    expect(result.priorCanonicalMessages[2]).toEqual({ role: 'user', content: 'Consulta 4' });
    expect(result.priorCanonicalMessages[3]).toEqual({ role: 'assistant', content: 'Respuesta 4' });

    // Ensure Turn 2, Turn 3, and Turn 5 messages are NOT in prior history
    const allPriorContents = result.priorCanonicalMessages.map((m) => m.content);
    expect(allPriorContents).not.toContain('Consulta 2');
    expect(allPriorContents).not.toContain('Consulta 3');
    expect(allPriorContents).not.toContain('Consulta activa 5');
  });

  it('2. bounds history to 10 completed canonical turns when more than 10 exist in PostgreSQL', async () => {
    await createConversation(CONV_ID, TENANT_A);

    // Create 12 completed turns (turns 1..12)
    for (let i = 1; i <= 12; i++) {
      const turnId = `turn-${i}`;
      await createTurn({
        id: turnId,
        conversationId: CONV_ID,
        tenantId: TENANT_A,
        turnIndex: i,
        status: 'COMPLETED',
      });
      await createMessage({
        id: `msg-u${i}`,
        turnId,
        conversationId: CONV_ID,
        tenantId: TENANT_A,
        role: 'USER',
        sequenceNumber: i * 2 - 1,
        content: `Pregunta ${i}`,
        status: 'SUCCESS',
      });
      await createMessage({
        id: `msg-a${i}`,
        turnId,
        conversationId: CONV_ID,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: i * 2,
        content: `Respuesta ${i}`,
        isCanonical: true,
        status: 'SUCCESS',
      });
    }

    // Active Turn 13
    await createTurn({
      id: 'turn-13',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 13,
      status: 'PENDING',
    });
    await createMessage({
      id: 'msg-u13',
      turnId: 'turn-13',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 25,
      content: 'Pregunta activa 13',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a13',
      turnId: 'turn-13',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 26,
      content: '',
      isCanonical: false,
      status: 'PENDING',
    });
    await setActiveAttempt('turn-13', CONV_ID, TENANT_A, 'msg-a13');

    const result = await useCase.execute({
      tenantId: TENANT_A,
      conversationId: CONV_ID,
      turnId: 'turn-13',
    });

    expect(result.completedTurnsCount).toBe(10);
    expect(result.totalCompletedTurnsInHistory).toBe(12);
    expect(result.isContextTruncated).toBe(true);

    // 10 turns -> 20 messages
    expect(result.priorCanonicalMessages).toHaveLength(20);

    // Windowed turns are turns 3 through 12 (turns 1 and 2 truncated)
    expect(result.priorCanonicalMessages[0]).toEqual({ role: 'user', content: 'Pregunta 3' });
    expect(result.priorCanonicalMessages[1]).toEqual({ role: 'assistant', content: 'Respuesta 3' });
    expect(result.priorCanonicalMessages[18]).toEqual({ role: 'user', content: 'Pregunta 12' });
    expect(result.priorCanonicalMessages[19]).toEqual({
      role: 'assistant',
      content: 'Respuesta 12',
    });
  });

  it('3. enforces tenant isolation and does not reveal conversation existence across tenants in PostgreSQL', async () => {
    await createConversation(CONV_ID, TENANT_A);
    await createTurn({
      id: 'turn-1',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      turnIndex: 1,
      status: 'PENDING',
    });
    await createMessage({
      id: 'msg-u1',
      turnId: 'turn-1',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 1,
      content: 'Pregunta',
      status: 'SUCCESS',
    });
    await createMessage({
      id: 'msg-a1',
      turnId: 'turn-1',
      conversationId: CONV_ID,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 2,
      content: '',
      isCanonical: false,
      status: 'PENDING',
    });
    await setActiveAttempt('turn-1', CONV_ID, TENANT_A, 'msg-a1');

    // Foreign tenant request must fail with ConversationNotFoundError
    await expect(
      useCase.execute({
        tenantId: TENANT_B,
        conversationId: CONV_ID,
        turnId: 'turn-1',
      }),
    ).rejects.toThrow(ConversationNotFoundError);

    // Non-existent turn within valid conversation must fail with TurnNotFoundError
    await expect(
      useCase.execute({
        tenantId: TENANT_A,
        conversationId: CONV_ID,
        turnId: 'turn-non-existent',
      }),
    ).rejects.toThrow(TurnNotFoundError);
  });
});
