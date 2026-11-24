import { PrismaClient } from '@prisma/client';

/**
 * AI-09.3-BE.02.01 — Conversation Persistence Database Foundation Integration Tests
 *
 * Verifies real PostgreSQL relational integrity, composite tenant constraints,
 * partial unique indexes, deferred triggers, check constraints, and independent audit survival.
 */
describe('AI-09.3-BE.02.01: Conversation Persistence Database Foundation (Integration)', () => {
  let prisma: PrismaClient;

  const TENANT_A = 'tenant-test-a';
  const TENANT_B = 'tenant-test-b';
  const USER_1 = 'user-test-1';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-%'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "ai_conversations" WHERE "id" LIKE 'test-conv-%'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
  });

  // Helper for inserting turn
  async function insertTurn(data: {
    id: string;
    conversationId: string;
    tenantId: string;
    turnIndex: number;
    status?: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
    clientTurnId: string;
    activeAttemptId?: string | null;
  }) {
    await prisma.$executeRaw`
      INSERT INTO "ai_conversation_turns" (
        "id", "conversation_id", "tenant_id", "turn_index", "status",
        "client_turn_id", "idempotency_key", "idempotency_payload_hash",
        "active_attempt_id", "updated_at"
      ) VALUES (
        ${data.id}, ${data.conversationId}, ${data.tenantId}, ${data.turnIndex},
        ${data.status ?? 'PENDING'}::"TurnStatus",
        ${data.clientTurnId}, ${data.clientTurnId}, 'hash-1',
        ${data.activeAttemptId ?? null}, NOW()
      );
    `;
  }

  // Helper for inserting message
  async function insertMessage(data: {
    id: string;
    turnId: string;
    conversationId: string;
    tenantId: string;
    role: 'USER' | 'ASSISTANT' | 'SYSTEM';
    sequenceNumber: number;
    attemptNumber?: number;
    status?: 'PENDING' | 'STREAMING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
    isCanonical?: boolean;
    leaseToken?: string | null;
  }) {
    await prisma.$executeRaw`
      INSERT INTO "ai_conversation_messages" (
        "id", "turn_id", "conversation_id", "tenant_id", "role",
        "sequence_number", "attempt_number", "status", "is_canonical",
        "lease_token", "updated_at"
      ) VALUES (
        ${data.id}, ${data.turnId}, ${data.conversationId}, ${data.tenantId},
        ${data.role}::"ConversationRole",
        ${data.sequenceNumber}, ${data.attemptNumber ?? 1},
        ${data.status ?? 'PENDING'}::"GenerationStatus",
        ${data.isCanonical ?? false},
        ${data.leaseToken ?? null}, NOW()
      );
    `;
  }

  // 1. Cross-Tenant Conversation References Rejected
  it('1. should reject a turn referencing a conversation belonging to a different tenant', async () => {
    const convId = 'test-conv-tenant-a';
    await prisma.aiConversation.create({
      data: {
        id: convId,
        tenantId: TENANT_A,
        userId: USER_1,
        title: 'Tenant A Conversation',
      },
    });

    // Attempt to insert turn with tenant B but conversation A
    await expect(
      insertTurn({
        id: 'turn-x-tenant',
        conversationId: convId,
        tenantId: TENANT_B,
        turnIndex: 1,
        clientTurnId: 'ct-1',
      }),
    ).rejects.toThrow();
  });

  // 2. Message Referencing Turn from Another Conversation Rejected
  it('2. should reject a message referencing a turn from a different conversation', async () => {
    const conv1 = 'test-conv-1';
    const conv2 = 'test-conv-2';

    await prisma.aiConversation.create({
      data: { id: conv1, tenantId: TENANT_A, userId: USER_1, title: 'Conv 1' },
    });
    await prisma.aiConversation.create({
      data: { id: conv2, tenantId: TENANT_A, userId: USER_1, title: 'Conv 2' },
    });

    const turn1 = 'turn-conv-1';
    await insertTurn({
      id: turn1,
      conversationId: conv1,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-turn-1',
    });

    // Attempt to insert message with turn1 but conversation conv2
    await expect(
      insertMessage({
        id: 'msg-mismatch',
        turnId: turn1,
        conversationId: conv2,
        tenantId: TENANT_A,
        role: 'USER',
        sequenceNumber: 1,
      }),
    ).rejects.toThrow();
  });

  // 3. Active Attempt Membership Trigger Check
  it('3. should reject an active attempt referencing a message from a different turn or role', async () => {
    const convId = 'test-conv-active-check';
    const turn1 = 'turn-active-1';
    const turn2 = 'turn-active-2';
    const msgTurn2 = 'msg-attempt-turn-2';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Active Check' },
    });

    await insertTurn({
      id: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-active-1',
    });
    await insertTurn({
      id: turn2,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 2,
      clientTurnId: 'ct-active-2',
    });

    // Create assistant message belonging to Turn 2
    await insertMessage({
      id: msgTurn2,
      turnId: turn2,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 2,
      status: 'STREAMING',
    });

    // Attempting to set active_attempt_id of Turn 1 to msgTurn2 (which belongs to Turn 2)
    // Deferred trigger fires at commit time
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "ai_conversation_turns"
          SET "active_attempt_id" = ${msgTurn2}
          WHERE "id" = ${turn1};
        `;
      }),
    ).rejects.toThrow(/Constraint violation: active_attempt_id/);
  });

  // 4. Partial Unique Index: Exactly One Active Generation Attempt per Conversation
  it('4. should reject two active assistant generation attempts in the same conversation', async () => {
    const convId = 'test-conv-single-gen';
    const turnId = 'turn-single-gen';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Active Gen Test' },
    });

    await insertTurn({
      id: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-gen-1',
      status: 'STREAMING',
    });

    // First active assistant message (STREAMING)
    await insertMessage({
      id: 'msg-gen-1',
      turnId: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 2,
      status: 'STREAMING',
    });

    // Second active assistant message in same conversation (PENDING) -> Violates partial unique index
    await expect(
      insertMessage({
        id: 'msg-gen-2',
        turnId: turnId,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 3,
        status: 'PENDING',
      }),
    ).rejects.toThrow();
  });

  // 5. Partial Unique Index: Exactly One User Message per Turn
  it('5. should reject two user messages in the same turn', async () => {
    const convId = 'test-conv-single-user';
    const turnId = 'turn-single-user';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'User Msg Test' },
    });

    await insertTurn({
      id: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-user-1',
    });

    await insertMessage({
      id: 'msg-u-1',
      turnId: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 1,
      status: 'SUCCESS',
    });

    // Second user message in same turn -> Violates uq_turn_single_user_message
    await expect(
      insertMessage({
        id: 'msg-u-2',
        turnId: turnId,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'USER',
        sequenceNumber: 2,
        status: 'SUCCESS',
      }),
    ).rejects.toThrow();
  });

  // 6. Check Constraint: Canonical Assistant Message Requires SUCCESS
  it('6. should reject setting is_canonical = true on non-SUCCESS assistant attempts', async () => {
    const convId = 'test-conv-canonical-chk';
    const turnId = 'turn-canonical-chk';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Canonical Check' },
    });

    await insertTurn({
      id: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-can-1',
      status: 'STREAMING',
    });

    // Attempt to insert is_canonical = true with status = STREAMING -> Violates chk_canonical_requires_success
    await expect(
      insertMessage({
        id: 'msg-can-bad',
        turnId: turnId,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 2,
        status: 'STREAMING',
        isCanonical: true,
      }),
    ).rejects.toThrow();
  });

  // 7. Partial Unique Index: At Most One Canonical Assistant Message per Turn
  it('7. should reject multiple canonical assistant messages in the same turn', async () => {
    const convId = 'test-conv-multi-can';
    const turnId = 'turn-multi-can';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Multi Canonical' },
    });

    await insertTurn({
      id: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-mcan-1',
      status: 'COMPLETED',
    });

    // First canonical assistant message (SUCCESS)
    await insertMessage({
      id: 'msg-can-1',
      turnId: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 2,
      status: 'SUCCESS',
      isCanonical: true,
    });

    // Second canonical assistant message in same turn -> Violates uq_turn_single_canonical_assistant
    await expect(
      insertMessage({
        id: 'msg-can-2',
        turnId: turnId,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 3,
        status: 'SUCCESS',
        isCanonical: true,
      }),
    ).rejects.toThrow();
  });

  // 8. Check Constraint: Terminal Assistant Attempt Cannot Retain Active Lease
  it('8. should reject terminal assistant attempts retaining an active lease token or expiration', async () => {
    const convId = 'test-conv-lease-term';
    const turnId = 'turn-lease-term';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Lease Term Check' },
    });

    await insertTurn({
      id: turnId,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-term-1',
      status: 'FAILED',
    });

    // Status is FAILED, but lease_token is still non-null -> Violates chk_terminal_attempt_no_active_lease
    await expect(
      insertMessage({
        id: 'msg-lease-bad',
        turnId: turnId,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 2,
        status: 'FAILED',
        leaseToken: 'token-active',
      }),
    ).rejects.toThrow();
  });

  // 9. Relational Immutability Trigger
  it('9. should reject mutations to message role or parent turn bindings', async () => {
    const convId = 'test-conv-immutable';
    const turn1 = 'turn-imm-1';
    const turn2 = 'turn-imm-2';
    const msgId = 'msg-imm-1';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Immutability Check' },
    });

    await insertTurn({
      id: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-imm-1',
    });
    await insertTurn({
      id: turn2,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 2,
      clientTurnId: 'ct-imm-2',
    });

    await insertMessage({
      id: msgId,
      turnId: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 1,
      status: 'SUCCESS',
    });

    // Attempting to change role from USER to ASSISTANT
    await expect(
      prisma.$executeRaw`
        UPDATE "ai_conversation_messages" SET "role" = 'ASSISTANT' WHERE "id" = ${msgId};
      `,
    ).rejects.toThrow(/Constraint violation: message role is immutable once inserted/);

    // Attempting to change parent turn_id from turn1 to turn2
    await expect(
      prisma.$executeRaw`
        UPDATE "ai_conversation_messages" SET "turn_id" = ${turn2} WHERE "id" = ${msgId};
      `,
    ).rejects.toThrow(/Constraint violation: message parent bindings/);
  });

  // 10. Audit Record Survival After Conversation Deletion
  it('10. should retain audit logs independently when a conversation is hard deleted', async () => {
    const convId = 'test-conv-audit-survival';
    const auditId = 'audit-log-1';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Audit Survival Test' },
    });

    // Create Audit Log record referencing convId
    await prisma.aiConversationAuditLog.create({
      data: {
        id: auditId,
        tenantId: TENANT_A,
        conversationId: convId,
        conversationTitleSnapshot: 'Audit Survival Test',
        conversationOwnerUserId: USER_1,
        inspectorUserId: 'inspector-owner',
        inspectorRole: 'Owner',
        reason: 'Investigating clinical treatment safety compliance',
      },
    });

    // Hard-delete the conversation
    await prisma.$executeRaw`
      DELETE FROM "ai_conversations" WHERE "id" = ${convId};
    `;

    // Verify conversation was deleted
    const convCheck = await prisma.aiConversation.findUnique({ where: { id: convId } });
    expect(convCheck).toBeNull();

    // Verify audit log record SURVIVES intact!
    const auditRecord = await prisma.aiConversationAuditLog.findUnique({ where: { id: auditId } });
    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.conversationId).toBe(convId);
    expect(auditRecord?.conversationTitleSnapshot).toBe('Audit Survival Test');
    expect(auditRecord?.inspectorRole).toBe('Owner');
  });

  // 11. Sequence Number Uniqueness per Conversation
  it('11. should enforce sequence number uniqueness within a conversation', async () => {
    const convId = 'test-conv-seq-uniq';
    const turn1 = 'turn-seq-1';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Seq Uniq Test' },
    });

    await insertTurn({
      id: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-seq-1',
    });

    await insertMessage({
      id: 'msg-seq-1',
      turnId: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 1,
      status: 'SUCCESS',
    });

    // Inserting a second message with sequence_number = 1 in the same conversation -> Violates uq_conversation_sequence_number
    await expect(
      insertMessage({
        id: 'msg-seq-dup',
        turnId: turn1,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 1,
        status: 'PENDING',
      }),
    ).rejects.toThrow();
  });

  // 12. Monotonic Positive Integers Check Constraints
  it('12. should reject non-positive turn_index, sequence_number, or attempt_number via check constraints', async () => {
    const convId = 'test-conv-pos-chk';
    const turn1 = 'turn-pos-1';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Positive Chk Test' },
    });

    // Attempt turn_index = 0 -> violates chk_turn_index_positive
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_turns" (
          "id", "conversation_id", "tenant_id", "turn_index", "status",
          "client_turn_id", "idempotency_key", "idempotency_payload_hash", "updated_at"
        ) VALUES (
          'turn-zero', ${convId}, ${TENANT_A}, 0, 'PENDING'::"TurnStatus",
          'ct-zero', 'idemp-zero', 'hash-zero', NOW()
        )
      `,
    ).rejects.toThrow();

    // Valid turn
    await insertTurn({
      id: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-pos-1',
    });

    // Attempt sequence_number = 0 -> violates chk_sequence_number_positive
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role",
          "sequence_number", "attempt_number", "is_canonical", "status", "content", "updated_at"
        ) VALUES (
          'msg-zero-seq', ${turn1}, ${convId}, ${TENANT_A}, 'USER'::"ConversationRole",
          0, 1, false, 'SUCCESS'::"GenerationStatus", 'Test', NOW()
        )
      `,
    ).rejects.toThrow();

    // Attempt attempt_number = 0 -> violates chk_attempt_number_positive
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ai_conversation_messages" (
          "id", "turn_id", "conversation_id", "tenant_id", "role",
          "sequence_number", "attempt_number", "is_canonical", "status", "content", "updated_at"
        ) VALUES (
          'msg-zero-att', ${turn1}, ${convId}, ${TENANT_A}, 'ASSISTANT'::"ConversationRole",
          1, 0, false, 'PENDING'::"GenerationStatus", '', NOW()
        )
      `,
    ).rejects.toThrow();
  });

  // 13. Historical and Superseded Inactive Attempts Coexistence
  it('13. should allow multiple historical and superseded assistant attempts in the same turn/conversation when inactive', async () => {
    const convId = 'test-conv-hist-attempts';
    const turn1 = 'turn-hist-1';

    await prisma.aiConversation.create({
      data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Historical Attempts' },
    });

    await insertTurn({
      id: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      turnIndex: 1,
      clientTurnId: 'ct-hist-1',
    });

    await insertMessage({
      id: 'msg-u-1',
      turnId: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'USER',
      sequenceNumber: 1,
      status: 'SUCCESS',
    });

    // Attempt 1: Failed
    await insertMessage({
      id: 'msg-att-1',
      turnId: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 2,
      attemptNumber: 1,
      isCanonical: false,
      status: 'FAILED',
    });

    // Attempt 2: Cancelled
    await insertMessage({
      id: 'msg-att-2',
      turnId: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 3,
      attemptNumber: 2,
      isCanonical: false,
      status: 'CANCELLED',
    });

    // Attempt 3: Canonical Success
    await insertMessage({
      id: 'msg-att-3',
      turnId: turn1,
      conversationId: convId,
      tenantId: TENANT_A,
      role: 'ASSISTANT',
      sequenceNumber: 4,
      attemptNumber: 3,
      isCanonical: true,
      status: 'SUCCESS',
    });

    // All 3 assistant attempts coexist peacefully in PostgreSQL
    const messages = await prisma.aiConversationMessage.findMany({
      where: { turnId: turn1 },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(messages).toHaveLength(4);
    expect(messages.filter((m) => m.role === 'ASSISTANT')).toHaveLength(3);
  });

  describe('Database Concurrency & Synchronization Barrier Tests', () => {
    let clientA: PrismaClient;
    let clientB: PrismaClient;

    beforeAll(async () => {
      clientA = new PrismaClient();
      clientB = new PrismaClient();
      await Promise.all([clientA.$connect(), clientB.$connect()]);
    });

    afterAll(async () => {
      await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
    });

    it('14. should reject concurrent competing active assistant generation attempts in the same conversation', async () => {
      const convId = 'test-conv-concurrent-gen';
      const turnA = 'turn-concurrent-a';
      const turnB = 'turn-concurrent-b';

      await prisma.aiConversation.create({
        data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Concurrent Gen Test' },
      });

      await insertTurn({
        id: turnA,
        conversationId: convId,
        tenantId: TENANT_A,
        turnIndex: 1,
        clientTurnId: 'ct-concurrent-a',
      });
      await insertTurn({
        id: turnB,
        conversationId: convId,
        tenantId: TENANT_A,
        turnIndex: 2,
        clientTurnId: 'ct-concurrent-b',
      });

      // Synchronized barrier for two competing INSERT operations into ai_conversation_messages
      // Both attempt to create role = 'ASSISTANT' and status = 'PENDING' for the SAME conversation
      const insertAttempt = async (
        client: PrismaClient,
        msgId: string,
        turnId: string,
        seq: number,
      ) => {
        return client.$executeRaw`
          INSERT INTO "ai_conversation_messages" (
            "id", "turn_id", "conversation_id", "tenant_id", "role",
            "sequence_number", "attempt_number", "is_canonical", "status",
            "content", "updated_at"
          ) VALUES (
            ${msgId}, ${turnId}, ${convId}, ${TENANT_A}, 'ASSISTANT'::"ConversationRole",
            ${seq}, 1, false, 'PENDING'::"GenerationStatus", '', NOW()
          )
        `;
      };

      const results = await Promise.allSettled([
        insertAttempt(clientA, 'msg-conc-1', turnA, 1),
        insertAttempt(clientB, 'msg-conc-2', turnB, 2),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly ONE must succeed and exactly ONE must be rejected by ai_conversation_active_generation_idx
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Verify the rejection reason is PostgreSQL unique index violation (code 23505)
      const errorMsg = (rejected[0] as PromiseRejectedResult).reason?.message ?? '';
      expect(errorMsg).toMatch(/ai_conversation_active_generation_idx|unique constraint|23505/i);
    });

    it('15. should reject concurrent competing user messages in the same turn', async () => {
      const convId = 'test-conv-concurrent-user';
      const turn1 = 'turn-concurrent-u1';

      await prisma.aiConversation.create({
        data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Concurrent User Msg' },
      });

      await insertTurn({
        id: turn1,
        conversationId: convId,
        tenantId: TENANT_A,
        turnIndex: 1,
        clientTurnId: 'ct-conc-user-1',
      });

      const insertUserMsg = async (client: PrismaClient, msgId: string, seq: number) => {
        return client.$executeRaw`
          INSERT INTO "ai_conversation_messages" (
            "id", "turn_id", "conversation_id", "tenant_id", "role",
            "sequence_number", "attempt_number", "is_canonical", "status",
            "content", "updated_at"
          ) VALUES (
            ${msgId}, ${turn1}, ${convId}, ${TENANT_A}, 'USER'::"ConversationRole",
            ${seq}, 1, false, 'SUCCESS'::"GenerationStatus", 'User question', NOW()
          )
        `;
      };

      const results = await Promise.allSettled([
        insertUserMsg(clientA, 'msg-u-conc-1', 1),
        insertUserMsg(clientB, 'msg-u-conc-2', 2),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const errorMsg = (rejected[0] as PromiseRejectedResult).reason?.message ?? '';
      expect(errorMsg).toMatch(/uq_turn_single_user_message|unique constraint|23505/i);
    });

    it('16. should reject concurrent competing canonical designations in the same turn', async () => {
      const convId = 'test-conv-concurrent-canon';
      const turn1 = 'turn-concurrent-c1';

      await prisma.aiConversation.create({
        data: { id: convId, tenantId: TENANT_A, userId: USER_1, title: 'Concurrent Canonical' },
      });

      await insertTurn({
        id: turn1,
        conversationId: convId,
        tenantId: TENANT_A,
        turnIndex: 1,
        clientTurnId: 'ct-conc-canon-1',
      });

      // Insert two completed assistant messages with is_canonical = false initially
      await insertMessage({
        id: 'msg-canon-a',
        turnId: turn1,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 2,
        attemptNumber: 1,
        isCanonical: false,
        status: 'SUCCESS',
      });
      await insertMessage({
        id: 'msg-canon-b',
        turnId: turn1,
        conversationId: convId,
        tenantId: TENANT_A,
        role: 'ASSISTANT',
        sequenceNumber: 3,
        attemptNumber: 2,
        isCanonical: false,
        status: 'SUCCESS',
      });

      // Simultaneously attempt to mark both as is_canonical = true
      const markCanonical = async (client: PrismaClient, msgId: string) => {
        return client.$executeRaw`
          UPDATE "ai_conversation_messages"
          SET "is_canonical" = TRUE
          WHERE "id" = ${msgId}
        `;
      };

      const results = await Promise.allSettled([
        markCanonical(clientA, 'msg-canon-a'),
        markCanonical(clientB, 'msg-canon-b'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const errorMsg = (rejected[0] as PromiseRejectedResult).reason?.message ?? '';
      expect(errorMsg).toMatch(/uq_turn_single_canonical_assistant|unique constraint|23505/i);
    });
  });
});
