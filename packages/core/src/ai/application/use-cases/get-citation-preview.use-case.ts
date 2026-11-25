import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { IKnowledgeDocumentRepositoryPort } from '../../ports/outbound/knowledge-document-repository.port';
import { IDocumentStoragePort } from '../../ports/outbound/document-storage.port';
import {
  GetCitationPreviewInput,
  GetCitationPreviewResult,
  CitationPreviewStatus,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  MessageNotFoundError,
  CitationNotFoundError,
  TenantOwnershipViolationError,
} from '../errors/ai-conversation-application.error';
import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';

/**
 * Authoritatively supported MIME types that can be previewed safely in a web browser.
 */
export const PREVIEWABLE_MIME_TYPES = new Set<string>([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

const PRIVILEGED_ROLES = new Set<string>(['Owner', 'Director', 'Admin']);

/**
 * Use case to verify preview availability and retrieve authorized preview metadata for a citation.
 *
 * Enforces:
 * 1. Strict tenant boundary verification.
 * 2. Conversation ownership verification (preventing cross-user inspection).
 * 3. Message-to-conversation association verification.
 * 4. Citation-to-message association verification (never trusts client-supplied document ID).
 * 5. Document lifecycle verification (handles soft-deleted and archived documents safely).
 * 6. Role-based access control against document visibility scope.
 * 7. MIME type validation against previewable formats.
 * 8. Underlying object storage file existence verification.
 * 9. Zero exposure of internal storage keys or physical filesystem paths.
 */
export class GetCitationPreviewUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly citationRepo: IAiConversationCitationRepositoryPort,
    private readonly documentRepo?: IKnowledgeDocumentRepositoryPort,
    private readonly storagePort?: IDocumentStoragePort,
  ) {}

  public async execute(input: GetCitationPreviewInput): Promise<GetCitationPreviewResult> {
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

    // 3. Verify Citation Association (Authoritative documentId from database, never client input)
    const citation = await this.citationRepo.findById(
      tenantId,
      conversationId,
      messageId,
      citationId,
    );
    if (!citation) {
      throw new CitationNotFoundError(citationId, messageId, conversationId);
    }

    // 4. Resolve Document Preview & Access Metadata
    let previewStatus: CitationPreviewStatus = 'DOCUMENT_AVAILABLE';
    let documentTitle = citation.documentTitleSnapshot;
    let originalFileName: string | null = null;
    let mimeType: string | null = null;
    let fileSizeBytes: number | null = null;
    let documentVersionNumber: number | null = null;
    let documentVersionId: string | null = citation.documentVersionId;
    let supportedFormat = false;
    let downloadAllowed = false;
    let previewUnavailableReason: string | null = null;

    if (this.documentRepo) {
      try {
        const doc = await this.documentRepo.findById(tenantId, citation.documentId);
        if (!doc) {
          previewStatus = 'EXCERPT_ONLY';
          previewUnavailableReason = 'Full document is not available for preview.';
        } else {
          documentTitle = doc.title;

          if (doc.isDeleted()) {
            previewStatus = 'DOCUMENT_SOFT_DELETED';
            previewUnavailableReason = 'Document has been archived or soft-deleted.';
          } else if (doc.visibilityScope !== VisibilityScope.ALL_STAFF) {
            const hasAccess = this.checkRoleAccess(doc.visibilityScope, callerRoles);
            if (!hasAccess) {
              previewStatus = 'DOCUMENT_RESTRICTED';
              previewUnavailableReason = 'Document access is restricted by role security policy.';
            } else {
              downloadAllowed = true;
            }
          } else {
            downloadAllowed = true;
          }

          // Resolve target version (prevent silent fallback to newer version if document versions exist)
          let version = citation.documentVersionId
            ? doc.getVersionById(citation.documentVersionId)
            : undefined;
          if (!version && !citation.documentVersionId) {
            version = doc.getCurrentVersion();
          } else if (!version && citation.documentVersionId && doc.getCurrentVersion()) {
            if (previewStatus === 'DOCUMENT_AVAILABLE') {
              previewStatus = 'EXCERPT_ONLY';
              previewUnavailableReason =
                'The specific document version originally cited is no longer available in the repository.';
              downloadAllowed = false;
            }
          } else if (!version) {
            version = doc.getCurrentVersion();
          }

          if (version) {
            originalFileName = version.originalFileName;
            mimeType = version.mimeType;
            fileSizeBytes = version.fileSize;
            documentVersionNumber = version.versionNumber;
            documentVersionId = version.id;

            // Check if format is supported for inline preview
            supportedFormat = PREVIEWABLE_MIME_TYPES.has(version.mimeType.toLowerCase());

            if (previewStatus === 'DOCUMENT_AVAILABLE') {
              if (!supportedFormat) {
                previewStatus = 'UNSUPPORTED_FORMAT';
                previewUnavailableReason = `Inline preview is not supported for this file format (${formatMimeLabel(version.mimeType)}).`;
              } else if (this.storagePort) {
                // Check physical object existence in storage
                const exists = await this.storagePort.exists(tenantId, version.storageKey);
                if (!exists) {
                  previewStatus = 'EXCERPT_ONLY';
                  previewUnavailableReason = 'Document source file is unavailable in storage.';
                  downloadAllowed = false;
                }
              }
            }
          }
        }
      } catch {
        previewStatus = 'EXCERPT_ONLY';
        previewUnavailableReason = 'Full document is not available for preview.';
      }
    }

    const canPreview = previewStatus === 'DOCUMENT_AVAILABLE' && supportedFormat;

    return {
      preview: {
        documentId: citation.documentId,
        citationId: citation.id.value,
        messageId: citation.messageId.value,
        conversationId: citation.conversationId.value,
        documentTitleSnapshot: citation.documentTitleSnapshot,
        documentTitle,
        originalFileName,
        mimeType,
        fileSizeBytes,
        documentVersionId,
        documentVersionNumber,
        pageNumber: citation.pageNumber,
        headingPath: citation.headingPath,
        excerpt: citation.excerpt,
        canPreview,
        supportedFormat,
        previewStatus,
        previewUnavailableReason,
        downloadAllowed,
      },
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

function formatMimeLabel(mime: string): string {
  if (mime.includes('word') || mime.includes('officedocument')) return 'DOCX';
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('markdown')) return 'Markdown';
  if (mime.includes('text')) return 'Texto';
  return mime;
}
