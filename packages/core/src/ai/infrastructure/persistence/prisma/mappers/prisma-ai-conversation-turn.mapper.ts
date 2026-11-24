import {
  AiConversationTurn as PrismaAiConversationTurn,
  TurnStatus as PrismaTurnStatus,
  Prisma,
} from '@prisma/client';
import { AiConversationTurn } from '../../../../domain/models/ai-conversation-turn.entity';
import { TurnId } from '../../../../domain/value-objects/turn-id.vo';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { ClientTurnId } from '../../../../domain/value-objects/client-turn-id.vo';
import { MessageId } from '../../../../domain/value-objects/message-id.vo';
import { TurnStatus } from '../../../../domain/enums/turn-status.enum';
import { UpdateTurnStatusDto } from '../../../../ports/outbound/ai-conversation-turn-repository.port';
import { ConversationPersistenceException } from '../../../../domain/exceptions/conversation.exceptions';

export class PrismaAiConversationTurnMapper {
  public static toDomain(raw: PrismaAiConversationTurn): AiConversationTurn {
    try {
      return AiConversationTurn.reconstitute({
        id: TurnId.create(raw.id),
        conversationId: ConversationId.create(raw.conversationId),
        tenantId: raw.tenantId,
        turnIndex: raw.turnIndex,
        status: PrismaAiConversationTurnMapper.toDomainTurnStatus(raw.status),
        clientTurnId: ClientTurnId.create(raw.clientTurnId),
        idempotencyKey: raw.idempotencyKey,
        idempotencyPayloadHash: raw.idempotencyPayloadHash,
        activeAttemptId: raw.activeAttemptId ? MessageId.create(raw.activeAttemptId) : null,
        activeAttemptNumber: raw.activeAttemptNumber,
        createdAt: raw.createdAt,
        completedAt: raw.completedAt,
        updatedAt: raw.updatedAt,
      });
    } catch (err) {
      throw new ConversationPersistenceException(
        `Failed to reconstitute AiConversationTurn '${raw.id}' from persisted state: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  public static toPrismaCreate(entity: AiConversationTurn): PrismaAiConversationTurn {
    return {
      id: entity.id.value,
      conversationId: entity.conversationId.value,
      tenantId: entity.tenantId,
      turnIndex: entity.turnIndex,
      status: PrismaAiConversationTurnMapper.toPrismaStatus(entity.status),
      clientTurnId: entity.clientTurnId.value,
      idempotencyKey: entity.idempotencyKey,
      idempotencyPayloadHash: entity.idempotencyPayloadHash,
      activeAttemptId: entity.activeAttemptId ? entity.activeAttemptId.value : null,
      activeAttemptNumber: entity.activeAttemptNumber,
      createdAt: entity.createdAt,
      completedAt: entity.completedAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static toPrismaUpdate(update: UpdateTurnStatusDto): Prisma.AiConversationTurnUpdateInput {
    const data: Prisma.AiConversationTurnUpdateInput = {
      status: PrismaAiConversationTurnMapper.toPrismaStatus(update.status),
      updatedAt: new Date(),
    };

    if (update.completedAt !== undefined) {
      data.completedAt = update.completedAt;
    }

    if (update.activeAttemptId !== undefined) {
      if (update.activeAttemptId === null) {
        data.activeAttempt = { disconnect: true };
      } else {
        const idStr =
          typeof update.activeAttemptId === 'string'
            ? update.activeAttemptId
            : update.activeAttemptId.value;
        data.activeAttempt = { connect: { id: idStr } };
      }
    }

    if (update.activeAttemptNumber !== undefined) {
      data.activeAttemptNumber = update.activeAttemptNumber;
    }

    return data;
  }

  public static toDomainTurnStatus(status: PrismaTurnStatus): TurnStatus {
    switch (status) {
      case PrismaTurnStatus.PENDING:
        return TurnStatus.PENDING;
      case PrismaTurnStatus.STREAMING:
        return TurnStatus.STREAMING;
      case PrismaTurnStatus.COMPLETED:
        return TurnStatus.COMPLETED;
      case PrismaTurnStatus.FAILED:
        return TurnStatus.FAILED;
      case PrismaTurnStatus.CANCELLED:
        return TurnStatus.CANCELLED;
      case PrismaTurnStatus.INTERRUPTED:
        return TurnStatus.INTERRUPTED;
      default:
        throw new ConversationPersistenceException(
          `Unknown Prisma TurnStatus value: '${String(status)}'`,
        );
    }
  }

  public static toPrismaStatus(status: TurnStatus): PrismaTurnStatus {
    switch (status) {
      case TurnStatus.PENDING:
        return PrismaTurnStatus.PENDING;
      case TurnStatus.STREAMING:
        return PrismaTurnStatus.STREAMING;
      case TurnStatus.COMPLETED:
        return PrismaTurnStatus.COMPLETED;
      case TurnStatus.FAILED:
        return PrismaTurnStatus.FAILED;
      case TurnStatus.CANCELLED:
        return PrismaTurnStatus.CANCELLED;
      case TurnStatus.INTERRUPTED:
        return PrismaTurnStatus.INTERRUPTED;
      default:
        throw new ConversationPersistenceException(
          `Unknown domain TurnStatus value: '${String(status)}'`,
        );
    }
  }
}
