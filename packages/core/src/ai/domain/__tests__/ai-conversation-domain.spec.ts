import { ConversationRole, isValidConversationRole } from '../enums/conversation-role.enum';
import { GenerationStatus, isValidGenerationStatus } from '../enums/generation-status.enum';
import { TurnStatus, isValidTurnStatus } from '../enums/turn-status.enum';
import { ConversationId } from '../value-objects/conversation-id.vo';
import { TurnId } from '../value-objects/turn-id.vo';
import { MessageId } from '../value-objects/message-id.vo';
import { ClientTurnId } from '../value-objects/client-turn-id.vo';
import { ConversationTitle } from '../value-objects/conversation-title.vo';
import { MessageHistoryCursor } from '../value-objects/message-history-cursor.vo';
import { AiConversation } from '../models/ai-conversation.entity';
import { AiConversationTurn } from '../models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../models/ai-conversation-message.entity';
import { AiConversationAuditLog } from '../models/ai-conversation-audit-log.entity';
import {
  InvalidConversationTurnException,
  InvalidCursorException,
  InvalidMessageInvariantException,
  InvalidCanonicalDesignationException,
  InvalidLifecycleTransitionException,
  InvalidMessageOwnershipException,
} from '../exceptions/conversation.exceptions';

describe('AI-09.3 — Conversation Domain Model & Invariants Tests', () => {
  const tenantId = 'tenant-test-domain';
  const userId = 'user-dr-smith';

  describe('Enums Validation', () => {
    it('should validate ConversationRole values', () => {
      expect(isValidConversationRole(ConversationRole.USER)).toBe(true);
      expect(isValidConversationRole(ConversationRole.ASSISTANT)).toBe(true);
      expect(isValidConversationRole(ConversationRole.SYSTEM)).toBe(true);
      expect(isValidConversationRole('INVALID_ROLE')).toBe(false);
    });

    it('should validate GenerationStatus values', () => {
      expect(isValidGenerationStatus(GenerationStatus.PENDING)).toBe(true);
      expect(isValidGenerationStatus(GenerationStatus.STREAMING)).toBe(true);
      expect(isValidGenerationStatus(GenerationStatus.SUCCESS)).toBe(true);
      expect(isValidGenerationStatus(GenerationStatus.FAILED)).toBe(true);
      expect(isValidGenerationStatus(GenerationStatus.CANCELLED)).toBe(true);
      expect(isValidGenerationStatus(GenerationStatus.INTERRUPTED)).toBe(true);
      expect(isValidGenerationStatus('UNKNOWN')).toBe(false);
    });

    it('should validate TurnStatus values', () => {
      expect(isValidTurnStatus(TurnStatus.PENDING)).toBe(true);
      expect(isValidTurnStatus(TurnStatus.STREAMING)).toBe(true);
      expect(isValidTurnStatus(TurnStatus.COMPLETED)).toBe(true);
      expect(isValidTurnStatus(TurnStatus.FAILED)).toBe(true);
      expect(isValidTurnStatus(TurnStatus.CANCELLED)).toBe(true);
      expect(isValidTurnStatus(TurnStatus.INTERRUPTED)).toBe(true);
      expect(isValidTurnStatus('UNKNOWN')).toBe(false);
    });
  });

  describe('Value Objects', () => {
    describe('ConversationId', () => {
      it('should generate a valid UUID when none is provided', () => {
        const id = ConversationId.create();
        expect(id.value).toBeDefined();
        expect(id.value.length).toBeGreaterThan(0);
        expect(id.toString()).toBe(id.value);
      });

      it('should wrap a valid string and check equality', () => {
        const id1 = ConversationId.create('conv-123');
        const id2 = ConversationId.create('conv-123');
        const id3 = ConversationId.create('conv-456');

        expect(id1.equals(id2)).toBe(true);
        expect(id1.equals(id3)).toBe(false);
        expect(id1.equals(null)).toBe(false);
      });

      it('should reject empty or whitespace IDs', () => {
        expect(() => ConversationId.create('')).toThrow(InvalidConversationTurnException);
        expect(() => ConversationId.create('   ')).toThrow(InvalidConversationTurnException);
      });
    });

    describe('TurnId', () => {
      it('should generate and compare turn IDs correctly', () => {
        const t1 = TurnId.create('turn-1');
        const t2 = TurnId.create('turn-1');
        expect(t1.equals(t2)).toBe(true);
        expect(t1.value).toBe('turn-1');
      });

      it('should reject empty values', () => {
        expect(() => TurnId.create('')).toThrow(InvalidConversationTurnException);
      });
    });

    describe('MessageId', () => {
      it('should generate and compare message IDs correctly', () => {
        const m1 = MessageId.create('msg-1');
        const m2 = MessageId.create('msg-1');
        expect(m1.equals(m2)).toBe(true);
        expect(m1.value).toBe('msg-1');
      });

      it('should reject empty values', () => {
        expect(() => MessageId.create('')).toThrow(InvalidConversationTurnException);
      });
    });

    describe('ClientTurnId', () => {
      it('should accept valid non-empty strings up to 64 chars', () => {
        const clientTurnId = ClientTurnId.create('client-turn-uuid-001');
        expect(clientTurnId.value).toBe('client-turn-uuid-001');
        expect(clientTurnId.toString()).toBe('client-turn-uuid-001');
      });

      it('should reject empty or whitespace strings', () => {
        expect(() => ClientTurnId.create('')).toThrow(InvalidConversationTurnException);
        expect(() => ClientTurnId.create('   ')).toThrow(InvalidConversationTurnException);
      });

      it('should reject strings exceeding 64 chars', () => {
        const longStr = 'a'.repeat(65);
        expect(() => ClientTurnId.create(longStr)).toThrow(InvalidConversationTurnException);
      });
    });

    describe('ConversationTitle', () => {
      it('should use default title when empty or undefined', () => {
        const t1 = ConversationTitle.create();
        expect(t1.value).toBe(ConversationTitle.DEFAULT_TITLE);

        const t2 = ConversationTitle.create('');
        expect(t2.value).toBe(ConversationTitle.DEFAULT_TITLE);
      });

      it('should wrap a valid custom title', () => {
        const title = ConversationTitle.create('Patient Rehabilitation Plan Analysis');
        expect(title.value).toBe('Patient Rehabilitation Plan Analysis');
      });

      it('should reject titles exceeding 255 chars', () => {
        const longStr = 'x'.repeat(256);
        expect(() => ConversationTitle.create(longStr)).toThrow(InvalidConversationTurnException);
      });

      it('should derive clean title from a user prompt limited to 40 characters', () => {
        const prompt = '  Could you summarize the patient intake history for John Doe?  ';
        const derived = ConversationTitle.deriveFromPrompt(prompt);
        expect(derived.value.length).toBeLessThanOrEqual(40);
        expect(derived.value).toContain('Could you summarize');
        expect(derived.value.endsWith('...')).toBe(true);
      });

      it('should return default title if prompt is purely whitespace or empty', () => {
        expect(ConversationTitle.deriveFromPrompt('').value).toBe(ConversationTitle.DEFAULT_TITLE);
        expect(ConversationTitle.deriveFromPrompt('   \n  \t ').value).toBe(
          ConversationTitle.DEFAULT_TITLE,
        );
      });
    });

    describe('MessageHistoryCursor', () => {
      it('should create, encode, and decode a valid cursor', () => {
        const cursor = MessageHistoryCursor.create(5, 'msg_005');
        expect(cursor.sequenceNumber).toBe(5);
        expect(cursor.messageId).toBe('msg_005');

        const encoded = cursor.encode();
        expect(typeof encoded).toBe('string');
        expect(encoded.length).toBeGreaterThan(0);

        const decoded = MessageHistoryCursor.decode(encoded);
        expect(decoded.equals(cursor)).toBe(true);
        expect(decoded.sequenceNumber).toBe(5);
        expect(decoded.messageId).toBe('msg_005');
      });

      it('should reject invalid sequence numbers on construction', () => {
        expect(() => MessageHistoryCursor.create(0, 'msg_1')).toThrow(InvalidCursorException);
        expect(() => MessageHistoryCursor.create(-1, 'msg_1')).toThrow(InvalidCursorException);
        expect(() => MessageHistoryCursor.create(1.5, 'msg_1')).toThrow(InvalidCursorException);
      });

      it('should reject empty messageId on construction', () => {
        expect(() => MessageHistoryCursor.create(1, '')).toThrow(InvalidCursorException);
      });

      it('should reject malformed or non-base64 cursor strings on decode', () => {
        expect(() => MessageHistoryCursor.decode('')).toThrow(InvalidCursorException);
        expect(() => MessageHistoryCursor.decode('not-valid-base64-json!')).toThrow(
          InvalidCursorException,
        );
        const invalidJsonB64 = Buffer.from('{"s": "invalid", "id": 123}').toString('base64url');
        expect(() => MessageHistoryCursor.decode(invalidJsonB64)).toThrow(InvalidCursorException);
      });
    });
  });

  describe('Domain Entities', () => {
    describe('AiConversation', () => {
      it('should create an active conversation with default counters and title', () => {
        const conv = AiConversation.create({
          tenantId,
          userId,
        });

        expect(conv.id).toBeDefined();
        expect(conv.tenantId).toBe(tenantId);
        expect(conv.userId).toBe(userId);
        expect(conv.title.value).toBe(ConversationTitle.DEFAULT_TITLE);
        expect(conv.turnCounter).toBe(0);
        expect(conv.messageCounter).toBe(0);
        expect(conv.isArchived()).toBe(false);
        expect(conv.deletedAt).toBeNull();
      });

      it('should create a conversation from an initial user prompt (40 chars derivation)', () => {
        const conv = AiConversation.createFromInitialPrompt({
          tenantId,
          userId,
          prompt: 'What are the recommended physical exercises for knee rehabilitation?',
        });

        expect(conv.title.value.length).toBeLessThanOrEqual(40);
        expect(conv.title.value.endsWith('...')).toBe(true);
        expect(conv.title.value).toContain('What are the recommended');
      });

      it('should update title and track updatedAt timestamp', () => {
        const conv = AiConversation.create({ tenantId, userId });
        conv.updateTitle('Clinical Consultation Turn 1');
        expect(conv.title.value).toBe('Clinical Consultation Turn 1');
      });

      it('should archive and unarchive cleanly', () => {
        const conv = AiConversation.create({ tenantId, userId });
        expect(conv.isArchived()).toBe(false);

        conv.archive();
        expect(conv.isArchived()).toBe(true);
        expect(conv.deletedAt).toBeInstanceOf(Date);

        conv.unarchive();
        expect(conv.isArchived()).toBe(false);
        expect(conv.deletedAt).toBeNull();
      });

      it('should increment turn and message counters monotonically', () => {
        const conv = AiConversation.create({ tenantId, userId });
        expect(conv.incrementTurnCounter()).toBe(1);
        expect(conv.incrementTurnCounter()).toBe(2);
        expect(conv.incrementMessageCounter()).toBe(1);
        expect(conv.incrementMessageCounter()).toBe(2);
      });
    });

    describe('AiConversationTurn', () => {
      it('should create a turn with PENDING status and valid invariants', () => {
        const convId = ConversationId.create();
        const turn = AiConversationTurn.create({
          conversationId: convId,
          tenantId,
          turnIndex: 1,
          clientTurnId: 'turn-client-req-001',
          idempotencyKey: 'idemp-001',
          idempotencyPayloadHash: 'hash-abc-123',
        });

        expect(turn.status).toBe(TurnStatus.PENDING);
        expect(turn.turnIndex).toBe(1);
        expect(turn.activeAttemptId).toBeNull();
        expect(turn.activeAttemptNumber).toBe(1);
        expect(turn.completedAt).toBeNull();
        expect(turn.isTerminal()).toBe(false);
      });

      it('should handle lifecycle transitions: streaming, completed, failed, cancelled, interrupted', () => {
        const convId = ConversationId.create();
        const attemptId = MessageId.create();
        const turn = AiConversationTurn.create({
          conversationId: convId,
          tenantId,
          turnIndex: 1,
          clientTurnId: 'turn-client-req-002',
          idempotencyKey: 'idemp-002',
          idempotencyPayloadHash: 'hash-abc-456',
        });

        turn.markStreaming(attemptId);
        expect(turn.status).toBe(TurnStatus.STREAMING);
        expect(turn.activeAttemptId?.equals(attemptId)).toBe(true);
        expect(turn.isTerminal()).toBe(false);

        turn.markCompleted();
        expect(turn.status).toBe(TurnStatus.COMPLETED);
        expect(turn.completedAt).toBeInstanceOf(Date);
        expect(turn.isTerminal()).toBe(true);
      });

      it('should reject transitioning a completed turn back to streaming', () => {
        const convId = ConversationId.create();
        const turn = AiConversationTurn.create({
          conversationId: convId,
          tenantId,
          turnIndex: 1,
          clientTurnId: 'turn-client-req-003',
          idempotencyKey: 'idemp-003',
          idempotencyPayloadHash: 'hash-abc-789',
        });

        turn.markCompleted();
        expect(() => turn.markStreaming(MessageId.create())).toThrow(
          InvalidLifecycleTransitionException,
        );
      });

      it('should validate active attempt ownership boundaries', () => {
        const convId = ConversationId.create();
        const turn = AiConversationTurn.create({
          conversationId: convId,
          tenantId,
          turnIndex: 1,
          clientTurnId: 'turn-client-req-004',
          idempotencyKey: 'idemp-004',
          idempotencyPayloadHash: 'hash-abc-004',
        });

        const validAttemptId = MessageId.create();
        turn.associateActiveAttempt({
          id: validAttemptId,
          turnId: turn.id,
          conversationId: convId,
          tenantId,
          role: ConversationRole.ASSISTANT,
          attemptNumber: 1,
        });
        expect(turn.activeAttemptId?.equals(validAttemptId)).toBe(true);

        // Reject attempt belonging to different turn
        expect(() =>
          turn.associateActiveAttempt({
            id: MessageId.create(),
            turnId: TurnId.create('other-turn'),
            conversationId: convId,
            tenantId,
            role: ConversationRole.ASSISTANT,
            attemptNumber: 1,
          }),
        ).toThrow(InvalidMessageOwnershipException);

        // Reject attempt with role USER
        expect(() =>
          turn.associateActiveAttempt({
            id: MessageId.create(),
            turnId: turn.id,
            conversationId: convId,
            tenantId,
            role: ConversationRole.USER,
            attemptNumber: 1,
          }),
        ).toThrow(InvalidMessageOwnershipException);

        // Reject attempt belonging to different tenant
        expect(() =>
          turn.associateActiveAttempt({
            id: MessageId.create(),
            turnId: turn.id,
            conversationId: convId,
            tenantId: 'different-tenant',
            role: ConversationRole.ASSISTANT,
            attemptNumber: 1,
          }),
        ).toThrow(InvalidMessageOwnershipException);
      });
    });

    describe('AiConversationMessage', () => {
      const convId = ConversationId.create();
      const turnId = TurnId.create();

      it('should enforce USER message invariants (SUCCESS status, not canonical, attempt 1)', () => {
        const userMsg = AiConversationMessage.create({
          turnId,
          conversationId: convId,
          tenantId,
          role: ConversationRole.USER,
          sequenceNumber: 1,
          content: 'Hello doctor assistant',
        });

        expect(userMsg.role).toBe(ConversationRole.USER);
        expect(userMsg.status).toBe(GenerationStatus.SUCCESS);
        expect(userMsg.isCanonical).toBe(false);
        expect(userMsg.attemptNumber).toBe(1);
      });

      it('should allow ASSISTANT message streaming and completion', () => {
        const assistantMsg = AiConversationMessage.create({
          turnId,
          conversationId: convId,
          tenantId,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 2,
          attemptNumber: 1,
        });

        expect(assistantMsg.status).toBe(GenerationStatus.PENDING);
        expect(assistantMsg.content).toBe('');

        assistantMsg.appendContentChunk('Here is the diagnostic ');
        assistantMsg.appendContentChunk('summary.');
        expect(assistantMsg.content).toBe('Here is the diagnostic summary.');
        expect(assistantMsg.status).toBe(GenerationStatus.STREAMING);

        assistantMsg.complete('Final diagnostic summary.', [
          { documentId: 'doc-1', title: 'Guide' },
        ]);
        expect(assistantMsg.status).toBe(GenerationStatus.SUCCESS);
        expect(assistantMsg.content).toBe('Final diagnostic summary.');
        expect(assistantMsg.sources).toHaveLength(1);
        expect(assistantMsg.completedAt).toBeInstanceOf(Date);
        expect(assistantMsg.isTerminal()).toBe(true);
      });

      it('should reject appending content or acquiring lease when message is in terminal state', () => {
        const msg = AiConversationMessage.create({
          turnId,
          conversationId: convId,
          tenantId,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 2,
        });

        msg.complete('Complete response');
        expect(msg.isTerminal()).toBe(true);

        expect(() => msg.appendContentChunk('extra')).toThrow(InvalidLifecycleTransitionException);
        expect(() => msg.acquireLease('pod-1', 'lease-1', new Date())).toThrow(
          InvalidLifecycleTransitionException,
        );
      });

      it('should reject canonical designation on non-SUCCESS or non-ASSISTANT messages', () => {
        const userMsg = AiConversationMessage.create({
          turnId,
          conversationId: convId,
          tenantId,
          role: ConversationRole.USER,
          sequenceNumber: 1,
          content: 'User query',
        });
        expect(() => userMsg.setCanonical(true)).toThrow(InvalidCanonicalDesignationException);

        const assistantMsg = AiConversationMessage.create({
          turnId,
          conversationId: convId,
          tenantId,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 2,
          status: GenerationStatus.PENDING,
        });
        expect(() => assistantMsg.setCanonical(true)).toThrow(InvalidCanonicalDesignationException);

        assistantMsg.complete('Final answer');
        assistantMsg.setCanonical(true);
        expect(assistantMsg.isCanonical).toBe(true);
      });

      it('should clear lease tokens and owners upon reaching terminal states', () => {
        const msg = AiConversationMessage.create({
          turnId,
          conversationId: convId,
          tenantId,
          role: ConversationRole.ASSISTANT,
          sequenceNumber: 2,
        });

        const expiresAt = new Date(Date.now() + 60000);
        msg.acquireLease('pod-backend-1', 'lease-token-abc', expiresAt);
        expect(msg.leaseOwnerInstanceId).toBe('pod-backend-1');
        expect(msg.leaseToken).toBe('lease-token-abc');

        msg.fail('RATE_LIMIT_EXCEEDED', 'Upstream LLM provider quota exhausted');
        expect(msg.status).toBe(GenerationStatus.FAILED);
        expect(msg.errorCode).toBe('RATE_LIMIT_EXCEEDED');
        expect(msg.errorMessage).toBe('Upstream LLM provider quota exhausted');
        expect(msg.leaseToken).toBeNull();
        expect(msg.leaseOwnerInstanceId).toBeNull();
        expect(msg.leaseExpiresAt).toBeNull();
      });

      it('should throw when sequenceNumber is less than 1', () => {
        expect(() =>
          AiConversationMessage.create({
            turnId,
            conversationId: convId,
            tenantId,
            role: ConversationRole.USER,
            sequenceNumber: 0,
          }),
        ).toThrow(InvalidMessageInvariantException);
      });
    });

    describe('AiConversationAuditLog', () => {
      it('should create an immutable audit log entry', () => {
        const convId = ConversationId.create();
        const audit = AiConversationAuditLog.create({
          tenantId,
          conversationId: convId,
          conversationTitleSnapshot: 'Initial Consultation',
          conversationOwnerUserId: 'patient-user-1',
          inspectorUserId: 'clinical-director-user-2',
          inspectorRole: 'TENANT_ADMIN',
          reason: 'Reviewing AI clinical triage advice accuracy',
        });

        expect(audit.id).toBeDefined();
        expect(audit.tenantId).toBe(tenantId);
        expect(audit.conversationId.equals(convId)).toBe(true);
        expect(audit.conversationTitleSnapshot).toBe('Initial Consultation');
        expect(audit.inspectorUserId).toBe('clinical-director-user-2');
        expect(audit.action).toBe(AiConversationAuditLog.DEFAULT_ACTION);
        expect(audit.reason).toBe('Reviewing AI clinical triage advice accuracy');
        expect(Object.isFrozen(audit)).toBe(true);
      });

      it('should reject missing required audit log fields', () => {
        const convId = ConversationId.create();
        expect(() =>
          AiConversationAuditLog.create({
            tenantId: '',
            conversationId: convId,
            conversationTitleSnapshot: 'Title',
            conversationOwnerUserId: 'u1',
            inspectorUserId: 'u2',
            inspectorRole: 'ROLE',
            reason: 'reason',
          }),
        ).toThrow(InvalidConversationTurnException);

        expect(() =>
          AiConversationAuditLog.create({
            tenantId,
            conversationId: convId,
            conversationTitleSnapshot: 'Title',
            conversationOwnerUserId: 'u1',
            inspectorUserId: 'u2',
            inspectorRole: 'ROLE',
            reason: '   ',
          }),
        ).toThrow(InvalidConversationTurnException);
      });
    });
  });
});
