import {
  CreateConversationWithInitialTurnResult,
  ReserveConversationTurnResult,
  ConversationDetailDto,
  ListConversationsResult,
  MessageHistoryResultDto,
  UpdateConversationTitleResult,
  ArchiveConversationResult,
  PrivilegedInspectConversationResult,
  CancelConversationTurnResult,
} from '@kinergy-platform/core';
import {
  CreateConversationResponseDto,
  ReserveTurnResponseDto,
  ConversationDetailResponseDto,
  ListConversationsResponseDto,
  MessageHistoryResponseDto,
  UpdateTitleResponseDto,
  ArchiveConversationResponseDto,
  AuditInspectResponseDto,
  TurnSummaryResponseDto,
  MessageResponseDto,
  CancelTurnResponseDto,
} from '../dtos/ai-conversation.dtos';

/**
 * Pure mapping functions translating application-level use case results into API response DTOs.
 *
 * Guarantees:
 * - Internal fields (payload hashes, lease tokens, transaction IDs, audit records) are strictly excluded.
 * - Date and timestamp fields are normalized to ISO 8601 strings.
 * - Response structures remain decoupled from internal domain entities and Prisma records.
 */
export class AiConversationResponseMapper {
  public static toCreateConversationResponse(
    result: CreateConversationWithInitialTurnResult,
  ): CreateConversationResponseDto {
    const dto = new CreateConversationResponseDto();
    dto.conversationId = result.conversationId;
    dto.turnId = result.turnId;
    dto.clientTurnId = result.clientTurnId;
    dto.turnIndex = result.turnIndex;
    dto.userMessageId = result.userMessageId;
    dto.assistantAttemptId = result.assistantAttemptId;
    dto.title = result.title;
    dto.turnStatus = result.turnStatus;
    dto.isIdempotentReplay = result.isIdempotentReplay;
    dto.idempotencyOutcome = result.idempotencyOutcome;
    dto.createdAt = result.createdAt;
    return dto;
  }

  public static toReserveTurnResponse(
    result: ReserveConversationTurnResult,
  ): ReserveTurnResponseDto {
    const dto = new ReserveTurnResponseDto();
    dto.conversationId = result.conversationId;
    dto.turnId = result.turnId;
    dto.clientTurnId = result.clientTurnId;
    dto.turnIndex = result.turnIndex;
    dto.userMessageId = result.userMessageId;
    dto.assistantAttemptId = result.assistantAttemptId;
    dto.turnStatus = result.turnStatus;
    dto.isIdempotentReplay = result.isIdempotentReplay;
    dto.idempotencyOutcome = result.idempotencyOutcome;
    dto.createdAt = result.createdAt;
    return dto;
  }

  public static toConversationDetailResponse(
    detail: ConversationDetailDto,
  ): ConversationDetailResponseDto {
    const dto = new ConversationDetailResponseDto();
    dto.id = detail.id;
    dto.title = detail.title;
    dto.turnCounter = detail.turnCounter;
    dto.messageCounter = detail.messageCounter;
    dto.lastActivityAt = detail.lastActivityAt;
    dto.createdAt = detail.createdAt;
    dto.updatedAt = detail.updatedAt;
    dto.isArchived = detail.isArchived;
    dto.activeTurnId = detail.activeTurnId ?? null;

    if (detail.turns) {
      dto.turns = detail.turns.map((turn) => {
        const turnDto = new TurnSummaryResponseDto();
        turnDto.id = turn.id;
        turnDto.turnIndex = turn.turnIndex;
        turnDto.status = turn.status;
        turnDto.clientTurnId = turn.clientTurnId;
        turnDto.activeAttemptId = turn.activeAttemptId;
        turnDto.activeAttemptNumber = turn.activeAttemptNumber;
        turnDto.createdAt = turn.createdAt;
        turnDto.completedAt = turn.completedAt;
        return turnDto;
      });
    }

    return dto;
  }

  public static toListConversationsResponse(
    result: ListConversationsResult,
  ): ListConversationsResponseDto {
    const dto = new ListConversationsResponseDto();
    dto.items = result.items.map((item) => ({
      id: item.id,
      title: item.title,
      turnCounter: item.turnCounter,
      lastActivityAt: item.lastActivityAt,
      createdAt: item.createdAt,
      isArchived: item.isArchived,
    }));
    dto.nextCursor = result.nextCursor;
    dto.hasMore = result.hasMore;
    return dto;
  }

  public static toMessageHistoryResponse(
    result: MessageHistoryResultDto,
  ): MessageHistoryResponseDto {
    const dto = new MessageHistoryResponseDto();
    dto.messages = result.messages.map((m) => {
      const msgDto = new MessageResponseDto();
      msgDto.id = m.id;
      msgDto.turnId = m.turnId;
      msgDto.role = m.role;
      msgDto.sequenceNumber = m.sequenceNumber;
      msgDto.attemptNumber = m.attemptNumber;
      msgDto.isCanonical = m.isCanonical;
      msgDto.status = m.status;
      msgDto.content = m.content;
      msgDto.sources = m.sources ?? null;
      msgDto.createdAt = m.createdAt;
      msgDto.completedAt = m.completedAt ?? null;
      return msgDto;
    });
    dto.nextCursor = result.nextCursor;
    dto.hasMore = result.hasMore;
    return dto;
  }

  public static toUpdateTitleResponse(
    result: UpdateConversationTitleResult,
  ): UpdateTitleResponseDto {
    const dto = new UpdateTitleResponseDto();
    dto.conversationId = result.conversationId;
    dto.title = result.title;
    dto.updatedAt = result.updatedAt;
    return dto;
  }

  public static toArchiveConversationResponse(
    result: ArchiveConversationResult,
  ): ArchiveConversationResponseDto {
    const dto = new ArchiveConversationResponseDto();
    dto.conversationId = result.conversationId;
    dto.isArchived = result.isArchived;
    dto.archivedAt = result.archivedAt;
    return dto;
  }

  public static toAuditInspectResponse(
    result: PrivilegedInspectConversationResult,
  ): AuditInspectResponseDto {
    const dto = new AuditInspectResponseDto();
    dto.auditLogId = result.auditLogId;
    dto.conversation = this.toConversationDetailResponse(result.conversation);
    dto.messages = this.toMessageHistoryResponse({
      messages: result.messages,
      nextCursor: null,
      hasMore: false,
    }).messages;
    dto.inspectedAt = result.inspectedAt;
    return dto;
  }

  public static toCancelTurnResponse(result: CancelConversationTurnResult): CancelTurnResponseDto {
    const dto = new CancelTurnResponseDto();
    dto.conversationId = result.conversationId;
    dto.turnId = result.turnId;
    dto.turnStatus = result.turnStatus;
    dto.assistantMessageId = result.assistantMessageId;
    dto.isAlreadyCancelled = result.isAlreadyCancelled;
    dto.cancelledAt = result.cancelledAt;
    return dto;
  }
}
