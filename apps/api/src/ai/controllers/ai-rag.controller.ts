import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseFilters,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  GatewayTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
  IGenerateGroundedAnswerUseCase,
  ChatMessage,
  RetrievalAuthContext,
  EmptyRetrievalQueryException,
  InvalidRetrievalQueryException,
  InvalidSimilarityScoreException,
  InvalidRetrievalConfigurationException,
  InvalidMetadataFilterException,
  UnauthorizedRetrievalException,
  UnauthorizedConversationAccessException,
  ConversationNotFoundException,
  ProviderTimeoutException,
  LLMProviderUnavailableException,
  ModelNotFoundException,
  GenerationCancelledException,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  CurrentUser,
  AuthenticatedUserPayload,
} from '../../platform/identity/decorators/current-user.decorator';
import { RETRIEVAL_SECURITY_POLICY_SERVICE } from '../ai.tokens';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { QueryKnowledgeRequestDto, RAGAnswerResponseDto } from './dtos/rag-query.dto';
import { AiExceptionFilter } from '../filters/ai-exception.filter';

/**
 * Controller exposing production RAG (Retrieval-Augmented Generation) query endpoints.
 * Coordinates authenticated user context, pre-retrieval authorization,
 * hybrid knowledge retrieval, bounded context building, grounded Qwen answer generation,
 * and citation verification.
 */
@ApiTags('AI - Grounded Knowledge Retrieval (RAG)')
@ApiBearerAuth()
@Controller(['api/v1/ai/knowledge/query', 'api/v1/ai/rag/query', 'api/v1/ai/query'])
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(AiExceptionFilter)
export class AiRAGController {
  constructor(
    @Inject(GENERATE_GROUNDED_ANSWER_USE_CASE_PORT)
    private readonly ragOrchestrator: IGenerateGroundedAnswerUseCase,
    @Inject(RETRIEVAL_SECURITY_POLICY_SERVICE)
    private readonly securityPolicy: RetrievalSecurityPolicyService,
  ) {}

  /**
   * POST /api/v1/ai/knowledge/query
   * Executes a grounded RAG generation pipeline using authorized evidence chunks.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Query verified knowledge base and synthesize a grounded answer',
    description:
      'Performs pre-retrieval tenant and RBAC filtering, retrieves relevant chunks via semantic/hybrid search, and generates a factual answer verified by source citations.',
  })
  @ApiResponse({
    status: 200,
    type: RAGAnswerResponseDto,
    description: 'Synthesized grounded answer or graceful abstention with verified citations',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameters or empty search text' })
  @ApiResponse({ status: 401, description: 'Missing or expired authentication token' })
  @ApiResponse({ status: 403, description: 'User unauthorized for requested knowledge or tenant' })
  @ApiResponse({ status: 404, description: 'Conversation session not found' })
  @ApiResponse({ status: 503, description: 'LLM inference provider unavailable or overloaded' })
  @ApiResponse({
    status: 504,
    description: 'Generation request exceeded configured deadline budget',
  })
  public async queryKnowledge(
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Body() dto: QueryKnowledgeRequestDto,
  ): Promise<RAGAnswerResponseDto> {
    const { tenantId, userId, roles } = this.extractAuthContext(user);

    // Resolve RBAC allowed visibility scopes strictly from verified user roles
    const allowedVisibilityScopes = this.securityPolicy.resolveAllowedVisibilityScopes(roles);

    const authContext: RetrievalAuthContext = {
      tenantId,
      userId,
      roles: [...roles],
      allowedVisibilityScopes,
    };

    // Convert transport chat messages to immutable domain ChatMessage value objects
    const conversationHistory = dto.conversationHistory?.map((msg) =>
      ChatMessage.create({
        role: msg.role,
        content: msg.content,
      }),
    );

    try {
      const ragAnswer = await this.ragOrchestrator.execute({
        query: dto.query,
        authContext,
        searchMode: dto.searchMode,
        topK: dto.topK,
        conversationId: dto.conversationId,
        conversationHistory,
      });

      return {
        answer: ragAnswer.answer,
        grounded: ragAnswer.grounded,
        sources: ragAnswer.sources.map((src) => ({
          documentId: src.documentId,
          documentTitle: src.documentTitle,
          chunkId: src.chunkId,
          pageNumber: src.pageNumber,
          headingPath: src.headingPath ? [...src.headingPath] : undefined,
          relevanceScore: src.relevanceScore,
          sourceStrategy: src.sourceStrategy,
          excerpt: src.excerpt,
          documentVersionId: src.documentVersionId,
          documentVersionNumber: src.documentVersionNumber,
          retrievalRank: src.retrievalRank,
        })),
        metadata: {
          model: ragAnswer.metadata.model,
          retrievalCount: ragAnswer.metadata.retrievalCount,
          latencyMs: ragAnswer.metadata.latencyMs,
          finishReason: ragAnswer.metadata.finishReason,
        },
      };
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  private extractAuthContext(user: AuthenticatedUserPayload | null): {
    tenantId: string;
    userId: string;
    roles: string[];
  } {
    if (!user) {
      throw new UnauthorizedException('Authentication credentials missing or invalid.');
    }
    const tenantId = user.tenantId;
    if (!tenantId || tenantId.trim().length === 0) {
      throw new ForbiddenException('Authenticated user is not assigned to an active tenant.');
    }
    const userId = user.id || user.userId;
    if (!userId || userId.trim().length === 0) {
      throw new UnauthorizedException('Authenticated user identifier is missing.');
    }
    const roles = Array.isArray(user.roles) ? user.roles : [];
    return { tenantId, userId, roles };
  }

  private translateDomainException(err: unknown): never {
    if (
      err instanceof EmptyRetrievalQueryException ||
      err instanceof InvalidRetrievalQueryException ||
      err instanceof InvalidSimilarityScoreException ||
      err instanceof InvalidRetrievalConfigurationException ||
      err instanceof InvalidMetadataFilterException
    ) {
      throw new BadRequestException(err.message);
    }

    if (
      err instanceof UnauthorizedRetrievalException ||
      err instanceof UnauthorizedConversationAccessException
    ) {
      throw new ForbiddenException(err.message);
    }

    if (err instanceof ConversationNotFoundException) {
      throw new NotFoundException(err.message);
    }

    if (err instanceof ProviderTimeoutException) {
      throw new GatewayTimeoutException(err.message);
    }

    if (err instanceof LLMProviderUnavailableException || err instanceof ModelNotFoundException) {
      throw new ServiceUnavailableException(err.message);
    }

    if (err instanceof GenerationCancelledException) {
      throw new BadRequestException('Request cancelled by client or deadline budget.');
    }

    throw err;
  }
}
