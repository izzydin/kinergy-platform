import { AiConversationCitation as PrismaAiConversationCitation, Prisma } from '@prisma/client';
import { AiConversationCitation } from '../../../../domain/models/ai-conversation-citation.entity';
import { CitationId } from '../../../../domain/value-objects/citation-id.vo';
import { MessageId } from '../../../../domain/value-objects/message-id.vo';
import { TurnId } from '../../../../domain/value-objects/turn-id.vo';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { ConversationPersistenceException } from '../../../../domain/exceptions/conversation.exceptions';

export class PrismaAiConversationCitationMapper {
  public static toDomain(raw: PrismaAiConversationCitation): AiConversationCitation {
    try {
      const rawMetadata = raw.metadata as unknown;
      const metadata =
        rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
          ? (rawMetadata as Record<string, unknown>)
          : null;

      return AiConversationCitation.reconstitute({
        id: CitationId.create(raw.id),
        messageId: MessageId.create(raw.messageId),
        turnId: TurnId.create(raw.turnId),
        conversationId: ConversationId.create(raw.conversationId),
        tenantId: raw.tenantId,
        documentId: raw.documentId,
        documentVersionId: raw.documentVersionId,
        chunkId: raw.chunkId,
        citationPosition: raw.citationPosition,
        documentTitleSnapshot: raw.documentTitleSnapshot,
        excerpt: raw.excerpt,
        pageNumber: raw.pageNumber,
        headingPath: raw.headingPath ?? [],
        retrievalRank: raw.retrievalRank,
        relevanceScore: raw.relevanceScore,
        sourceStrategy: raw.sourceStrategy,
        metadata,
        createdAt: raw.createdAt,
      });
    } catch (err) {
      throw new ConversationPersistenceException(
        `Failed to reconstitute AiConversationCitation '${raw.id}' from persisted state: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  public static toPrismaCreate(
    entity: AiConversationCitation,
  ): Prisma.AiConversationCitationCreateInput {
    return {
      id: entity.id.value,
      citationPosition: entity.citationPosition,
      documentTitleSnapshot: entity.documentTitleSnapshot,
      excerpt: entity.excerpt,
      pageNumber: entity.pageNumber,
      headingPath: [...entity.headingPath],
      retrievalRank: entity.retrievalRank,
      relevanceScore: entity.relevanceScore,
      sourceStrategy: entity.sourceStrategy,
      metadata: entity.metadata ? (entity.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      createdAt: entity.createdAt,
      message: {
        connect: {
          uq_msg_id_turn_conv_tenant: {
            id: entity.messageId.value,
            turnId: entity.turnId.value,
            conversationId: entity.conversationId.value,
            tenantId: entity.tenantId,
          },
        },
      },
      document: {
        connect: {
          id: entity.documentId,
        },
      },
      version: entity.documentVersionId
        ? {
            connect: {
              id: entity.documentVersionId,
            },
          }
        : undefined,
      chunk: entity.chunkId
        ? {
            connect: {
              id: entity.chunkId,
            },
          }
        : undefined,
    };
  }

  public static toPrismaUncheckedCreate(
    entity: AiConversationCitation,
  ): Prisma.AiConversationCitationUncheckedCreateInput {
    return {
      id: entity.id.value,
      messageId: entity.messageId.value,
      turnId: entity.turnId.value,
      conversationId: entity.conversationId.value,
      tenantId: entity.tenantId,
      documentId: entity.documentId,
      documentVersionId: entity.documentVersionId,
      chunkId: entity.chunkId,
      citationPosition: entity.citationPosition,
      documentTitleSnapshot: entity.documentTitleSnapshot,
      excerpt: entity.excerpt,
      pageNumber: entity.pageNumber,
      headingPath: [...entity.headingPath],
      retrievalRank: entity.retrievalRank,
      relevanceScore: entity.relevanceScore,
      sourceStrategy: entity.sourceStrategy,
      metadata: entity.metadata ? (entity.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      createdAt: entity.createdAt,
    };
  }
}
