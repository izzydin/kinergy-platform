import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  UseFilters,
  HttpCode,
  HttpStatus,
  Optional,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  PrivilegedInspectConversationUseCase,
  CancelConversationTurnUseCase,
  GetMessageCitationsUseCase,
  GetCitationDetailUseCase,
  GetCitationPreviewUseCase,
  GetCitationDocumentStreamUseCase,
  SubmitMessageFeedbackUseCase,
  GetMessageFeedbackUseCase,
  RevokeMessageFeedbackUseCase,
  RegenerateConversationTurnUseCase,
  FeedbackNotFoundError,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { PERMISSIONS } from '../../platform/identity/authorization/permissions';
import { RequirePermissions } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { Roles } from '../../platform/identity/authorization/decorators/roles.decorator';
import { Public } from '../../platform/identity/decorators/public.decorator';
import {
  CurrentUser,
  AuthenticatedUserPayload,
} from '../../platform/identity/decorators/current-user.decorator';
import { PreviewTokenService } from '../services/preview-token.service';
import { TrustedAi, TrustedAiContext } from './decorators/trusted-ai-context.decorator';
import { AiConversationExceptionFilter } from './filters/ai-conversation-exception.filter';
import {
  CreateConversationRequestDto,
  CreateConversationResponseDto,
  ReserveTurnRequestDto,
  ReserveTurnResponseDto,
  ListConversationsQueryDto,
  ListConversationsResponseDto,
  ConversationDetailResponseDto,
  GetMessageHistoryQueryDto,
  MessageHistoryResponseDto,
  UpdateConversationTitleRequestDto,
  UpdateTitleResponseDto,
  ArchiveConversationResponseDto,
  AuditInspectConversationRequestDto,
  AuditInspectResponseDto,
  CancelTurnRequestDto,
  CancelTurnResponseDto,
  CitationDetailResponseDto,
  MessageCitationsResponseDto,
  CitationPreviewResponseDto,
  SubmitFeedbackRequestDto,
  MessageFeedbackResponseDto,
  RevokeFeedbackResponseDto,
  RegenerateTurnRequestDto,
  RegenerateTurnResponseDto,
  AiConversationErrorResponseDto,
} from './dtos/ai-conversation.dtos';
import { AiConversationResponseMapper } from './mappers/ai-conversation-response.mapper';

/**
 * Controller exposing REST endpoints for AI conversation lifecycle and persistence management.
 *
 * Guarantees:
 * - Clean Architecture: Controller contains zero business logic and delegates strictly to use cases.
 * - Direct database access is strictly prohibited (no Prisma imports).
 * - Trusted authentication context enforces tenant and actor isolation on every request.
 * - Application errors are mapped to consistent HTTP error responses via AiConversationExceptionFilter.
 */
@ApiTags('AI - Conversation Management')
@ApiBearerAuth()
@Controller('api/v1/ai/conversations')
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(AiConversationExceptionFilter)
export class AiConversationController {
  private readonly logger = new Logger(AiConversationController.name);

  constructor(
    private readonly createConvUseCase: CreateConversationWithInitialTurnUseCase,
    private readonly reserveTurnUseCase: ReserveConversationTurnUseCase,
    private readonly getConvUseCase: GetConversationUseCase,
    private readonly listConvUseCase: ListConversationsUseCase,
    private readonly getHistoryUseCase: GetMessageHistoryUseCase,
    private readonly updateTitleUseCase: UpdateConversationTitleUseCase,
    private readonly archiveConvUseCase: ArchiveConversationUseCase,
    private readonly inspectUseCase: PrivilegedInspectConversationUseCase,
    private readonly cancelTurnUseCase: CancelConversationTurnUseCase,
    @Optional() private readonly getCitationsUseCase?: GetMessageCitationsUseCase,
    @Optional() private readonly getCitationDetailUseCase?: GetCitationDetailUseCase,
    @Optional() private readonly getCitationPreviewUseCase?: GetCitationPreviewUseCase,
    @Optional()
    private readonly getCitationDocumentStreamUseCase?: GetCitationDocumentStreamUseCase,
    @Optional() private readonly previewTokenService?: PreviewTokenService,
    @Optional() private readonly submitFeedbackUseCase?: SubmitMessageFeedbackUseCase,
    @Optional() private readonly getFeedbackUseCase?: GetMessageFeedbackUseCase,
    @Optional() private readonly revokeFeedbackUseCase?: RevokeMessageFeedbackUseCase,
    @Optional() private readonly regenerateTurnUseCase?: RegenerateConversationTurnUseCase,
  ) {}

  /**
   * Creates a new conversation aggregate together with its initial turn and initial messages atomically.
   * Supports idempotent retry through the clientTurnId.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create conversation with initial turn',
    description:
      'Creates a new AI conversation aggregate, its initial turn, user message, and assistant placeholder atomically. Supports idempotent retries using clientTurnId.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Conversation created successfully or existing idempotent turn recovered',
    type: CreateConversationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input payload (empty prompt, whitespace-only, invalid length)',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Duplicate clientTurnId with payload hash mismatch, or concurrent generation already in progress',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthenticated request missing actor identity',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Missing tenant context in authenticated identity',
    type: AiConversationErrorResponseDto,
  })
  public async createConversation(
    @TrustedAi() auth: TrustedAiContext,
    @Body() body: CreateConversationRequestDto,
  ): Promise<CreateConversationResponseDto> {
    const result = await this.createConvUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      clientTurnId: body.clientTurnId,
      userPrompt: body.userPrompt,
      title: body.title,
      metadata: body.metadata,
      actorContext: {
        roles: auth.roles,
        permissions: auth.permissions,
      },
    });

    return AiConversationResponseMapper.toCreateConversationResponse(result);
  }

  /**
   * Reserves a subsequent conversation turn, user message, and assistant placeholder atomically.
   * Enforces single active turn generation and client-stable idempotency.
   */
  @Post(':id/turns')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reserve subsequent conversation turn',
    description:
      'Reserves the next sequential turn in an active conversation, persists the user prompt, and creates a pending assistant placeholder atomically. Enforces single active turn generation and client-stable idempotency.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Turn reserved successfully or matching idempotent turn recovered',
    type: ReserveTurnResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input payload (empty prompt, whitespace-only, invalid length)',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Turn already in progress on this conversation, or duplicate clientTurnId with payload hash mismatch',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthenticated request',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Cross-tenant access or missing tenant context',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation not found in authenticated tenant',
    type: AiConversationErrorResponseDto,
  })
  public async reserveTurn(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Body() body: ReserveTurnRequestDto,
  ): Promise<ReserveTurnResponseDto> {
    const result = await this.reserveTurnUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      clientTurnId: body.clientTurnId,
      userPrompt: body.userPrompt,
      metadata: body.metadata,
      actorContext: {
        roles: auth.roles,
        permissions: auth.permissions,
      },
    });

    return AiConversationResponseMapper.toReserveTurnResponse(result);
  }

  /**
   * Safely cancels an active or pending conversation turn generation.
   * Enforces client-stable idempotency and terminal integrity.
   */
  @Post(':id/turns/:turnId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel conversation turn generation',
    description:
      'Cancels an active or pending AI generation turn. Signals in-flight execution to abort, transitions generation and turn status to CANCELLED atomically, and preserves idempotency on repeated requests.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'turnId', description: 'Turn unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Turn cancelled successfully or already cancelled',
    type: CancelTurnResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input identifiers',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Turn has already completed and cannot be cancelled',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation or turn not found',
    type: AiConversationErrorResponseDto,
  })
  public async cancelTurn(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Param('turnId') turnId: string,
    @Body() body?: CancelTurnRequestDto,
  ): Promise<CancelTurnResponseDto> {
    const result = await this.cancelTurnUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      turnId,
      reason: body?.reason,
    });

    return AiConversationResponseMapper.toCancelTurnResponse(result);
  }

  /**
   * Safely cancels generation for a given assistant message in a conversation.
   * Resolves the corresponding turn and signals in-flight abort.
   */
  @Post(':id/messages/:messageId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel message generation',
    description:
      'Cancels the active or pending AI generation associated with an assistant message. Transitions turn and message status to CANCELLED atomically.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'messageId', description: 'Assistant message unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message generation cancelled successfully',
    type: CancelTurnResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input identifiers',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Message generation has already completed and cannot be cancelled',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation or message not found',
    type: AiConversationErrorResponseDto,
  })
  public async cancelMessage(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body?: CancelTurnRequestDto,
  ): Promise<CancelTurnResponseDto> {
    const result = await this.cancelTurnUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      reason: body?.reason,
    });

    return AiConversationResponseMapper.toCancelTurnResponse(result);
  }

  /**
   * Safely cancels any active generation in the specified conversation.
   * Finds the currently in-flight turn and signals immediate abort.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel active conversation generation',
    description:
      'Locates and cancels any currently active or pending generation in the specified conversation.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Active generation cancelled successfully',
    type: CancelTurnResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No active generation found to cancel',
    type: AiConversationErrorResponseDto,
  })
  public async cancelActiveGeneration(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Body() body?: CancelTurnRequestDto,
  ): Promise<CancelTurnResponseDto> {
    const result = await this.cancelTurnUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      reason: body?.reason,
    });

    return AiConversationResponseMapper.toCancelTurnResponse(result);
  }

  /**
   * Regenerates an eligible assistant response for a given turn.
   * Preserves historical responses, allocates a new attempt, and dispatches execution.
   */
  @Post(':id/turns/:turnId/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate assistant response for turn',
    description:
      'Triggers regeneration of an eligible assistant response within the specified turn. Validates conversation ownership, single active generation, and latest-turn eligibility. Preserves original response and citations.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'turnId', description: 'Turn unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Turn regeneration scheduled successfully',
    type: RegenerateTurnResponseDto,
  })
  public async regenerateTurn(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Param('turnId') turnId: string,
    @Body() body?: RegenerateTurnRequestDto,
  ): Promise<RegenerateTurnResponseDto> {
    if (!this.regenerateTurnUseCase) {
      throw new BadRequestException('Regeneration use case is not configured.');
    }

    const result = await this.regenerateTurnUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      turnId,
      clientTurnId: body?.clientTurnId,
      messageId: body?.messageId,
      actorContext: {
        roles: auth.roles,
        permissions: auth.permissions,
      },
    });

    this.logger.log({
      event: 'turn.regenerated',
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      turnId,
      attemptNumber: result.attemptNumber,
      assistantMessageId: result.assistantMessageId,
    });

    return AiConversationResponseMapper.toRegenerateTurnResponse(result);
  }

  /**
   * Regenerates an eligible assistant response for a given message.
   * Resolves parent turn and validates latest-turn eligibility.
   */
  @Post(':id/messages/:messageId/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate assistant response for message',
    description:
      'Triggers regeneration of an eligible assistant message. Resolves parent turn, validates eligibility, and creates a new attempt.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'messageId', description: 'Message unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message regeneration scheduled successfully',
    type: RegenerateTurnResponseDto,
  })
  public async regenerateMessage(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body?: RegenerateTurnRequestDto,
  ): Promise<RegenerateTurnResponseDto> {
    if (!this.regenerateTurnUseCase) {
      throw new BadRequestException('Regeneration use case is not configured.');
    }

    const result = await this.regenerateTurnUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      clientTurnId: body?.clientTurnId,
      actorContext: {
        roles: auth.roles,
        permissions: auth.permissions,
      },
    });

    this.logger.log({
      event: 'message.regenerated',
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      turnId: result.turnId,
      attemptNumber: result.attemptNumber,
      assistantMessageId: result.assistantMessageId,
    });

    return AiConversationResponseMapper.toRegenerateTurnResponse(result);
  }

  /**
   * Lists conversation summaries for the authenticated user with keyset pagination.
   */
  @Get()
  @ApiOperation({
    summary: 'List user conversations',
    description: 'Retrieves keyset-paginated conversation summaries for the authenticated user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated list of conversations',
    type: ListConversationsResponseDto,
  })
  public async listConversations(
    @TrustedAi() auth: TrustedAiContext,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ListConversationsResponseDto> {
    const result = await this.listConvUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      cursor: query.cursor,
      limit: query.limit,
      includeArchived: query.includeArchived,
    });

    return AiConversationResponseMapper.toListConversationsResponse(result);
  }

  /**
   * Retrieves conversation aggregate details by ID.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get conversation details',
    description:
      'Retrieves conversation metadata and child turn summaries within the authenticated tenant.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation details retrieved successfully',
    type: ConversationDetailResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Conversation not found in tenant' })
  public async getConversation(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
  ): Promise<ConversationDetailResponseDto> {
    const detail = await this.getConvUseCase.execute({
      tenantId: auth.tenantId,
      conversationId,
      includeTurns: true,
    });

    return AiConversationResponseMapper.toConversationDetailResponse(detail);
  }

  /**
   * Retrieves canonical message history for a conversation using sequence-based keyset pagination.
   */
  @Get(':id/messages')
  @ApiOperation({
    summary: 'Get message history',
    description: 'Retrieves canonical message history ordered monotonically by sequenceNumber ASC.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Canonical message history retrieved successfully',
    type: MessageHistoryResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Conversation not found in tenant' })
  public async getMessageHistory(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Query() query: GetMessageHistoryQueryDto,
  ): Promise<MessageHistoryResponseDto> {
    const history = await this.getHistoryUseCase.execute({
      tenantId: auth.tenantId,
      conversationId,
      cursor: query.cursor,
      limit: query.limit,
    });

    return AiConversationResponseMapper.toMessageHistoryResponse(history);
  }

  /**
   * Updates the title of an active conversation.
   */
  @Patch(':id/title')
  @ApiOperation({
    summary: 'Update conversation title',
    description: 'Updates the title of an active conversation (1-255 characters).',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Title updated successfully',
    type: UpdateTitleResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid title or conversation archived',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Conversation not found in tenant' })
  public async updateTitle(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Body() body: UpdateConversationTitleRequestDto,
  ): Promise<UpdateTitleResponseDto> {
    const result = await this.updateTitleUseCase.execute({
      tenantId: auth.tenantId,
      conversationId,
      title: body.title,
    });

    return AiConversationResponseMapper.toUpdateTitleResponse(result);
  }

  /**
   * Soft-deletes (archives) an existing conversation.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive conversation',
    description: 'Safely soft-deletes a conversation. Prohibited while generation is in progress.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation archived successfully',
    type: ArchiveConversationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Generation in progress; archiving rejected',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Conversation not found in tenant' })
  public async archiveConversation(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
  ): Promise<ArchiveConversationResponseDto> {
    const result = await this.archiveConvUseCase.execute({
      tenantId: auth.tenantId,
      conversationId,
    });

    return AiConversationResponseMapper.toArchiveConversationResponse(result);
  }

  /**
   * Privileged endpoint allowing authorized Owner personnel to inspect conversation history.
   * Enforces Owner role and ai.conversations.audit permission, requiring a justification reason
   * and failing closed if the audit record cannot be committed.
   */
  @Post(':id/audit-inspect')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner')
  @RequirePermissions(PERMISSIONS.AI.CONVERSATIONS_AUDIT)
  @ApiOperation({
    summary: 'Privileged conversation inspection (Owner only)',
    description:
      'Allows authorized Owner personnel to inspect conversation details and full message history. Enforces Owner role and ai.conversations.audit permission. Requires clinical/supervisory justification and persists an immutable audit log before returning data.',
  })
  @ApiParam({ name: 'id', description: 'Conversation unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation inspected successfully and audit log committed',
    type: AuditInspectResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input payload or reason too short (< 10 characters)',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden: caller lacks Owner role or ai.conversations.audit permission',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation not found in authenticated tenant',
    type: AiConversationErrorResponseDto,
  })
  public async auditInspect(
    @TrustedAi() auth: TrustedAiContext,
    @Param('id') conversationId: string,
    @Body() body: AuditInspectConversationRequestDto,
  ): Promise<AuditInspectResponseDto> {
    const result = await this.inspectUseCase.execute({
      tenantId: auth.tenantId,
      conversationId,
      inspectorUserId: auth.actorId,
      inspectorRole: auth.roles[0] ?? 'Owner',
      reason: body.reason,
    });

    return AiConversationResponseMapper.toAuditInspectResponse(result);
  }

  /**
   * Retrieves all citations associated with a specific assistant message.
   * Ordered deterministically by citationPosition ASC.
   */
  @Get(':conversationId/messages/:messageId/citations')
  @ApiOperation({
    summary: 'Get citations for an assistant message',
    description:
      'Returns the list of persistent source citations for an assistant message with dynamic preview availability status.',
  })
  @ApiParam({ name: 'conversationId', description: 'Target conversation identifier' })
  @ApiParam({ name: 'messageId', description: 'Target assistant message identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Citations retrieved successfully',
    type: MessageCitationsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation or message not found',
    type: AiConversationErrorResponseDto,
  })
  public async getMessageCitations(
    @TrustedAi() auth: TrustedAiContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ): Promise<MessageCitationsResponseDto> {
    if (!this.getCitationsUseCase) {
      throw new BadRequestException('Citation service is not configured');
    }

    const result = await this.getCitationsUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      userRoles: auth.roles,
    });

    return {
      messageId: result.messageId,
      conversationId: result.conversationId,
      citations: result.citations.map((c) => ({
        id: c.id,
        messageId: c.messageId,
        turnId: c.turnId,
        conversationId: c.conversationId,
        citationPosition: c.citationPosition,
        documentId: c.documentId,
        documentTitleSnapshot: c.documentTitleSnapshot,
        documentTitle: c.documentTitle,
        originalFileName: c.originalFileName ?? null,
        documentStatus: c.documentStatus ?? null,
        documentVersionId: c.documentVersionId,
        documentVersionNumber: c.documentVersionNumber,
        chunkId: c.chunkId,
        excerpt: c.excerpt,
        pageNumber: c.pageNumber,
        headingPath: c.headingPath,
        retrievalRank: c.retrievalRank,
        relevanceScore: c.relevanceScore,
        sourceStrategy: c.sourceStrategy,
        previewStatus: c.previewStatus,
        canPreview: c.canPreview,
        previewUnavailableReason: c.previewUnavailableReason,
        mimeType: c.mimeType,
        fileSizeBytes: c.fileSizeBytes,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Retrieves details for a specific citation within an assistant message.
   */
  @Get(':conversationId/messages/:messageId/citations/:citationId')
  @ApiOperation({
    summary: 'Get single citation detail',
    description:
      'Returns complete detail and dynamic preview metadata for a single persistent source citation.',
  })
  @ApiParam({ name: 'conversationId', description: 'Target conversation identifier' })
  @ApiParam({ name: 'messageId', description: 'Target assistant message identifier' })
  @ApiParam({ name: 'citationId', description: 'Target citation identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Citation details retrieved successfully',
    type: CitationDetailResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Citation, message, or conversation not found',
    type: AiConversationErrorResponseDto,
  })
  public async getCitationDetail(
    @TrustedAi() auth: TrustedAiContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('citationId') citationId: string,
  ): Promise<CitationDetailResponseDto> {
    if (!this.getCitationDetailUseCase) {
      throw new BadRequestException('Citation service is not configured');
    }

    const result = await this.getCitationDetailUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      citationId,
      userRoles: auth.roles,
    });

    const c = result.citation;
    return {
      id: c.id,
      messageId: c.messageId,
      turnId: c.turnId,
      conversationId: c.conversationId,
      citationPosition: c.citationPosition,
      documentId: c.documentId,
      documentTitleSnapshot: c.documentTitleSnapshot,
      documentTitle: c.documentTitle,
      originalFileName: c.originalFileName ?? null,
      documentStatus: c.documentStatus ?? null,
      documentVersionId: c.documentVersionId,
      documentVersionNumber: c.documentVersionNumber,
      chunkId: c.chunkId,
      excerpt: c.excerpt,
      pageNumber: c.pageNumber,
      headingPath: c.headingPath,
      retrievalRank: c.retrievalRank,
      relevanceScore: c.relevanceScore,
      sourceStrategy: c.sourceStrategy,
      previewStatus: c.previewStatus,
      canPreview: c.canPreview,
      previewUnavailableReason: c.previewUnavailableReason,
      mimeType: c.mimeType,
      fileSizeBytes: c.fileSizeBytes,
      createdAt: c.createdAt,
    };
  }

  /**
   * Retrieves preview availability and access state for a citation document.
   * Never accepts client-supplied documentId as sufficient authorization.
   */
  @Get(':conversationId/messages/:messageId/citations/:citationId/preview')
  @ApiOperation({
    summary: 'Get authorized document preview availability for a citation',
    description:
      'Verifies conversation ownership, message and citation association, document existence, visibility clearance, format support, and storage availability. Returns preview metadata and short-lived preview token.',
  })
  @ApiParam({ name: 'conversationId', description: 'Target conversation identifier' })
  @ApiParam({ name: 'messageId', description: 'Target assistant message identifier' })
  @ApiParam({ name: 'citationId', description: 'Target citation identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Preview metadata and access authorization returned',
    type: CitationPreviewResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Citation, message, or conversation not found',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Tenant or conversation ownership violation',
    type: AiConversationErrorResponseDto,
  })
  public async getCitationPreview(
    @TrustedAi() auth: TrustedAiContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('citationId') citationId: string,
  ): Promise<CitationPreviewResponseDto> {
    if (!this.getCitationPreviewUseCase) {
      throw new BadRequestException('Citation preview service is not configured');
    }

    const result = await this.getCitationPreviewUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      citationId,
      userRoles: auth.roles,
    });

    const p = result.preview;
    let previewToken: string | null = null;
    if (p.canPreview && this.previewTokenService) {
      previewToken = this.previewTokenService.generateToken({
        tenantId: auth.tenantId,
        userId: auth.actorId,
        conversationId,
        messageId,
        citationId,
        documentId: p.documentId,
      });
    }

    const previewUrl = `/api/v1/ai/conversations/${conversationId}/messages/${messageId}/citations/${citationId}/content`;

    this.logger.log(
      JSON.stringify({
        event: 'citation.preview.requested',
        tenantId: auth.tenantId,
        userId: auth.actorId,
        conversationId,
        messageId,
        citationId,
        documentId: p.documentId,
        previewStatus: p.previewStatus,
        canPreview: p.canPreview,
      }),
    );

    return {
      documentId: p.documentId,
      citationId: p.citationId,
      messageId: p.messageId,
      conversationId: p.conversationId,
      documentTitleSnapshot: p.documentTitleSnapshot,
      documentTitle: p.documentTitle,
      originalFileName: p.originalFileName,
      mimeType: p.mimeType,
      fileSizeBytes: p.fileSizeBytes,
      documentVersionId: p.documentVersionId,
      documentVersionNumber: p.documentVersionNumber,
      pageNumber: p.pageNumber,
      headingPath: p.headingPath,
      excerpt: p.excerpt,
      canPreview: p.canPreview,
      supportedFormat: p.supportedFormat,
      previewStatus: p.previewStatus,
      previewUnavailableReason: p.previewUnavailableReason,
      downloadAllowed: p.downloadAllowed,
      previewToken,
      previewUrl,
    };
  }

  /**
   * Streams authorized document content for a citation preview.
   * Accepts standard Bearer JWT or verified short-lived preview token.
   */
  @Get(':conversationId/messages/:messageId/citations/:citationId/content')
  @Public()
  @ApiOperation({
    summary: 'Stream authorized document content for citation preview',
    description:
      'Streams original document binary or text content. Enforces tenant boundary, conversation ownership, role clearance, and previewable MIME type. Requires Bearer JWT or valid short-lived preview token.',
  })
  @ApiParam({ name: 'conversationId', description: 'Target conversation identifier' })
  @ApiParam({ name: 'messageId', description: 'Target assistant message identifier' })
  @ApiParam({ name: 'citationId', description: 'Target citation identifier' })
  @ApiQuery({ name: 'token', required: false, description: 'Optional short-lived preview token' })
  @ApiResponse({ status: 200, description: 'Binary or text document content stream' })
  @ApiResponse({ status: 401, description: 'Missing or expired authorization' })
  @ApiResponse({ status: 403, description: 'Role clearance or ownership violation' })
  @ApiResponse({ status: 404, description: 'Citation, conversation, or storage file not found' })
  @ApiResponse({ status: 415, description: 'Unsupported media type for inline preview' })
  public async getCitationDocumentContent(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('citationId') citationId: string,
    @Query('token') queryToken: string | undefined,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.getCitationDocumentStreamUseCase) {
      throw new BadRequestException('Citation stream service is not configured');
    }

    let tenantId = user?.tenantId;
    let userId = user?.id;
    const userRoles = user?.roles ? [...user.roles] : [];

    // If query token is provided, verify it cryptographically
    if (queryToken) {
      if (!this.previewTokenService) {
        throw new BadRequestException('Preview token service is not configured');
      }

      let parsedTenant = tenantId;
      if (!parsedTenant) {
        try {
          const payloadBase64 = queryToken.split('.')[0];
          if (payloadBase64) {
            const claims = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
            parsedTenant = claims.tenantId;
          }
        } catch {
          throw new ForbiddenException('Invalid preview token format.');
        }
      }

      if (!parsedTenant) {
        throw new ForbiddenException('Missing tenant context in preview token.');
      }

      const verification = this.previewTokenService.verifyToken(queryToken, {
        tenantId: parsedTenant,
        conversationId,
        messageId,
        citationId,
      });

      if (!verification.valid || !verification.claims) {
        throw new ForbiddenException(verification.error ?? 'Invalid or expired preview token.');
      }

      tenantId = verification.claims.tenantId;
      userId = verification.claims.userId;
    }

    if (!tenantId) {
      throw new UnauthorizedException('Authentication token or valid preview token required.');
    }

    const result = await this.getCitationDocumentStreamUseCase.execute({
      tenantId,
      userId,
      conversationId,
      messageId,
      citationId,
      userRoles,
    });

    this.logger.log(
      JSON.stringify({
        event: 'citation.document.stream.served',
        tenantId,
        userId,
        conversationId,
        messageId,
        citationId,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
      }),
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.fileSize);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.originalFileName)}"`,
    );
    res.setHeader('ETag', `"${result.checksum}"`);

    res.send(result.data);
  }

  /**
   * Submits or updates feedback on an assistant message.
   * Enforces server-side authentication context and idempotent upsert.
   */
  @Post(':conversationId/messages/:messageId/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit or update feedback for an assistant message',
    description:
      'Records user rating (POSITIVE or NEGATIVE) with optional explanation and category. Idempotently updates existing feedback if already submitted.',
  })
  @ApiParam({ name: 'conversationId', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'messageId', description: 'Assistant message unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feedback submitted or updated successfully',
    type: MessageFeedbackResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or target message is not an assistant response',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User not authorized to access conversation',
    type: AiConversationErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation or message not found',
    type: AiConversationErrorResponseDto,
  })
  public async submitFeedback(
    @TrustedAi() auth: TrustedAiContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: SubmitFeedbackRequestDto,
  ): Promise<MessageFeedbackResponseDto> {
    if (!this.submitFeedbackUseCase) {
      throw new BadRequestException('Feedback service is not available');
    }

    const result = await this.submitFeedbackUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
      rating: body.rating,
      explanation: body.explanation,
      category: body.category,
    });

    this.logger.log(
      JSON.stringify({
        event: 'message.feedback.submitted',
        tenantId: auth.tenantId,
        userId: auth.actorId,
        conversationId,
        messageId,
        rating: body.rating,
        isUpdate: result.isUpdate,
      }),
    );

    return AiConversationResponseMapper.toMessageFeedbackResponse(result.feedback);
  }

  /**
   * Retrieves the current user's feedback for an assistant message.
   */
  @Get(':conversationId/messages/:messageId/feedback')
  @ApiOperation({
    summary: 'Get user feedback for an assistant message',
    description:
      'Returns the feedback record previously submitted by the authenticated user, or 404 if not found.',
  })
  @ApiParam({ name: 'conversationId', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'messageId', description: 'Assistant message unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feedback record retrieved successfully',
    type: MessageFeedbackResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation, message, or feedback not found',
    type: AiConversationErrorResponseDto,
  })
  public async getFeedback(
    @TrustedAi() auth: TrustedAiContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ): Promise<MessageFeedbackResponseDto> {
    if (!this.getFeedbackUseCase) {
      throw new BadRequestException('Feedback service is not available');
    }

    const result = await this.getFeedbackUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
    });

    if (!result.feedback) {
      throw new FeedbackNotFoundError(messageId, auth.actorId);
    }

    return AiConversationResponseMapper.toMessageFeedbackResponse(result.feedback);
  }

  /**
   * Deletes/revokes feedback on an assistant message.
   */
  @Delete(':conversationId/messages/:messageId/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke user feedback for an assistant message',
    description: 'Removes the feedback record previously submitted by the authenticated user.',
  })
  @ApiParam({ name: 'conversationId', description: 'Conversation unique identifier' })
  @ApiParam({ name: 'messageId', description: 'Assistant message unique identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Feedback revoked successfully',
    type: RevokeFeedbackResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation or message not found',
    type: AiConversationErrorResponseDto,
  })
  public async revokeFeedback(
    @TrustedAi() auth: TrustedAiContext,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ): Promise<RevokeFeedbackResponseDto> {
    if (!this.revokeFeedbackUseCase) {
      throw new BadRequestException('Feedback service is not available');
    }

    const result = await this.revokeFeedbackUseCase.execute({
      tenantId: auth.tenantId,
      userId: auth.actorId,
      conversationId,
      messageId,
    });

    this.logger.log(
      JSON.stringify({
        event: 'message.feedback.revoked',
        tenantId: auth.tenantId,
        userId: auth.actorId,
        conversationId,
        messageId,
        revoked: result.revoked,
      }),
    );

    return AiConversationResponseMapper.toRevokeFeedbackResponse(result);
  }
}
