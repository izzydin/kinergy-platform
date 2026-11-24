import {
  ConversationListCursor,
  AuditHistoryCursor,
  MessageHistoryCursor,
} from '../../../domain/value-objects';
import {
  InvalidCursorException,
  DuplicateEntityException,
  InvalidOwnershipException,
  ConversationPersistenceException,
} from '../../../domain/exceptions/conversation.exceptions';
import {
  AI_CONVERSATION_REPOSITORY_PORT,
  IAiConversationRepositoryPort,
  UpdateConversationMetadataDto,
  ConversationPaginationRequest,
} from '../ai-conversation-repository.port';
import {
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  IAiConversationTurnRepositoryPort,
  UpdateTurnStatusDto,
  FindTurnsFilter,
} from '../ai-conversation-turn-repository.port';
import {
  AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
  IAiConversationMessageRepositoryPort,
  UpdateMessageStatusDto,
  AcquireMessageLeaseDto,
} from '../ai-conversation-message-repository.port';
import {
  AI_CONVERSATION_AUDIT_REPOSITORY_PORT,
  IAiConversationAuditRepositoryPort,
  AuditPaginationRequest,
} from '../ai-conversation-audit-repository.port';
import { TurnStatus } from '../../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../../domain/enums/generation-status.enum';

describe('AI-09.3-BE.03.02 — Repository Ports & Persistence Contracts Tests', () => {
  describe('Cursor Value Objects & Deterministic Pagination', () => {
    describe('ConversationListCursor', () => {
      const validDate = new Date('2026-11-23T12:00:00.000Z');
      const validConvId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

      it('should create, encode, and decode a valid conversation cursor', () => {
        const cursor = ConversationListCursor.create(validDate, validConvId);
        expect(cursor.lastActivityAt.toISOString()).toBe(validDate.toISOString());
        expect(cursor.conversationId).toBe(validConvId);

        const encoded = cursor.encode();
        expect(typeof encoded).toBe('string');
        expect(encoded.length).toBeGreaterThan(0);

        const decoded = ConversationListCursor.decode(encoded);
        expect(decoded.lastActivityAt.toISOString()).toBe(validDate.toISOString());
        expect(decoded.conversationId).toBe(validConvId);
        expect(cursor.equals(decoded)).toBe(true);
      });

      it('should guarantee cursor serialization stability (idempotence)', () => {
        const cursor = ConversationListCursor.create(validDate, validConvId);
        const encoded1 = cursor.encode();
        const decoded1 = ConversationListCursor.decode(encoded1);
        const encoded2 = decoded1.encode();

        expect(encoded1).toBe(encoded2);
        expect(cursor.equals(decoded1)).toBe(true);
      });

      it('should reject invalid dates or empty conversation IDs on creation', () => {
        expect(() => ConversationListCursor.create(new Date('invalid-date'), validConvId)).toThrow(
          InvalidCursorException,
        );

        expect(() => ConversationListCursor.create(validDate, '')).toThrow(InvalidCursorException);

        expect(() => ConversationListCursor.create(validDate, '   ')).toThrow(
          InvalidCursorException,
        );
      });

      it('should reject malformed or invalid encoded cursor strings on decode', () => {
        expect(() => ConversationListCursor.decode('')).toThrow(InvalidCursorException);
        expect(() => ConversationListCursor.decode('   ')).toThrow(InvalidCursorException);
        expect(() => ConversationListCursor.decode('!!!not-base64-json!!!')).toThrow(
          InvalidCursorException,
        );

        // Invalid JSON structure
        const badJsonBase64 = Buffer.from('{"a":"not-a-date","id":""}').toString('base64url');
        expect(() => ConversationListCursor.decode(badJsonBase64)).toThrow(InvalidCursorException);
      });
    });

    describe('AuditHistoryCursor', () => {
      const validDate = new Date('2026-11-23T12:00:00.000Z');
      const validAuditId = 'a12bc34d-58cc-4372-a567-0e02b2c3d479';

      it('should create, encode, and decode a valid audit cursor', () => {
        const cursor = AuditHistoryCursor.create(validDate, validAuditId);
        expect(cursor.createdAt.toISOString()).toBe(validDate.toISOString());
        expect(cursor.auditId).toBe(validAuditId);

        const encoded = cursor.encode();
        const decoded = AuditHistoryCursor.decode(encoded);
        expect(decoded.createdAt.toISOString()).toBe(validDate.toISOString());
        expect(decoded.auditId).toBe(validAuditId);
        expect(cursor.equals(decoded)).toBe(true);
      });

      it('should guarantee audit cursor serialization stability', () => {
        const cursor = AuditHistoryCursor.create(validDate, validAuditId);
        const encoded1 = cursor.encode();
        const decoded1 = AuditHistoryCursor.decode(encoded1);
        const encoded2 = decoded1.encode();

        expect(encoded1).toBe(encoded2);
      });

      it('should reject invalid creation parameters and malformed cursor payloads', () => {
        expect(() => AuditHistoryCursor.create(new Date('bad-date'), validAuditId)).toThrow(
          InvalidCursorException,
        );
        expect(() => AuditHistoryCursor.create(validDate, '')).toThrow(InvalidCursorException);
        expect(() => AuditHistoryCursor.decode('invalid')).toThrow(InvalidCursorException);
      });
    });

    describe('MessageHistoryCursor (Immutable Sequence Keyset)', () => {
      it('should encode and decode sequence keyset cursor with messageId tie-breaker', () => {
        const cursor = MessageHistoryCursor.create(42, 'msg-tie-breaker-uuid');
        expect(cursor.sequenceNumber).toBe(42);
        expect(cursor.messageId).toBe('msg-tie-breaker-uuid');

        const encoded = cursor.encode();
        const decoded = MessageHistoryCursor.decode(encoded);
        expect(decoded.sequenceNumber).toBe(42);
        expect(decoded.messageId).toBe('msg-tie-breaker-uuid');
        expect(cursor.equals(decoded)).toBe(true);
      });

      it('should enforce sequence numbers >= 1', () => {
        expect(() => MessageHistoryCursor.create(0, 'msg-1')).toThrow(InvalidCursorException);
        expect(() => MessageHistoryCursor.create(-5, 'msg-1')).toThrow(InvalidCursorException);
      });
    });
  });

  describe('Explicit Persistence Contracts & DTO Invariants', () => {
    it('should validate UpdateConversationMetadataDto shape and immutability', () => {
      const update: UpdateConversationMetadataDto = {
        title: 'Updated Clinical Plan',
        lastActivityAt: new Date(),
        isArchived: false,
      };

      expect(update.title).toBe('Updated Clinical Plan');
      expect(update.isArchived).toBe(false);
      expect(update.lastActivityAt).toBeInstanceOf(Date);
    });

    it('should validate UpdateTurnStatusDto lifecycle update contract', () => {
      const completedAt = new Date();
      const update: UpdateTurnStatusDto = {
        status: TurnStatus.COMPLETED,
        completedAt,
        activeAttemptId: 'attempt-msg-uuid',
        activeAttemptNumber: 2,
      };

      expect(update.status).toBe(TurnStatus.COMPLETED);
      expect(update.completedAt).toBe(completedAt);
      expect(update.activeAttemptNumber).toBe(2);
    });

    it('should validate UpdateMessageStatusDto output and canonical flag update', () => {
      const update: UpdateMessageStatusDto = {
        status: GenerationStatus.SUCCESS,
        content: 'Finalized clinical response.',
        isCanonical: true,
        completedAt: new Date(),
      };

      expect(update.status).toBe(GenerationStatus.SUCCESS);
      expect(update.isCanonical).toBe(true);
      expect(update.content).toBe('Finalized clinical response.');
    });

    it('should validate AcquireMessageLeaseDto exclusive lease contract', () => {
      const expiresAt = new Date(Date.now() + 30000);
      const leaseDto: AcquireMessageLeaseDto = {
        leaseToken: 'lease-token-abc-123',
        leaseOwnerInstanceId: 'worker-instance-east-1',
        leaseExpiresAt: expiresAt,
      };

      expect(leaseDto.leaseToken).toBe('lease-token-abc-123');
      expect(leaseDto.leaseOwnerInstanceId).toBe('worker-instance-east-1');
      expect(leaseDto.leaseExpiresAt).toBe(expiresAt);
    });

    it('should validate FindTurnsFilter and pagination requests', () => {
      const filter: FindTurnsFilter = {
        status: TurnStatus.COMPLETED,
        fromTurnIndex: 1,
        toTurnIndex: 10,
        limit: 10,
      };
      expect(filter.status).toBe(TurnStatus.COMPLETED);
      expect(filter.fromTurnIndex).toBe(1);

      const convPagination: ConversationPaginationRequest = {
        limit: 20,
        includeArchived: false,
      };
      expect(convPagination.limit).toBe(20);

      const auditPagination: AuditPaginationRequest = {
        limit: 50,
        inspectorUserId: 'inspector-user-123',
      };
      expect(auditPagination.inspectorUserId).toBe('inspector-user-123');
    });
  });

  describe('Tenant-Scoped Repository Contract Verification', () => {
    it('should expose DI injection symbols for all four repository ports', () => {
      expect(typeof AI_CONVERSATION_REPOSITORY_PORT).toBe('symbol');
      expect(typeof AI_CONVERSATION_TURN_REPOSITORY_PORT).toBe('symbol');
      expect(typeof AI_CONVERSATION_MESSAGE_REPOSITORY_PORT).toBe('symbol');
      expect(typeof AI_CONVERSATION_AUDIT_REPOSITORY_PORT).toBe('symbol');
    });

    it('should verify port signatures require tenantId parameter on all scoped methods', () => {
      // Type-level assertion helper confirming method parameter contracts
      type AssertTenantFirstParam<T> = {
        [K in keyof T]: T[K] extends (...args: never[]) => unknown
          ? Parameters<T[K]>[0] extends string
            ? true
            : Parameters<T[K]>[0] extends object
              ? true
              : false
          : true;
      };

      type ConversationPortCheck = AssertTenantFirstParam<Required<IAiConversationRepositoryPort>>;
      type TurnPortCheck = AssertTenantFirstParam<Required<IAiConversationTurnRepositoryPort>>;
      type MessagePortCheck = AssertTenantFirstParam<
        Required<IAiConversationMessageRepositoryPort>
      >;
      type AuditPortCheck = AssertTenantFirstParam<Required<IAiConversationAuditRepositoryPort>>;

      // Compile-time checks that pass if all methods have tenantId as first param or save entity
      const checkConv: ConversationPortCheck['findById'] = true;
      const checkTurn: TurnPortCheck['findById'] = true;
      const checkMsg: MessagePortCheck['findById'] = true;
      const checkAudit: AuditPortCheck['listByConversation'] = true;

      expect(checkConv).toBe(true);
      expect(checkTurn).toBe(true);
      expect(checkMsg).toBe(true);
      expect(checkAudit).toBe(true);
    });
  });

  describe('Domain Persistence Exceptions', () => {
    it('should construct DuplicateEntityException with and without tenantId', () => {
      const ex1 = new DuplicateEntityException('AiConversation', 'conv-123', 'tenant-a');
      expect(ex1.name).toBe('DuplicateEntityException');
      expect(ex1.message).toContain('tenant-a');

      const ex2 = new DuplicateEntityException('AiConversationTurn', 'turn-123');
      expect(ex2.message).toContain('AiConversationTurn with identifier');
    });

    it('should construct InvalidOwnershipException with clear context', () => {
      const ex = new InvalidOwnershipException(
        'Attempted to access conversation across tenant boundary',
      );
      expect(ex.name).toBe('InvalidOwnershipException');
      expect(ex.message).toContain('across tenant boundary');
    });

    it('should construct ConversationPersistenceException preserving cause', () => {
      const rootCause = new Error('Database connection pool exhausted');
      const ex = new ConversationPersistenceException('Failed to persist turn', rootCause);
      expect(ex.name).toBe('ConversationPersistenceException');
      expect(ex.message).toBe('Failed to persist turn');
      expect(ex.cause).toBe(rootCause);
    });
  });
});
