import {
  AiConversationMessage as PrismaAiConversationMessage,
  ConversationRole as PrismaConversationRole,
  GenerationStatus as PrismaGenerationStatus,
  Prisma,
} from '@prisma/client';
import { AiConversationMessage } from '../../../../domain/models/ai-conversation-message.entity';
import { MessageId } from '../../../../domain/value-objects/message-id.vo';
import { TurnId } from '../../../../domain/value-objects/turn-id.vo';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { ConversationRole } from '../../../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../../../domain/enums/generation-status.enum';
import { UpdateMessageStatusDto } from '../../../../ports/outbound/ai-conversation-message-repository.port';
import { ConversationPersistenceException } from '../../../../domain/exceptions/conversation.exceptions';

export class PrismaAiConversationMessageMapper {
  public static toDomain(raw: PrismaAiConversationMessage): AiConversationMessage {
    try {
      const rawSources = raw.sources as unknown;
      const sources = Array.isArray(rawSources) ? (rawSources as Record<string, unknown>[]) : null;

      const rawMetadata = raw.metadata as unknown;
      const metadata =
        rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
          ? (rawMetadata as Record<string, unknown>)
          : null;

      return AiConversationMessage.reconstitute({
        id: MessageId.create(raw.id),
        turnId: TurnId.create(raw.turnId),
        conversationId: ConversationId.create(raw.conversationId),
        tenantId: raw.tenantId,
        role: PrismaAiConversationMessageMapper.toDomainRole(raw.role),
        sequenceNumber: raw.sequenceNumber,
        attemptNumber: raw.attemptNumber,
        isCanonical: raw.isCanonical,
        status: PrismaAiConversationMessageMapper.toDomainGenerationStatus(raw.status),
        content: raw.content,
        sources,
        metadata,
        errorCode: raw.errorCode,
        errorMessage: raw.errorMessage,
        clientMessageId: raw.clientMessageId,
        leaseToken: raw.leaseToken,
        leaseOwnerInstanceId: raw.leaseOwnerInstanceId,
        leaseExpiresAt: raw.leaseExpiresAt,
        createdAt: raw.createdAt,
        completedAt: raw.completedAt,
        updatedAt: raw.updatedAt,
      });
    } catch (err) {
      throw new ConversationPersistenceException(
        `Failed to reconstitute AiConversationMessage '${raw.id}' from persisted state: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  public static toPrismaCreate(
    entity: AiConversationMessage,
  ): Prisma.AiConversationMessageUncheckedCreateInput {
    return {
      id: entity.id.value,
      turnId: entity.turnId.value,
      conversationId: entity.conversationId.value,
      tenantId: entity.tenantId,
      role: PrismaAiConversationMessageMapper.toPrismaRole(entity.role),
      sequenceNumber: entity.sequenceNumber,
      attemptNumber: entity.attemptNumber,
      isCanonical: entity.isCanonical,
      status: PrismaAiConversationMessageMapper.toPrismaStatus(entity.status),
      content: entity.content,
      sources: PrismaAiConversationMessageMapper.toPrismaJson(entity.sources),
      metadata: PrismaAiConversationMessageMapper.toPrismaJson(entity.metadata),
      errorCode: entity.errorCode,
      errorMessage: entity.errorMessage,
      clientMessageId: entity.clientMessageId,
      leaseToken: entity.leaseToken,
      leaseOwnerInstanceId: entity.leaseOwnerInstanceId,
      leaseExpiresAt: entity.leaseExpiresAt,
      createdAt: entity.createdAt,
      completedAt: entity.completedAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static toPrismaUpdate(
    update: UpdateMessageStatusDto,
  ): Prisma.AiConversationMessageUpdateInput {
    const data: Prisma.AiConversationMessageUpdateInput = {
      status: PrismaAiConversationMessageMapper.toPrismaStatus(update.status),
      updatedAt: new Date(),
    };

    if (update.content !== undefined) {
      data.content = update.content;
    }

    if (update.isCanonical !== undefined) {
      data.isCanonical = update.isCanonical;
    }

    if (update.completedAt !== undefined) {
      data.completedAt = update.completedAt;
    }

    if (update.errorCode !== undefined) {
      data.errorCode = update.errorCode;
    }

    if (update.errorMessage !== undefined) {
      data.errorMessage = update.errorMessage;
    }

    if (update.sources !== undefined) {
      data.sources = PrismaAiConversationMessageMapper.toPrismaJson(update.sources);
    }

    if (update.metadata !== undefined) {
      data.metadata = PrismaAiConversationMessageMapper.toPrismaJson(update.metadata);
    }

    if (
      update.status === GenerationStatus.SUCCESS ||
      update.status === GenerationStatus.FAILED ||
      update.status === GenerationStatus.CANCELLED ||
      update.status === GenerationStatus.INTERRUPTED
    ) {
      data.leaseToken = null;
      data.leaseOwnerInstanceId = null;
      data.leaseExpiresAt = null;
    }

    return data;
  }

  public static toDomainRole(role: PrismaConversationRole): ConversationRole {
    switch (role) {
      case PrismaConversationRole.USER:
        return ConversationRole.USER;
      case PrismaConversationRole.ASSISTANT:
        return ConversationRole.ASSISTANT;
      case PrismaConversationRole.SYSTEM:
        return ConversationRole.SYSTEM;
      default:
        throw new ConversationPersistenceException(
          `Unknown Prisma ConversationRole value: '${String(role)}'`,
        );
    }
  }

  public static toPrismaRole(role: ConversationRole): PrismaConversationRole {
    switch (role) {
      case ConversationRole.USER:
        return PrismaConversationRole.USER;
      case ConversationRole.ASSISTANT:
        return PrismaConversationRole.ASSISTANT;
      case ConversationRole.SYSTEM:
        return PrismaConversationRole.SYSTEM;
      default:
        throw new ConversationPersistenceException(
          `Unknown domain ConversationRole value: '${String(role)}'`,
        );
    }
  }

  public static toDomainGenerationStatus(status: PrismaGenerationStatus): GenerationStatus {
    switch (status) {
      case PrismaGenerationStatus.PENDING:
        return GenerationStatus.PENDING;
      case PrismaGenerationStatus.STREAMING:
        return GenerationStatus.STREAMING;
      case PrismaGenerationStatus.SUCCESS:
        return GenerationStatus.SUCCESS;
      case PrismaGenerationStatus.FAILED:
        return GenerationStatus.FAILED;
      case PrismaGenerationStatus.CANCELLED:
        return GenerationStatus.CANCELLED;
      case PrismaGenerationStatus.INTERRUPTED:
        return GenerationStatus.INTERRUPTED;
      default:
        throw new ConversationPersistenceException(
          `Unknown Prisma GenerationStatus value: '${String(status)}'`,
        );
    }
  }

  public static toPrismaStatus(status: GenerationStatus): PrismaGenerationStatus {
    switch (status) {
      case GenerationStatus.PENDING:
        return PrismaGenerationStatus.PENDING;
      case GenerationStatus.STREAMING:
        return PrismaGenerationStatus.STREAMING;
      case GenerationStatus.SUCCESS:
        return PrismaGenerationStatus.SUCCESS;
      case GenerationStatus.FAILED:
        return PrismaGenerationStatus.FAILED;
      case GenerationStatus.CANCELLED:
        return PrismaGenerationStatus.CANCELLED;
      case GenerationStatus.INTERRUPTED:
        return PrismaGenerationStatus.INTERRUPTED;
      default:
        throw new ConversationPersistenceException(
          `Unknown domain GenerationStatus value: '${String(status)}'`,
        );
    }
  }

  public static toPrismaJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }
}
