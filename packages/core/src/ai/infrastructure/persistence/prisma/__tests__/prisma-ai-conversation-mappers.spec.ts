import {
  GenerationStatus as PrismaGenerationStatus,
  TurnStatus as PrismaTurnStatus,
  Prisma,
} from '@prisma/client';
import { PrismaAiConversationMapper } from '../mappers/prisma-ai-conversation.mapper';
import { PrismaAiConversationTurnMapper } from '../mappers/prisma-ai-conversation-turn.mapper';
import { PrismaAiConversationMessageMapper } from '../mappers/prisma-ai-conversation-message.mapper';
import { PrismaAiConversationAuditMapper } from '../mappers/prisma-ai-conversation-audit.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';
import { AiConversation } from '../../../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../../../domain/models/ai-conversation-turn.entity';
import { AiConversationAuditLog } from '../../../../domain/models/ai-conversation-audit-log.entity';
import { ConversationRole } from '../../../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../../../domain/enums/generation-status.enum';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';
import {
  ConversationNotFoundException,
  TurnNotFoundException,
  MessageNotFoundException,
  DuplicateEntityException,
  InvalidOwnershipException,
  ConversationPersistenceException,
} from '../../../../domain/exceptions/conversation.exceptions';

describe('AI-09.3-BE.03.03 — Prisma Mappers & Persistence Error Handling Tests', () => {
  const tenantId = 'tenant-map-001';
  const userId = 'user-map-001';

  describe('PrismaAiConversationMapper', () => {
    it('should map domain entity to Prisma create input and back to domain', () => {
      const conv = AiConversation.create({
        tenantId,
        userId,
        title: 'Physical Therapy Assessment',
        idempotencyKey: 'idemp-map-conv',
      });

      const raw = PrismaAiConversationMapper.toPrismaCreate(conv);
      expect(raw.id).toBe(conv.id.value);
      expect(raw.tenantId).toBe(tenantId);
      expect(raw.title).toBe('Physical Therapy Assessment');

      const domain = PrismaAiConversationMapper.toDomain(raw);
      expect(domain.id.value).toBe(conv.id.value);
      expect(domain.title.value).toBe('Physical Therapy Assessment');
      expect(domain.idempotencyKey).toBe('idemp-map-conv');
    });

    it('should build Prisma update data from UpdateConversationMetadataDto', () => {
      const updateDto = {
        title: 'Renamed Session',
        lastActivityAt: new Date('2026-11-23T12:00:00Z'),
        isArchived: true,
      };

      const updateData = PrismaAiConversationMapper.toPrismaUpdate(updateDto);
      expect(updateData.title).toBe('Renamed Session');
      expect(updateData.lastActivityAt).toEqual(new Date('2026-11-23T12:00:00Z'));
      expect(updateData.deletedAt).toBeInstanceOf(Date);
      expect(updateData.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw ConversationPersistenceException when reconstituting corrupted conversation record', () => {
      const corruptedRaw = {
        id: '', // Empty ID is invalid in domain
        tenantId,
        userId,
        title: 'Corrupted Session',
        idempotencyKey: null,
        turnCounter: 0,
        messageCounter: 0,
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      expect(() => PrismaAiConversationMapper.toDomain(corruptedRaw)).toThrow(
        ConversationPersistenceException,
      );
    });
  });

  describe('PrismaAiConversationTurnMapper', () => {
    it('should correctly map all TurnStatus enums bidirectionally', () => {
      const statuses = [
        TurnStatus.PENDING,
        TurnStatus.STREAMING,
        TurnStatus.COMPLETED,
        TurnStatus.FAILED,
        TurnStatus.CANCELLED,
        TurnStatus.INTERRUPTED,
      ];

      for (const status of statuses) {
        const prismaStatus = PrismaAiConversationTurnMapper.toPrismaStatus(status);
        const backToDomain = PrismaAiConversationTurnMapper.toDomainTurnStatus(prismaStatus);
        expect(backToDomain).toBe(status);
      }
    });

    it('should throw ConversationPersistenceException on unknown turn status', () => {
      expect(() =>
        PrismaAiConversationTurnMapper.toDomainTurnStatus('UNKNOWN_STATUS' as PrismaTurnStatus),
      ).toThrow(ConversationPersistenceException);
    });

    it('should map turn domain entity to Prisma and back', () => {
      const conv = AiConversation.create({ tenantId, userId });
      const turn = AiConversationTurn.create({
        conversationId: conv.id,
        tenantId,
        turnIndex: 1,
        clientTurnId: 'client-turn-123',
        idempotencyKey: 'idemp-turn-123',
        idempotencyPayloadHash: 'hash-abc',
      });

      const raw = PrismaAiConversationTurnMapper.toPrismaCreate(turn);
      expect(raw.id).toBe(turn.id.value);
      expect(raw.status).toBe(PrismaTurnStatus.PENDING);

      const domain = PrismaAiConversationTurnMapper.toDomain(raw);
      expect(domain.id.value).toBe(turn.id.value);
      expect(domain.turnIndex).toBe(1);
      expect(domain.status).toBe(TurnStatus.PENDING);
    });

    it('should build Prisma update data for turn status and attempt disconnect', () => {
      const updateData = PrismaAiConversationTurnMapper.toPrismaUpdate({
        status: TurnStatus.COMPLETED,
        completedAt: new Date(),
        activeAttemptId: null,
        activeAttemptNumber: 1,
      });

      expect(updateData.status).toBe(PrismaTurnStatus.COMPLETED);
      expect(updateData.activeAttempt).toEqual({ disconnect: true });
    });
  });

  describe('PrismaAiConversationMessageMapper', () => {
    it('should correctly map ConversationRole and GenerationStatus enums bidirectionally', () => {
      const roles = [ConversationRole.USER, ConversationRole.ASSISTANT, ConversationRole.SYSTEM];
      for (const role of roles) {
        const prismaRole = PrismaAiConversationMessageMapper.toPrismaRole(role);
        const domainRole = PrismaAiConversationMessageMapper.toDomainRole(prismaRole);
        expect(domainRole).toBe(role);
      }

      const statuses = [
        GenerationStatus.PENDING,
        GenerationStatus.STREAMING,
        GenerationStatus.SUCCESS,
        GenerationStatus.FAILED,
        GenerationStatus.CANCELLED,
        GenerationStatus.INTERRUPTED,
      ];
      for (const status of statuses) {
        const prismaStatus = PrismaAiConversationMessageMapper.toPrismaStatus(status);
        const domainStatus =
          PrismaAiConversationMessageMapper.toDomainGenerationStatus(prismaStatus);
        expect(domainStatus).toBe(status);
      }
    });

    it('should map JSON metadata and sources correctly without losing structure', () => {
      const jsonSources = [{ title: 'Kinetic Manual', url: 'https://example.com/doc' }];
      const jsonMetadata = { model: 'gemini-1.5-pro', latencyMs: 250 };

      const prismaSources = PrismaAiConversationMessageMapper.toPrismaJson(jsonSources);
      expect(prismaSources).toEqual(jsonSources);

      const prismaMetadata = PrismaAiConversationMessageMapper.toPrismaJson(jsonMetadata);
      expect(prismaMetadata).toEqual(jsonMetadata);

      const nullJson = PrismaAiConversationMessageMapper.toPrismaJson(null);
      expect(nullJson).toBe(Prisma.JsonNull);

      const undefinedJson = PrismaAiConversationMessageMapper.toPrismaJson(undefined);
      expect(undefinedJson).toBeUndefined();
    });

    it('should build Prisma message update data', () => {
      const updateData = PrismaAiConversationMessageMapper.toPrismaUpdate({
        status: GenerationStatus.SUCCESS,
        content: 'Final synthesized response.',
        isCanonical: true,
        completedAt: new Date(),
      });

      expect(updateData.status).toBe(PrismaGenerationStatus.SUCCESS);
      expect(updateData.content).toBe('Final synthesized response.');
      expect(updateData.isCanonical).toBe(true);
    });
  });

  describe('PrismaAiConversationAuditMapper', () => {
    it('should map audit domain entity to Prisma and back', () => {
      const conv = AiConversation.create({ tenantId, userId });
      const audit = AiConversationAuditLog.create({
        tenantId,
        conversationId: conv.id,
        conversationTitleSnapshot: 'Supervised Evaluation',
        conversationOwnerUserId: userId,
        inspectorUserId: 'inspector-007',
        inspectorRole: 'COMPLIANCE_OFFICER',
        reason: 'Periodic HIPAA review',
      });

      const raw = PrismaAiConversationAuditMapper.toPrismaCreate(audit);
      expect(raw.inspectorUserId).toBe('inspector-007');

      const domain = PrismaAiConversationAuditMapper.toDomain(raw);
      expect(domain.id).toBe(audit.id);
      expect(domain.inspectorRole).toBe('COMPLIANCE_OFFICER');
    });
  });

  describe('PrismaPersistenceErrorHandler', () => {
    it('should translate P2002 unique constraint violations to DuplicateEntityException', () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique violation', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['tenant_id', 'client_turn_id'] },
      });

      expect(() =>
        PrismaPersistenceErrorHandler.handle(
          p2002Error,
          'AiConversationTurn',
          'turn-123',
          tenantId,
        ),
      ).toThrow(DuplicateEntityException);
    });

    it('should translate P2025 record not found to typed domain NotFound exceptions', () => {
      const p2025Error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '6.19.3',
      });

      expect(() =>
        PrismaPersistenceErrorHandler.handle(p2025Error, 'AiConversation', 'conv-123', tenantId),
      ).toThrow(ConversationNotFoundException);

      expect(() =>
        PrismaPersistenceErrorHandler.handle(
          p2025Error,
          'AiConversationTurn',
          'turn-123',
          tenantId,
        ),
      ).toThrow(TurnNotFoundException);

      expect(() =>
        PrismaPersistenceErrorHandler.handle(
          p2025Error,
          'AiConversationMessage',
          'msg-123',
          tenantId,
        ),
      ).toThrow(MessageNotFoundException);
    });

    it('should translate P2003 foreign key violations to InvalidOwnershipException', () => {
      const p2003Error = new Prisma.PrismaClientKnownRequestError('Foreign key failed', {
        code: 'P2003',
        clientVersion: '6.19.3',
        meta: { field_name: 'conversation_id_tenant_id_fkey' },
      });

      expect(() =>
        PrismaPersistenceErrorHandler.handle(
          p2003Error,
          'AiConversationTurn',
          'turn-123',
          tenantId,
        ),
      ).toThrow(InvalidOwnershipException);
    });

    it('should wrap generic database errors in ConversationPersistenceException without leaking sensitive details', () => {
      const genericError = new Error('Connection refused to postgresql server');

      expect(() =>
        PrismaPersistenceErrorHandler.handle(genericError, 'AiConversation', 'conv-123', tenantId),
      ).toThrow(ConversationPersistenceException);
    });
  });
});
