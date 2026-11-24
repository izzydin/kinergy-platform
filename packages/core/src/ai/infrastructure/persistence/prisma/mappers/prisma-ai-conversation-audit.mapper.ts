import { AiConversationAuditLog as PrismaAiConversationAuditLog } from '@prisma/client';
import { AiConversationAuditLog } from '../../../../domain/models/ai-conversation-audit-log.entity';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { ConversationPersistenceException } from '../../../../domain/exceptions/conversation.exceptions';

export class PrismaAiConversationAuditMapper {
  public static toDomain(raw: PrismaAiConversationAuditLog): AiConversationAuditLog {
    try {
      return AiConversationAuditLog.reconstitute({
        id: raw.id,
        tenantId: raw.tenantId,
        conversationId: ConversationId.create(raw.conversationId),
        conversationTitleSnapshot: raw.conversationTitleSnapshot,
        conversationOwnerUserId: raw.conversationOwnerUserId,
        inspectorUserId: raw.inspectorUserId,
        inspectorRole: raw.inspectorRole,
        action: raw.action,
        reason: raw.reason,
        ipAddress: raw.ipAddress,
        userAgent: raw.userAgent,
        createdAt: raw.createdAt,
      });
    } catch (err) {
      throw new ConversationPersistenceException(
        `Failed to reconstitute AiConversationAuditLog '${raw.id}' from persisted state: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  public static toPrismaCreate(entity: AiConversationAuditLog): PrismaAiConversationAuditLog {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      conversationId: entity.conversationId.value,
      conversationTitleSnapshot: entity.conversationTitleSnapshot,
      conversationOwnerUserId: entity.conversationOwnerUserId,
      inspectorUserId: entity.inspectorUserId,
      inspectorRole: entity.inspectorRole,
      action: entity.action,
      reason: entity.reason,
      ipAddress: entity.ipAddress,
      userAgent: entity.userAgent,
      createdAt: entity.createdAt,
    };
  }
}
