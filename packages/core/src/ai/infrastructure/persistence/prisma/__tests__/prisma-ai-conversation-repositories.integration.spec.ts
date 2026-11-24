import { PrismaClient } from '@prisma/client';
import { PrismaAiConversationRepository } from '../repositories/prisma-ai-conversation.repository';
import { PrismaAiConversationTurnRepository } from '../repositories/prisma-ai-conversation-turn.repository';
import { PrismaAiConversationMessageRepository } from '../repositories/prisma-ai-conversation-message.repository';
import { PrismaAiConversationAuditRepository } from '../repositories/prisma-ai-conversation-audit.repository';
import { AiConversation } from '../../../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../../../domain/models/ai-conversation-message.entity';
import { AiConversationAuditLog } from '../../../../domain/models/ai-conversation-audit-log.entity';
import { ConversationRole } from '../../../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../../../domain/enums/generation-status.enum';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';
import { ConversationListCursor } from '../../../../domain/value-objects/conversation-list-cursor.vo';
import { AuditHistoryCursor } from '../../../../domain/value-objects/audit-history-cursor.vo';

describe('AI-09.3 — Prisma Conversation Repositories Integration Tests', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let isDbAvailable = false;

  const testTenant = `tenant_repo_test_${Date.now()}`;
  const testUserId = `user_repo_test_${Date.now()}`;
  const inspectorUserId = `inspector_${Date.now()}`;

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
    } catch (err) {
      isDbAvailable = false;
      console.warn(
        'Database not available for integration tests; skipping persistence tests.',
        err,
      );
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      // Clean up test tenant fixtures
      await prisma.aiConversationAuditLog.deleteMany({ where: { tenantId: testTenant } });
      await prisma.aiConversationMessage.deleteMany({ where: { tenantId: testTenant } });
      await prisma.aiConversationTurn.deleteMany({ where: { tenantId: testTenant } });
      await prisma.aiConversation.deleteMany({ where: { tenantId: testTenant } });
      await prisma.$disconnect();
    }
  });

  describe('PrismaAiConversationRepository', () => {
    it('should save and find conversation by ID and idempotency key', async () => {
      if (!isDbAvailable) return;

      const conversation = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Initial Persistent Consultation',
        idempotencyKey: 'conv-idemp-001',
      });

      const saved = await convRepo.save(conversation);
      expect(saved.id.value).toBe(conversation.id.value);
      expect(saved.title.value).toBe('Initial Persistent Consultation');

      const foundById = await convRepo.findById(testTenant, conversation.id);
      expect(foundById).not.toBeNull();
      expect(foundById?.title.value).toBe('Initial Persistent Consultation');

      const foundByIdemp = await convRepo.findByIdempotencyKey(
        testTenant,
        testUserId,
        'conv-idemp-001',
      );
      expect(foundByIdemp).not.toBeNull();
      expect(foundByIdemp?.id.value).toBe(conversation.id.value);
    });

    it('should update mutable conversation metadata and retrieve with details', async () => {
      if (!isDbAvailable) return;

      const conv = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Draft Conversation Details',
      });
      await convRepo.save(conv);

      const turn = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 1,
        clientTurnId: `client-turn-details-${Date.now()}`,
        idempotencyKey: `turn-details-${Date.now()}`,
        idempotencyPayloadHash: 'hash-details',
      });
      await turnRepo.save(turn);

      // Update metadata
      const updated = await convRepo.updateMetadata(testTenant, conv.id, {
        title: 'Updated Clinical Header',
      });
      expect(updated.title.value).toBe('Updated Clinical Header');

      // Retrieve with details
      const withDetails = await convRepo.findByIdWithDetails(testTenant, conv.id, {
        includeTurns: true,
      });
      expect(withDetails).not.toBeNull();
      expect(withDetails?.conversation.title.value).toBe('Updated Clinical Header');
      expect(withDetails?.turns).toHaveLength(1);
      expect(withDetails?.activeTurn?.id.value).toBe(turn.id.value);
    });

    it('should paginate conversations using ConversationListCursor', async () => {
      if (!isDbAvailable) return;

      const convA = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Conversation Page Item 1',
      });
      const convB = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Conversation Page Item 2',
      });
      await convRepo.save(convA);
      await convRepo.save(convB);

      const page1 = await convRepo.listByUserPaginated(testTenant, testUserId, { limit: 1 });
      expect(page1.items).toHaveLength(1);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeInstanceOf(ConversationListCursor);

      const page2 = await convRepo.listByUserPaginated(testTenant, testUserId, {
        limit: 1,
        cursor: page1.nextCursor,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0]?.id.value).not.toBe(page1.items[0]?.id.value);
    });

    it('should list conversations by user and handle softDelete', async () => {
      if (!isDbAvailable) return;

      const conv2 = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Second Consultation to be Archived',
      });
      await convRepo.save(conv2);

      const activeListBefore = await convRepo.listByUser(testTenant, testUserId);
      expect(activeListBefore.length).toBeGreaterThanOrEqual(2);

      await convRepo.softDelete(testTenant, conv2.id);

      const activeListAfter = await convRepo.listByUser(testTenant, testUserId, {
        includeArchived: false,
      });
      const foundArchivedInActive = activeListAfter.find((c) => c.id.equals(conv2.id));
      expect(foundArchivedInActive).toBeUndefined();

      const allList = await convRepo.listByUser(testTenant, testUserId, { includeArchived: true });
      const foundInAll = allList.find((c) => c.id.equals(conv2.id));
      expect(foundInAll).toBeDefined();
      expect(foundInAll?.isArchived()).toBe(true);
    });
  });

  describe('PrismaAiConversationTurnRepository', () => {
    it('should save, query, find active turn, and update turn status', async () => {
      if (!isDbAvailable) return;

      const conv = AiConversation.create({ tenantId: testTenant, userId: testUserId });
      await convRepo.save(conv);

      const turn = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 1,
        clientTurnId: `client-turn-${Date.now()}-1`,
        idempotencyKey: `turn-idemp-${Date.now()}-1`,
        idempotencyPayloadHash: 'hash-turn-payload-001',
      });

      const savedTurn = await turnRepo.save(turn);
      expect(savedTurn.turnIndex).toBe(1);
      expect(savedTurn.status).toBe(TurnStatus.PENDING);

      // Verify active turn lookup
      const activeTurn = await turnRepo.findActiveTurn(testTenant, conv.id);
      expect(activeTurn).not.toBeNull();
      expect(activeTurn?.id.value).toBe(turn.id.value);

      const foundByClient = await turnRepo.findByClientTurnId(testTenant, turn.clientTurnId);
      expect(foundByClient).not.toBeNull();
      expect(foundByClient?.id.value).toBe(turn.id.value);

      const foundByIndex = await turnRepo.findByTurnIndex(testTenant, conv.id, 1);
      expect(foundByIndex).not.toBeNull();
      expect(foundByIndex?.id.value).toBe(turn.id.value);

      // Transition turn to COMPLETED using explicit updateStatus
      const updatedTurn = await turnRepo.updateStatus(testTenant, conv.id, turn.id, {
        status: TurnStatus.COMPLETED,
        completedAt: new Date(),
      });
      expect(updatedTurn.status).toBe(TurnStatus.COMPLETED);
      expect(updatedTurn.completedAt).toBeInstanceOf(Date);

      // Now active turn should be null
      const noActiveTurn = await turnRepo.findActiveTurn(testTenant, conv.id);
      expect(noActiveTurn).toBeNull();
    });
  });

  describe('PrismaAiConversationMessageRepository', () => {
    it('should save messages, acquire leases, find canonical output, and paginate keyset history', async () => {
      if (!isDbAvailable) return;

      const conv = AiConversation.create({ tenantId: testTenant, userId: testUserId });
      await convRepo.save(conv);

      const turn1 = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 1,
        clientTurnId: `client-turn-${Date.now()}-msg-1`,
        idempotencyKey: `turn-idemp-${Date.now()}-msg-1`,
        idempotencyPayloadHash: 'hash-turn-payload-msg-001',
      });
      await turnRepo.save(turn1);

      const turn2 = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 2,
        clientTurnId: `client-turn-${Date.now()}-msg-2`,
        idempotencyKey: `turn-idemp-${Date.now()}-msg-2`,
        idempotencyPayloadHash: 'hash-turn-payload-msg-002',
      });
      await turnRepo.save(turn2);

      // Insert sequential canonical messages
      const msg1 = AiConversationMessage.create({
        turnId: turn1.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.USER,
        sequenceNumber: 1,
        content: 'Question 1: What is kinetic treatment?',
      });
      const msg2 = AiConversationMessage.create({
        turnId: turn1.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Answer 1: Kinetic treatment focuses on biomechanical restoration.',
      });
      const msg3 = AiConversationMessage.create({
        turnId: turn2.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.USER,
        sequenceNumber: 3,
        content: 'Question 2: How many sessions are recommended?',
      });

      await messageRepo.save(msg1);
      await messageRepo.save(msg2);
      await messageRepo.save(msg3);

      // Verify findBySequenceNumber
      const foundSeq2 = await messageRepo.findBySequenceNumber(testTenant, conv.id, 2);
      expect(foundSeq2).not.toBeNull();
      expect(foundSeq2?.role).toBe(ConversationRole.ASSISTANT);
      expect(foundSeq2?.content).toContain('Kinetic treatment');

      // Verify findCanonicalAssistantMessage
      const canonicalAssistant = await messageRepo.findCanonicalAssistantMessage(
        testTenant,
        conv.id,
        turn1.id,
      );
      expect(canonicalAssistant).not.toBeNull();
      expect(canonicalAssistant?.id.value).toBe(msg2.id.value);

      // Insert an active streaming assistant attempt to test lease acquisition
      const streamingAttempt = AiConversationMessage.create({
        turnId: turn2.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 4,
        isCanonical: false,
        status: GenerationStatus.STREAMING,
      });
      await messageRepo.save(streamingAttempt);

      // Verify acquireLease on active (non-terminal) attempt
      const leaseExpiry = new Date(Date.now() + 30000);
      const leasedMsg = await messageRepo.acquireLease(testTenant, conv.id, streamingAttempt.id, {
        leaseToken: 'lease-integration-token-123',
        leaseOwnerInstanceId: 'worker-node-1',
        leaseExpiresAt: leaseExpiry,
      });
      expect(leasedMsg.leaseToken).toBe('lease-integration-token-123');

      // Test keyset pagination: limit = 2
      const page1 = await messageRepo.listCanonicalHistory(testTenant, conv.id, { limit: 2 });
      expect(page1.messages).toHaveLength(2);
      expect(page1.messages[0]?.sequenceNumber).toBe(1);
      expect(page1.messages[1]?.sequenceNumber).toBe(2);
      expect(page1.nextCursor).not.toBeNull();
      expect(page1.nextCursor?.sequenceNumber).toBe(2);

      // Page 2 using cursor
      const page2 = await messageRepo.listCanonicalHistory(testTenant, conv.id, {
        cursor: page1.nextCursor,
        limit: 2,
      });
      expect(page2.messages).toHaveLength(1);
      expect(page2.messages[0]?.sequenceNumber).toBe(3);
      expect(page2.nextCursor).toBeNull();
    });
  });

  describe('PrismaAiConversationAuditRepository & Hard-Deletion Survival', () => {
    it('should save, list, paginate audit logs, and retain audit logs after conversation hard delete', async () => {
      if (!isDbAvailable) return;

      const conv = AiConversation.create({ tenantId: testTenant, userId: testUserId });
      await convRepo.save(conv);

      const auditLog1 = AiConversationAuditLog.create({
        tenantId: testTenant,
        conversationId: conv.id,
        conversationTitleSnapshot: 'Audited Physical Therapy Discussion 1',
        conversationOwnerUserId: testUserId,
        inspectorUserId,
        inspectorRole: 'CHIEF_MEDICAL_OFFICER',
        reason: 'Random quality assurance audit #1',
      });
      const auditLog2 = AiConversationAuditLog.create({
        tenantId: testTenant,
        conversationId: conv.id,
        conversationTitleSnapshot: 'Audited Physical Therapy Discussion 2',
        conversationOwnerUserId: testUserId,
        inspectorUserId,
        inspectorRole: 'CHIEF_MEDICAL_OFFICER',
        reason: 'Random quality assurance audit #2',
      });

      await auditRepo.save(auditLog1);
      await auditRepo.save(auditLog2);

      const byConv = await auditRepo.listByConversation(testTenant, conv.id);
      expect(byConv).toHaveLength(2);

      const byInspector = await auditRepo.listByInspector(testTenant, inspectorUserId);
      expect(byInspector.length).toBeGreaterThanOrEqual(2);

      // Test keyset paginated audit listing
      const auditPage1 = await auditRepo.listPaginated(testTenant, {
        conversationId: conv.id,
        limit: 1,
      });
      expect(auditPage1.items).toHaveLength(1);
      expect(auditPage1.hasMore).toBe(true);
      expect(auditPage1.nextCursor).toBeInstanceOf(AuditHistoryCursor);

      // HARD DELETE CONVERSATION: Verify audit records survive!
      await convRepo.hardDelete(testTenant, conv.id);
      const convAfterDelete = await convRepo.findById(testTenant, conv.id);
      expect(convAfterDelete).toBeNull();

      // Audit logs must still exist!
      const auditAfterDelete = await auditRepo.listByConversation(testTenant, conv.id);
      expect(auditAfterDelete).toHaveLength(2);
      expect(auditAfterDelete[0]?.inspectorUserId).toBe(inspectorUserId);
    });
  });

  describe('Transaction Client Compatibility', () => {
    it('should execute repository operations within a provided Prisma transaction client', async () => {
      if (!isDbAvailable) return;

      const txConv = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Transaction Scoped Consultation',
      });

      await prisma.$transaction(async (tx) => {
        const txConvRepo = convRepo.withTransaction(tx);
        const txTurnRepo = turnRepo.withTransaction(tx);

        const savedConv = await txConvRepo.save(txConv);
        expect(savedConv.id.value).toBe(txConv.id.value);

        const txTurn = AiConversationTurn.create({
          conversationId: txConv.id,
          tenantId: testTenant,
          turnIndex: 1,
          clientTurnId: `tx-client-turn-${Date.now()}`,
          idempotencyKey: `tx-turn-idemp-${Date.now()}`,
          idempotencyPayloadHash: 'tx-hash',
        });
        const savedTurn = await txTurnRepo.save(txTurn);
        expect(savedTurn.turnIndex).toBe(1);
      });

      // Confirm committed after transaction exits
      const committedConv = await convRepo.findById(testTenant, txConv.id);
      expect(committedConv).not.toBeNull();
      expect(committedConv?.title.value).toBe('Transaction Scoped Consultation');
    });

    it('should roll back repository writes when the caller transaction aborts', async () => {
      if (!isDbAvailable) return;

      const rollbackConv = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Aborted Conversation Should Rollback',
      });

      try {
        await prisma.$transaction(async (tx) => {
          const txConvRepo = convRepo.withTransaction(tx);
          await txConvRepo.save(rollbackConv);

          // Force transaction abort
          throw new Error('Simulated caller transaction failure');
        });
      } catch (err) {
        expect((err as Error).message).toBe('Simulated caller transaction failure');
      }

      // Assert rollback: record must NOT exist in the database
      const notFound = await convRepo.findById(testTenant, rollbackConv.id);
      expect(notFound).toBeNull();
    });
  });

  describe('PostgreSQL Strict Tenant Isolation Verification', () => {
    it('should prevent cross-tenant reads across all repositories', async () => {
      if (!isDbAvailable) return;

      const foreignTenant = `foreign_tenant_${Date.now()}`;

      const conv = AiConversation.create({
        tenantId: testTenant,
        userId: testUserId,
        title: 'Tenant Isolation Verification Consultation',
      });
      await convRepo.save(conv);

      const turn = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 1,
        clientTurnId: `client-turn-iso-${Date.now()}`,
        idempotencyKey: `idemp-iso-${Date.now()}`,
        idempotencyPayloadHash: 'hash-iso',
      });
      await turnRepo.save(turn);

      const msg = AiConversationMessage.create({
        turnId: turn.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 1,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Confidential clinical data belonging exclusively to testTenant',
      });
      await messageRepo.save(msg);

      const audit = AiConversationAuditLog.create({
        tenantId: testTenant,
        conversationId: conv.id,
        conversationTitleSnapshot: 'Tenant Isolation Consultation',
        conversationOwnerUserId: testUserId,
        inspectorUserId,
        inspectorRole: 'AUDITOR',
        reason: 'Tenant isolation inspection',
      });
      await auditRepo.save(audit);

      // 1. Cross-tenant conversation queries must return null or empty
      expect(await convRepo.findById(foreignTenant, conv.id)).toBeNull();
      expect(await convRepo.listByUser(foreignTenant, testUserId)).toEqual([]);
      const convPage = await convRepo.listByUserPaginated(foreignTenant, testUserId);
      expect(convPage.items).toEqual([]);

      // 2. Cross-tenant turn queries must return null
      expect(await turnRepo.findById(foreignTenant, conv.id, turn.id)).toBeNull();
      expect(await turnRepo.findByClientTurnId(foreignTenant, turn.clientTurnId)).toBeNull();
      expect(await turnRepo.findByTurnIndex(foreignTenant, conv.id, 1)).toBeNull();
      expect(await turnRepo.listByConversation(foreignTenant, conv.id)).toEqual([]);

      // 3. Cross-tenant message queries must return null or empty
      expect(await messageRepo.findById(foreignTenant, conv.id, msg.id)).toBeNull();
      expect(await messageRepo.findBySequenceNumber(foreignTenant, conv.id, 1)).toBeNull();
      expect(
        await messageRepo.findCanonicalAssistantMessage(foreignTenant, conv.id, turn.id),
      ).toBeNull();
      expect(await messageRepo.listByTurn(foreignTenant, conv.id, turn.id)).toEqual([]);
      const msgPage = await messageRepo.listCanonicalHistory(foreignTenant, conv.id);
      expect(msgPage.messages).toEqual([]);

      // 4. Cross-tenant audit queries must return empty
      expect(await auditRepo.listByConversation(foreignTenant, conv.id)).toEqual([]);
      expect(await auditRepo.listByInspector(foreignTenant, inspectorUserId)).toEqual([]);
      const auditPage = await auditRepo.listPaginated(foreignTenant, { conversationId: conv.id });
      expect(auditPage.items).toEqual([]);
    });

    it('should reject cross-tenant composite relational mutations via foreign keys', async () => {
      if (!isDbAvailable) return;

      const foreignTenant = `foreign_tenant_${Date.now()}`;

      // Create conversation in testTenant
      const conv = AiConversation.create({ tenantId: testTenant, userId: testUserId });
      await convRepo.save(conv);

      // Attempt to save a turn referencing conv.id but declaring foreignTenant
      const crossTenantTurn = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: foreignTenant,
        turnIndex: 1,
        clientTurnId: `cross-turn-${Date.now()}`,
        idempotencyKey: `cross-turn-${Date.now()}`,
        idempotencyPayloadHash: 'hash-cross',
      });

      // Composite foreign key (conversation_id, tenant_id) REFERENCES ai_conversations(id, tenant_id) must reject this!
      await expect(turnRepo.save(crossTenantTurn)).rejects.toThrow();
    });
  });

  describe('Comprehensive Message History Keyset Pagination Verification', () => {
    it('should traverse multi-page canonical history with zero duplicates and zero missing messages', async () => {
      if (!isDbAvailable) return;

      const conv = AiConversation.create({ tenantId: testTenant, userId: testUserId });
      await convRepo.save(conv);

      // Create 3 turns to respect uq_turn_single_user_message (1 user message per turn)
      const turn1 = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 1,
        clientTurnId: `pag-turn-1-${Date.now()}`,
        idempotencyKey: `pag-turn-1-${Date.now()}`,
        idempotencyPayloadHash: 'hash-pag-1',
      });
      const turn2 = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 2,
        clientTurnId: `pag-turn-2-${Date.now()}`,
        idempotencyKey: `pag-turn-2-${Date.now()}`,
        idempotencyPayloadHash: 'hash-pag-2',
      });
      const turn3 = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId: testTenant,
        turnIndex: 3,
        clientTurnId: `pag-turn-3-${Date.now()}`,
        idempotencyKey: `pag-turn-3-${Date.now()}`,
        idempotencyPayloadHash: 'hash-pag-3',
      });
      await turnRepo.save(turn1);
      await turnRepo.save(turn2);
      await turnRepo.save(turn3);

      // Create 5 sequential canonical messages:
      // Turn 1: msg1 (USER, seq 1), msg2 (ASSISTANT canonical, seq 2)
      // Turn 2: msg3 (USER, seq 3), msg4 (ASSISTANT canonical, seq 4)
      // Turn 3: msg5 (USER, seq 5)
      const msg1 = AiConversationMessage.create({
        turnId: turn1.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.USER,
        sequenceNumber: 1,
        content: 'Prompt 1',
      });
      const msg2 = AiConversationMessage.create({
        turnId: turn1.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Response 1',
      });
      const msg3 = AiConversationMessage.create({
        turnId: turn2.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.USER,
        sequenceNumber: 3,
        content: 'Prompt 2',
      });
      const msg4 = AiConversationMessage.create({
        turnId: turn2.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 4,
        isCanonical: true,
        status: GenerationStatus.SUCCESS,
        content: 'Response 2',
      });
      const msg5 = AiConversationMessage.create({
        turnId: turn3.id,
        conversationId: conv.id,
        tenantId: testTenant,
        role: ConversationRole.USER,
        sequenceNumber: 5,
        content: 'Prompt 3',
      });

      await messageRepo.save(msg1);
      await messageRepo.save(msg2);
      await messageRepo.save(msg3);
      await messageRepo.save(msg4);
      await messageRepo.save(msg5);

      // Page size 2: Page 1 -> [1, 2]
      const p1 = await messageRepo.listCanonicalHistory(testTenant, conv.id, { limit: 2 });
      expect(p1.messages).toHaveLength(2);
      expect(p1.messages[0]?.sequenceNumber).toBe(1);
      expect(p1.messages[1]?.sequenceNumber).toBe(2);
      expect(p1.hasMore).toBe(true);
      expect(p1.nextCursor).not.toBeNull();

      // Page 2 -> [3, 4]
      const p2 = await messageRepo.listCanonicalHistory(testTenant, conv.id, {
        limit: 2,
        cursor: p1.nextCursor,
      });
      expect(p2.messages).toHaveLength(2);
      expect(p2.messages[0]?.sequenceNumber).toBe(3);
      expect(p2.messages[1]?.sequenceNumber).toBe(4);
      expect(p2.hasMore).toBe(true);
      expect(p2.nextCursor).not.toBeNull();

      // Page 3 -> [5]
      const p3 = await messageRepo.listCanonicalHistory(testTenant, conv.id, {
        limit: 2,
        cursor: p2.nextCursor,
      });
      expect(p3.messages).toHaveLength(1);
      expect(p3.messages[0]?.sequenceNumber).toBe(5);
      expect(p3.hasMore).toBe(false);
      expect(p3.nextCursor).toBeNull();

      // Verify zero duplicates and full completeness across all retrieved pages
      const allSequences = [
        ...p1.messages.map((m) => m.sequenceNumber),
        ...p2.messages.map((m) => m.sequenceNumber),
        ...p3.messages.map((m) => m.sequenceNumber),
      ];
      expect(allSequences).toEqual([1, 2, 3, 4, 5]);
      const uniqueSequences = Array.from(new Set(allSequences));
      expect(uniqueSequences).toHaveLength(5);
    });
  });
});
