import { PrismaClient, Prisma } from '@prisma/client';
import { AiConversationCitation } from '../../../../domain/models/ai-conversation-citation.entity';
import { CitationId } from '../../../../domain/value-objects/citation-id.vo';
import { MessageId } from '../../../../domain/value-objects/message-id.vo';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { IAiConversationCitationRepositoryPort } from '../../../../ports/outbound/ai-conversation-citation-repository.port';
import { PrismaAiConversationCitationMapper } from '../mappers/prisma-ai-conversation-citation.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';

export class PrismaAiConversationCitationRepository implements IAiConversationCitationRepositoryPort {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  public withTransaction(tx: Prisma.TransactionClient): PrismaAiConversationCitationRepository {
    return new PrismaAiConversationCitationRepository(tx);
  }

  public async save(citation: AiConversationCitation): Promise<AiConversationCitation> {
    if (!this.prisma?.aiConversationCitation) {
      return citation;
    }

    const rawData = PrismaAiConversationCitationMapper.toPrismaUncheckedCreate(citation);

    try {
      const raw = await this.prisma.aiConversationCitation.upsert({
        where: {
          uq_message_citation_position: {
            messageId: citation.messageId.value,
            citationPosition: citation.citationPosition,
          },
        },
        create: rawData,
        update: {
          documentTitleSnapshot: rawData.documentTitleSnapshot,
          excerpt: rawData.excerpt,
          pageNumber: rawData.pageNumber,
          headingPath: rawData.headingPath,
          retrievalRank: rawData.retrievalRank,
          relevanceScore: rawData.relevanceScore,
          sourceStrategy: rawData.sourceStrategy,
          metadata: rawData.metadata ?? undefined,
        },
      });

      return PrismaAiConversationCitationMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationCitation',
        citation.id.value,
        citation.tenantId,
      );
    }
  }

  public async saveMany(
    citations: readonly AiConversationCitation[],
  ): Promise<AiConversationCitation[]> {
    if (!citations || citations.length === 0) {
      return [];
    }

    const savedResults: AiConversationCitation[] = [];
    for (const citation of citations) {
      const saved = await this.save(citation);
      savedResults.push(saved);
    }
    return savedResults;
  }

  public async findById(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
    citationId: CitationId | string,
  ): Promise<AiConversationCitation | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const msgIdStr = messageId instanceof MessageId ? messageId.value : messageId;
    const citIdStr = citationId instanceof CitationId ? citationId.value : citationId;

    if (!this.prisma?.aiConversationCitation) {
      return null;
    }

    try {
      const raw = await this.prisma.aiConversationCitation.findFirst({
        where: {
          id: citIdStr,
          messageId: msgIdStr,
          conversationId: convIdStr,
          tenantId,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationCitationMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationCitation', citIdStr, tenantId);
    }
  }

  public async listByMessage(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
  ): Promise<AiConversationCitation[]> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const msgIdStr = messageId instanceof MessageId ? messageId.value : messageId;

    if (!this.prisma?.aiConversationCitation) {
      return [];
    }

    try {
      const records = await this.prisma.aiConversationCitation.findMany({
        where: {
          messageId: msgIdStr,
          conversationId: convIdStr,
          tenantId,
        },
        orderBy: {
          citationPosition: 'asc',
        },
      });

      return records.map((r) => PrismaAiConversationCitationMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationCitation',
        `msg_${msgIdStr}`,
        tenantId,
      );
    }
  }

  public async listByConversation(
    tenantId: string,
    conversationId: ConversationId | string,
  ): Promise<AiConversationCitation[]> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    if (!this.prisma?.aiConversationCitation) {
      return [];
    }

    try {
      const records = await this.prisma.aiConversationCitation.findMany({
        where: {
          conversationId: convIdStr,
          tenantId,
        },
        orderBy: [{ createdAt: 'asc' }, { citationPosition: 'asc' }],
      });

      return records.map((r) => PrismaAiConversationCitationMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationCitation',
        `conv_${convIdStr}`,
        tenantId,
      );
    }
  }

  public async deleteByMessage(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
  ): Promise<number> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const msgIdStr = messageId instanceof MessageId ? messageId.value : messageId;

    if (!this.prisma?.aiConversationCitation) {
      return 0;
    }

    try {
      const result = await this.prisma.aiConversationCitation.deleteMany({
        where: {
          messageId: msgIdStr,
          conversationId: convIdStr,
          tenantId,
        },
      });

      return result.count;
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationCitation',
        `msg_${msgIdStr}`,
        tenantId,
      );
    }
  }
}
