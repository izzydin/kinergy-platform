import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseFilters,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { PERMISSIONS } from '../../platform/identity/authorization/permissions';
import { RequirePermissions } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { Roles } from '../../platform/identity/authorization/decorators/roles.decorator';
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
}
