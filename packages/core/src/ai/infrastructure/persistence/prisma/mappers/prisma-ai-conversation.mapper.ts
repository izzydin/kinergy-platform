import { AiConversation as PrismaAiConversation, Prisma } from '@prisma/client';
import { AiConversation } from '../../../../domain/models/ai-conversation.entity';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { ConversationTitle } from '../../../../domain/value-objects/conversation-title.vo';
import { UpdateConversationMetadataDto } from '../../../../ports/outbound/ai-conversation-repository.port';
import { ConversationPersistenceException } from '../../../../domain/exceptions/conversation.exceptions';

export class PrismaAiConversationMapper {
  public static toDomain(raw: PrismaAiConversation): AiConversation {
    try {
      return AiConversation.reconstitute({
        id: ConversationId.create(raw.id),
        tenantId: raw.tenantId,
        userId: raw.userId,
        title: ConversationTitle.create(raw.title),
        idempotencyKey: raw.idempotencyKey,
        turnCounter: raw.turnCounter,
        messageCounter: raw.messageCounter,
        lastActivityAt: raw.lastActivityAt,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        deletedAt: raw.deletedAt,
      });
    } catch (err) {
      throw new ConversationPersistenceException(
        `Failed to reconstitute AiConversation '${raw.id}' from persisted state: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  public static toPrismaCreate(entity: AiConversation): PrismaAiConversation {
    return {
      id: entity.id.value,
      tenantId: entity.tenantId,
      userId: entity.userId,
      title: entity.title.value,
      idempotencyKey: entity.idempotencyKey,
      turnCounter: entity.turnCounter,
      messageCounter: entity.messageCounter,
      lastActivityAt: entity.lastActivityAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      deletedAt: entity.deletedAt,
    };
  }

  public static toPrismaUpdate(
    update: UpdateConversationMetadataDto,
  ): Prisma.AiConversationUpdateInput {
    const data: Prisma.AiConversationUpdateInput = {
      updatedAt: new Date(),
    };

    if (update.title !== undefined) {
      data.title = typeof update.title === 'string' ? update.title : update.title.value;
    }

    if (update.lastActivityAt !== undefined) {
      data.lastActivityAt = update.lastActivityAt;
    }

    if (update.isArchived !== undefined) {
      data.deletedAt = update.isArchived ? new Date() : null;
    }

    return data;
  }
}
