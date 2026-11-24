import { PrismaClient, Prisma } from '@prisma/client';
import { AiConversationTurn } from '../../../../domain/models/ai-conversation-turn.entity';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../../../domain/value-objects/turn-id.vo';
import { ClientTurnId } from '../../../../domain/value-objects/client-turn-id.vo';
import {
  IAiConversationTurnRepositoryPort,
  FindTurnsFilter,
  UpdateTurnStatusDto,
  FindPendingOrStalledTurnsFilter,
} from '../../../../ports/outbound/ai-conversation-turn-repository.port';
import { PrismaAiConversationTurnMapper } from '../mappers/prisma-ai-conversation-turn.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';

export class PrismaAiConversationTurnRepository implements IAiConversationTurnRepositoryPort {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  /**
   * Returns a new repository instance operating within the provided transaction client.
   */
  public withTransaction(tx: Prisma.TransactionClient): PrismaAiConversationTurnRepository {
    return new PrismaAiConversationTurnRepository(tx);
  }

  public async findById(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
  ): Promise<AiConversationTurn | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const turnIdStr = turnId instanceof TurnId ? turnId.value : turnId;

    try {
      const raw = await this.prisma.aiConversationTurn.findFirst({
        where: {
          id: turnIdStr,
          conversationId: convIdStr,
          tenantId,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', turnIdStr, tenantId);
    }
  }

  public async findByClientTurnId(
    tenantId: string,
    clientTurnId: ClientTurnId | string,
  ): Promise<AiConversationTurn | null> {
    const clientTurnIdStr =
      clientTurnId instanceof ClientTurnId ? clientTurnId.value : clientTurnId;

    try {
      const raw = await this.prisma.aiConversationTurn.findFirst({
        where: {
          tenantId,
          clientTurnId: clientTurnIdStr,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', clientTurnIdStr, tenantId);
    }
  }

  public async findByIdempotencyKey(
    tenantId: string,
    conversationId: ConversationId | string,
    idempotencyKey: string,
  ): Promise<AiConversationTurn | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    try {
      const raw = await this.prisma.aiConversationTurn.findFirst({
        where: {
          tenantId,
          conversationId: convIdStr,
          idempotencyKey,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', idempotencyKey, tenantId);
    }
  }

  public async findByTurnIndex(
    tenantId: string,
    conversationId: ConversationId | string,
    turnIndex: number,
  ): Promise<AiConversationTurn | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    try {
      const raw = await this.prisma.aiConversationTurn.findFirst({
        where: {
          tenantId,
          conversationId: convIdStr,
          turnIndex,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationTurn',
        `turnIndex_${turnIndex}`,
        tenantId,
      );
    }
  }

  public async findActiveTurn(
    tenantId: string,
    conversationId: ConversationId | string,
  ): Promise<AiConversationTurn | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    try {
      const raw = await this.prisma.aiConversationTurn.findFirst({
        where: {
          tenantId,
          conversationId: convIdStr,
          status: {
            in: ['PENDING', 'STREAMING'],
          },
        },
        orderBy: {
          turnIndex: 'desc',
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', 'active_turn', tenantId);
    }
  }

  public async save(turn: AiConversationTurn): Promise<AiConversationTurn> {
    const rawData = PrismaAiConversationTurnMapper.toPrismaCreate(turn);

    try {
      const raw = await this.prisma.aiConversationTurn.upsert({
        where: {
          uq_turn_id_conv_tenant: {
            id: rawData.id,
            conversationId: rawData.conversationId,
            tenantId: rawData.tenantId,
          },
        },
        create: {
          id: rawData.id,
          conversationId: rawData.conversationId,
          tenantId: rawData.tenantId,
          turnIndex: rawData.turnIndex,
          status: rawData.status,
          clientTurnId: rawData.clientTurnId,
          idempotencyKey: rawData.idempotencyKey,
          idempotencyPayloadHash: rawData.idempotencyPayloadHash,
          activeAttemptId: rawData.activeAttemptId,
          activeAttemptNumber: rawData.activeAttemptNumber,
          createdAt: rawData.createdAt,
          completedAt: rawData.completedAt,
          updatedAt: rawData.updatedAt,
        },
        update: {
          status: rawData.status,
          activeAttemptId: rawData.activeAttemptId,
          activeAttemptNumber: rawData.activeAttemptNumber,
          completedAt: rawData.completedAt,
          updatedAt: rawData.updatedAt,
        },
      });

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', turn.id.value, turn.tenantId);
    }
  }

  public async updateStatus(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
    update: UpdateTurnStatusDto,
  ): Promise<AiConversationTurn> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const turnIdStr = turnId instanceof TurnId ? turnId.value : turnId;
    const updateData = PrismaAiConversationTurnMapper.toPrismaUpdate(update);

    try {
      const raw = await this.prisma.aiConversationTurn.update({
        where: {
          uq_turn_id_conv_tenant: {
            id: turnIdStr,
            conversationId: convIdStr,
            tenantId,
          },
        },
        data: updateData,
      });

      return PrismaAiConversationTurnMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', turnIdStr, tenantId);
    }
  }

  public async listByConversation(
    tenantId: string,
    conversationId: ConversationId | string,
    filter?: FindTurnsFilter,
  ): Promise<AiConversationTurn[]> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    try {
      const records = await this.prisma.aiConversationTurn.findMany({
        where: {
          tenantId,
          conversationId: convIdStr,
          ...(filter?.status
            ? { status: PrismaAiConversationTurnMapper.toPrismaStatus(filter.status) }
            : {}),
          ...(filter?.fromTurnIndex !== undefined || filter?.toTurnIndex !== undefined
            ? {
                turnIndex: {
                  ...(filter.fromTurnIndex !== undefined ? { gte: filter.fromTurnIndex } : {}),
                  ...(filter.toTurnIndex !== undefined ? { lte: filter.toTurnIndex } : {}),
                },
              }
            : {}),
        },
        orderBy: {
          turnIndex: 'asc',
        },
        take: filter?.limit,
      });

      return records.map((r) => PrismaAiConversationTurnMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationTurn', convIdStr, tenantId);
    }
  }

  public async findPendingOrStalledTurns(
    filter?: FindPendingOrStalledTurnsFilter,
  ): Promise<AiConversationTurn[]> {
    const limit = Math.min(Math.max(filter?.limit ?? 10, 1), 50);
    const expiredBefore = filter?.leaseExpiredBefore ?? new Date();

    try {
      const records = await this.prisma.aiConversationTurn.findMany({
        where: {
          OR: [
            {
              status: 'PENDING',
            },
            {
              status: 'STREAMING',
              activeAttempt: {
                leaseExpiresAt: {
                  lt: expiredBefore,
                },
              },
            },
          ],
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: limit,
      });

      return records.map((r) => PrismaAiConversationTurnMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationTurn',
        'pending_stalled_turns',
        'system',
      );
    }
  }
}
