import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { IKnowledgeDocumentRepositoryPort } from '../../ports/outbound/knowledge-document-repository.port';
import { IDocumentStoragePort } from '../../ports/outbound/document-storage.port';
import {
  GetCitationDocumentStreamInput,
  GetCitationDocumentStreamResult,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  MessageNotFoundError,
  CitationNotFoundError,
  TenantOwnershipViolationError,
  DocumentAccessRestrictedError,
  DocumentArchivedOrDeletedError,
  DocumentPreviewUnsupportedFormatError,
  DocumentFileNotFoundInStorageError,
} from '../errors/ai-conversation-application.error';
import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';
import { PREVIEWABLE_MIME_TYPES } from './get-citation-preview.use-case';

const PRIVILEGED_ROLES = new Set<string>(['Owner', 'Director', 'Admin']);

/**
 * Use case to retrieve the binary document stream for an authorized citation.
 *
 * Guarantees:
 * 1. Strict tenant boundary verification.
 * 2. Conversation ownership verification (preventing cross-user inspection).
 * 3. Citation and message association verification (never accepts client-supplied document ID).
 * 4. Document existence and lifecycle verification (fails closed on deleted/archived documents).
 * 5. Strict role clearance verification against document visibility scope.
 * 6. MIME type validation ensuring only previewable content is returned.
 * 7. Storage file existence check before retrieval.
 * 8. Zero exposure of internal storage keys or filesystem paths.
 */
export class GetCitationDocumentStreamUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly citationRepo: IAiConversationCitationRepositoryPort,
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    private readonly storagePort: IDocumentStoragePort,
  ) {}

  public async execute(
    input: GetCitationDocumentStreamInput,
  ): Promise<GetCitationDocumentStreamResult> {
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

    const citationId = input.citationId?.trim();
    if (!citationId) {
      throw new InvalidTurnInputError('citationId', 'Citation ID is required.');
    }

    const callerRoles = input.actorRoles ?? input.userRoles ?? [];
    const isPrivileged = callerRoles.some((r) => PRIVILEGED_ROLES.has(r));

    // 1. Verify Conversation Existence & Tenant/User Ownership
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }
    if (conversation.tenantId !== tenantId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }
    if (input.userId && conversation.userId !== input.userId && !isPrivileged) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }

    // 2. Verify Message Existence & Association
    const message = await this.messageRepo.findById(tenantId, conversationId, messageId);
    if (!message || message.conversationId.value !== conversationId) {
      throw new MessageNotFoundError(messageId, undefined, conversationId);
    }

    // 3. Verify Citation Association (Authoritative documentId strictly resolved from persistence)
    const citation = await this.citationRepo.findById(
      tenantId,
      conversationId,
      messageId,
      citationId,
    );
    if (!citation) {
      throw new CitationNotFoundError(citationId, messageId, conversationId);
    }

    // 4. Retrieve Document Record
    const doc = await this.documentRepo.findById(tenantId, citation.documentId);
    if (!doc) {
      throw new CitationNotFoundError(citationId, messageId, conversationId);
    }

    // 5. Verify Document Lifecycle (Archived or Soft-Deleted)
    if (doc.isDeleted()) {
      throw new DocumentArchivedOrDeletedError(doc.id.value);
    }

    // 6. Enforce Role Clearance against Visibility Scope
    if (doc.visibilityScope !== VisibilityScope.ALL_STAFF) {
      const hasAccess = this.checkRoleAccess(doc.visibilityScope, callerRoles);
      if (!hasAccess) {
        throw new DocumentAccessRestrictedError(doc.id.value, doc.visibilityScope);
      }
    }

    // 7. Resolve Target Version (prevent silent fallback to newer version if document versions exist)
    let targetVersion = citation.documentVersionId
      ? doc.getVersionById(citation.documentVersionId)
      : undefined;
    if (!targetVersion && !citation.documentVersionId) {
      targetVersion = doc.getCurrentVersion();
    } else if (!targetVersion && citation.documentVersionId && doc.getCurrentVersion()) {
      throw new DocumentArchivedOrDeletedError(
        `Specific version '${citation.documentVersionId}' of document '${doc.id.value}' is unavailable.`,
      );
    } else if (!targetVersion) {
      targetVersion = doc.getCurrentVersion();
    }

    if (!targetVersion) {
      throw new CitationNotFoundError(citationId, messageId, conversationId);
    }

    // 8. Validate MIME Type for Preview
    const mimeType = targetVersion.mimeType.toLowerCase();
    if (!PREVIEWABLE_MIME_TYPES.has(mimeType)) {
      throw new DocumentPreviewUnsupportedFormatError(targetVersion.mimeType, doc.id.value);
    }

    // 9. Verify Storage File Existence & Download
    const exists = await this.storagePort.exists(tenantId, targetVersion.storageKey);
    if (!exists) {
      throw new DocumentFileNotFoundInStorageError(targetVersion.storageKey, tenantId);
    }

    const { data } = await this.storagePort.download(tenantId, targetVersion.storageKey);

    return {
      data,
      mimeType: targetVersion.mimeType,
      fileSize: targetVersion.fileSize,
      originalFileName: targetVersion.originalFileName,
      checksum: targetVersion.checksum,
      pageNumber: citation.pageNumber,
      headingPath: citation.headingPath,
    };
  }

  private checkRoleAccess(scope: VisibilityScope, userRoles: readonly string[]): boolean {
    if (scope === VisibilityScope.ALL_STAFF) {
      return true;
    }

    const normalizedRoles = userRoles.map((r) => r.toUpperCase());

    const CLINICAL_ROLES = [
      'KINESIOLOGIST',
      'PHYSIOTHERAPIST',
      'DOCTOR',
      'CLINICAL_STAFF',
      'DIRECTOR',
      'ADMIN',
      'OWNER',
    ];
    const MANAGEMENT_ROLES = ['MANAGEMENT', 'ADMIN', 'OWNER', 'DIRECTOR'];

    if (scope === VisibilityScope.CLINICAL_STAFF) {
      return normalizedRoles.some((r) => CLINICAL_ROLES.includes(r));
    }

    if (scope === VisibilityScope.MANAGEMENT) {
      return normalizedRoles.some((r) => MANAGEMENT_ROLES.includes(r));
    }

    return false;
  }
}
