import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { IKnowledgeDocumentRepositoryPort } from '../../ports/outbound/knowledge-document-repository.port';
import {
  GetMessageCitationsInput,
  GetMessageCitationsResult,
  CitationDetailDto,
  CitationPreviewStatus,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  MessageNotFoundError,
  TenantOwnershipViolationError,
} from '../errors/ai-conversation-application.error';
import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';

/**
 * Use case to retrieve all persistent, verifiable citations for an assistant message.
 *
 * Guarantees:
 * - Strictly enforces tenant and conversation boundaries.
 * - Resolves document preview availability status dynamically (Available, Soft-deleted, Restricted, Excerpt-only)
 *   without altering historical citation snapshots.
 * - Deterministic ordering by citationPosition ascending (matches [1], [2], ... in answer text).
 * - Excerpt text is always returned as authoritative justification even if document is later archived.
 */
export class GetMessageCitationsUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly citationRepo: IAiConversationCitationRepositoryPort,
    private readonly documentRepo?: IKnowledgeDocumentRepositoryPort,
  ) {}

  public async execute(input: GetMessageCitationsInput): Promise<GetMessageCitationsResult> {
    if (!input) {
      throw new InvalidTurnInputError('input', 'Input cannot be null or undefined.');
    }

    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }

    const conversationId = input.conversationId?.trim();
    if (!conversationId) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }

    const messageId = input.messageId?.trim();
    if (!messageId) {
      throw new InvalidTurnInputError('messageId', 'Message ID is required.');
    }

    // 1. Verify Conversation Existence & Tenant Ownership
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }
    if (conversation.tenantId !== tenantId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }

    // 2. Verify Message Existence & Association
    const message = await this.messageRepo.findById(tenantId, conversationId, messageId);
    if (!message) {
      throw new MessageNotFoundError(messageId, undefined, conversationId);
    }
    if (message.conversationId.value !== conversationId) {
      throw new MessageNotFoundError(messageId, undefined, conversationId);
    }

    // 3. Retrieve Citations from Repository
    const citations = await this.citationRepo.listByMessage(tenantId, conversationId, messageId);

    // 4. Map Citations with Dynamic Document Preview Availability
    const actorRoles = input.actorRoles ?? input.userRoles ?? [];
    const mappedCitations: CitationDetailDto[] = [];

    for (const citation of citations) {
      let previewStatus: CitationPreviewStatus = 'DOCUMENT_AVAILABLE';
      let documentTitle = citation.documentTitleSnapshot;
      let originalFileName: string | null = null;
      let mimeType: string | null = null;
      let fileSizeBytes: number | null = null;
      let documentVersionNumber: number | null = null;
      let documentStatus = 'ACTIVE';

      if (this.documentRepo) {
        try {
          const doc = await this.documentRepo.findById(tenantId, citation.documentId);
          if (!doc) {
            previewStatus = 'EXCERPT_ONLY';
            documentStatus = 'NOT_FOUND';
          } else {
            documentTitle = doc.title;
            if (doc.isDeleted()) {
              previewStatus = 'DOCUMENT_SOFT_DELETED';
              documentStatus = 'ARCHIVED';
            } else if (doc.visibilityScope !== VisibilityScope.ALL_STAFF) {
              const hasAccess = this.checkRoleAccess(doc.visibilityScope, actorRoles);
              if (!hasAccess) {
                previewStatus = 'DOCUMENT_RESTRICTED';
                documentStatus = 'RESTRICTED';
              } else {
                documentStatus = 'ACTIVE';
              }
            } else {
              documentStatus = 'ACTIVE';
            }

            // Resolve version metadata without exposing storage paths or keys
            let version = citation.documentVersionId
              ? doc.getVersionById(citation.documentVersionId)
              : undefined;
            if (!version) {
              version = doc.getCurrentVersion();
            }
            if (version) {
              originalFileName = version.originalFileName;
              mimeType = version.mimeType;
              fileSizeBytes = version.fileSize;
              documentVersionNumber = version.versionNumber;
            }
          }
        } catch {
          previewStatus = 'EXCERPT_ONLY';
          documentStatus = 'NOT_FOUND';
        }
      }

      const canPreview = previewStatus === 'DOCUMENT_AVAILABLE';
      const previewUnavailableReason =
        previewStatus === 'DOCUMENT_AVAILABLE'
          ? null
          : previewStatus === 'DOCUMENT_SOFT_DELETED'
            ? 'Document has been archived or soft-deleted.'
            : previewStatus === 'DOCUMENT_RESTRICTED'
              ? 'Document access is restricted by role security policy.'
              : 'Full document is not available for preview.';

      mappedCitations.push({
        id: citation.id.value,
        messageId: citation.messageId.value,
        turnId: citation.turnId.value,
        conversationId: citation.conversationId.value,
        documentId: citation.documentId,
        documentTitleSnapshot: citation.documentTitleSnapshot,
        documentTitle,
        originalFileName,
        documentStatus,
        documentVersionId: citation.documentVersionId,
        documentVersionNumber,
        chunkId: citation.chunkId,
        citationPosition: citation.citationPosition,
        excerpt: citation.excerpt,
        pageNumber: citation.pageNumber,
        headingPath: [...citation.headingPath],
        relevanceScore: citation.relevanceScore,
        retrievalRank: citation.retrievalRank,
        sourceStrategy: citation.sourceStrategy,
        previewStatus,
        canPreview,
        previewUnavailableReason,
        mimeType,
        fileSizeBytes,
        createdAt: citation.createdAt.toISOString(),
      });
    }

    return {
      conversationId,
      messageId,
      citations: mappedCitations,
      totalCitations: mappedCitations.length,
    };
  }

  private checkRoleAccess(scope: VisibilityScope, roles: readonly string[]): boolean {
    const normalizedRoles = new Set(roles.map((r) => r.toUpperCase().trim()));

    // Admin / Director / Superadmin has access to all scopes
    if (
      normalizedRoles.has('ADMIN') ||
      normalizedRoles.has('DIRECTOR') ||
      normalizedRoles.has('OWNER') ||
      normalizedRoles.has('SUPERADMIN')
    ) {
      return true;
    }

    if (scope === VisibilityScope.CLINICAL_STAFF) {
      return (
        normalizedRoles.has('KINESIOLOGIST') ||
        normalizedRoles.has('PHYSIOTHERAPIST') ||
        normalizedRoles.has('CLINICIAN') ||
        normalizedRoles.has('PROFESSIONAL') ||
        normalizedRoles.has('TRAINER')
      );
    }

    if (scope === VisibilityScope.MANAGEMENT) {
      return (
        normalizedRoles.has('ADMIN') ||
        normalizedRoles.has('DIRECTOR') ||
        normalizedRoles.has('MANAGER')
      );
    }

    return false;
  }
}
