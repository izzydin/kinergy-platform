import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';
import {
  ConversationNotFoundError,
  MessageNotBelongingToConversationError,
  CitationNotFoundError,
} from '../errors/ai-conversation-application.error';
import {
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
} from '../../domain/exceptions/knowledge-document.exceptions';

export interface AiActorContext {
  readonly actorId: string;
  readonly tenantId: string;
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

export interface ConversationResourceSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
}

export interface DocumentResourceSummary {
  readonly id: string | { readonly value: string };
  readonly tenantId: string;
  readonly uploadedBy?: string;
  readonly visibilityScope: VisibilityScope;
  readonly deletedAt?: Date | null;
  readonly status?: string;
}

export interface DocumentVersionResourceSummary {
  readonly id: string;
  readonly documentId: string;
  readonly versionNumber: number;
}

const ADMINISTRATIVE_ROLES = new Set<string>([
  'owner',
  'superadmin',
  'admin',
  'administrator',
  'manager',
  'management',
  'gestor',
]);

/**
 * Reusable Domain/Application Authorization Policy Service for AI Subsystems.
 *
 * Implements authoritative resource-level access control rules conforming to
 * AI-10.1-AUTHORIZATION-POLICY and ADR-AI-10-001.
 *
 * Guarantees:
 * 1. Independent of HTTP transport, NestJS guards, and Prisma ORM.
 * 2. Cross-tenant and peer-conversation access violations fail closed with 404 (anti-enumeration).
 * 3. Document ownership and version lineage are validated uniformly across operations.
 * 4. General permissions (e.g. ai.conversations.create or ai.documents.upload) never bypass
 *    individual resource ownership boundaries.
 */
export class AiResourceAuthorizationPolicy {
  // =========================================================================
  // Conversation Authorization Rules
  // =========================================================================

  /**
   * Asserts that an actor has permission to access a specific conversation instance.
   * Enforces strict creator scoping (anti-BOLA) and physical tenant isolation.
   *
   * Violation throws ConversationNotFoundError to produce an indistinguishable 404 response.
   */
  public assertConversationAccess(
    actor: AiActorContext,
    conversation: ConversationResourceSummary,
  ): void {
    if (!actor || !conversation) {
      throw new ConversationNotFoundError(
        conversation?.id ?? 'unknown',
        actor?.tenantId ?? 'unknown',
      );
    }

    const cleanActorTenant = actor.tenantId?.trim();
    const cleanConvTenant = conversation.tenantId?.trim();
    if (!cleanActorTenant || !cleanConvTenant || cleanActorTenant !== cleanConvTenant) {
      throw new ConversationNotFoundError(conversation.id, cleanActorTenant ?? 'unknown');
    }

    const cleanActorId = actor.actorId?.trim();
    const cleanConvUserId = conversation.userId?.trim();
    if (!cleanActorId || !cleanConvUserId || cleanActorId !== cleanConvUserId) {
      throw new ConversationNotFoundError(conversation.id, cleanActorTenant);
    }
  }

  /**
   * Asserts that an actor is authorized to archive/delete a conversation.
   * Permitted if caller is the creator, has allowAdminOverride, holds 'ai.conversations.manage',
   * or possesses an administrative role ('Owner' / 'Admin').
   */
  public assertConversationArchival(
    actor: AiActorContext,
    conversation: ConversationResourceSummary,
    allowAdminOverride = false,
  ): void {
    if (!actor || !conversation) {
      throw new ConversationNotFoundError(
        conversation?.id ?? 'unknown',
        actor?.tenantId ?? 'unknown',
      );
    }

    const cleanActorTenant = actor.tenantId?.trim();
    const cleanConvTenant = conversation.tenantId?.trim();
    if (!cleanActorTenant || !cleanConvTenant || cleanActorTenant !== cleanConvTenant) {
      throw new ConversationNotFoundError(conversation.id, cleanActorTenant ?? 'unknown');
    }

    const isCreator =
      actor.actorId && conversation.userId && actor.actorId.trim() === conversation.userId.trim();
    if (isCreator) {
      return;
    }

    const hasManagePerm = actor.permissions?.includes('ai.conversations.manage') ?? false;
    const hasAdminRole = (actor.roles ?? []).some((r) =>
      ['owner', 'superadmin', 'admin'].includes(r.toLowerCase()),
    );

    if (allowAdminOverride && (hasManagePerm || hasAdminRole)) {
      return;
    }

    if (hasManagePerm || hasAdminRole) {
      return;
    }

    throw new ConversationNotFoundError(conversation.id, cleanActorTenant);
  }

  /**
   * Asserts that a message belongs strictly to the specified parent conversation.
   */
  public assertMessageBelongsToConversation(
    messageConversationId: string,
    expectedConversationId: string,
    messageId: string,
  ): void {
    if (
      !messageConversationId ||
      !expectedConversationId ||
      messageConversationId.trim() !== expectedConversationId.trim()
    ) {
      throw new MessageNotBelongingToConversationError(messageId, expectedConversationId);
    }
  }

  /**
   * Asserts that a citation belongs strictly to the specified parent message.
   */
  public assertCitationBelongsToMessage(
    citationMessageId: string,
    expectedMessageId: string,
    citationId: string,
    conversationId: string,
  ): void {
    if (
      !citationMessageId ||
      !expectedMessageId ||
      citationMessageId.trim() !== expectedMessageId.trim()
    ) {
      throw new CitationNotFoundError(citationId, expectedMessageId, conversationId);
    }
  }

  // =========================================================================
  // Document Authorization Rules
  // =========================================================================

  /**
   * Determines whether an actor is authorized to read/view a knowledge document.
   */
  public canAccessDocument(
    actor: AiActorContext,
    doc: DocumentResourceSummary,
    allowedScopes: readonly VisibilityScope[],
  ): boolean {
    if (!actor || !doc) return false;
    if (!actor.tenantId || !doc.tenantId || actor.tenantId.trim() !== doc.tenantId.trim()) {
      return false;
    }
    if (doc.deletedAt !== null && doc.deletedAt !== undefined) {
      return false;
    }
    if (!allowedScopes || !allowedScopes.includes(doc.visibilityScope)) {
      return false;
    }
    return true;
  }

  /**
   * Asserts that an actor has read clearance for a knowledge document.
   * Throws DocumentNotFoundException on tenant mismatch or deleted state (zero leakage),
   * or UnauthorizedDocumentAccessException on visibility scope mismatch.
   */
  public assertDocumentAccess(
    actor: AiActorContext,
    doc: DocumentResourceSummary,
    allowedScopes: readonly VisibilityScope[],
  ): void {
    const docIdStr = doc?.id ? (typeof doc.id === 'string' ? doc.id : doc.id.value) : 'unknown';
    if (
      !actor ||
      !doc ||
      !actor.tenantId ||
      !doc.tenantId ||
      actor.tenantId.trim() !== doc.tenantId.trim()
    ) {
      throw new DocumentNotFoundException(docIdStr);
    }
    if (doc.deletedAt !== null && doc.deletedAt !== undefined) {
      throw new DocumentNotFoundException(docIdStr);
    }
    if (!allowedScopes || !allowedScopes.includes(doc.visibilityScope)) {
      throw new UnauthorizedDocumentAccessException(
        `Insufficient visibility scope clearance for document '${docIdStr}'.`,
      );
    }
  }

  /**
   * Determines whether an actor has management authority over a document
   * (editing metadata, soft-deleting, restoring, or retrying ingestion).
   *
   * Permitted if caller is the uploader, holds 'ai.documents.manage', or holds an administrative role.
   */
  public canManageDocument(actor: AiActorContext, doc?: DocumentResourceSummary): boolean {
    if (!actor) return false;
    if (
      doc &&
      (!actor.tenantId || !doc.tenantId || actor.tenantId.trim() !== doc.tenantId.trim())
    ) {
      return false;
    }

    // Rule A: The original uploader can always manage their document
    if (doc && actor.actorId && doc.uploadedBy && actor.actorId.trim() === doc.uploadedBy.trim()) {
      return true;
    }

    // Rule B: Users with administrative clearance can manage any document in the tenant
    if (actor.permissions?.includes('ai.documents.manage')) {
      return true;
    }

    const hasAdminRole = (actor.roles ?? []).some((r) => ADMINISTRATIVE_ROLES.has(r.toLowerCase()));
    return hasAdminRole;
  }

  /**
   * Asserts that an actor is authorized to manage (update/delete/restore/retry) a document.
   */
  public assertDocumentManage(actor: AiActorContext, doc: DocumentResourceSummary): void {
    const docIdStr = doc?.id ? (typeof doc.id === 'string' ? doc.id : doc.id.value) : 'unknown';
    if (
      !actor ||
      !doc ||
      !actor.tenantId ||
      !doc.tenantId ||
      actor.tenantId.trim() !== doc.tenantId.trim()
    ) {
      throw new DocumentNotFoundException(docIdStr);
    }

    if (!this.canManageDocument(actor, doc)) {
      throw new UnauthorizedDocumentAccessException(
        'You do not have administrative or management permissions to modify this document.',
      );
    }
  }

  /**
   * Asserts that an actor has access to a specific document version by validating
   * lineage against the parent document and checking parent document clearance.
   */
  public assertDocumentVersionAccess(
    actor: AiActorContext,
    parentDoc: DocumentResourceSummary,
    version: DocumentVersionResourceSummary,
    allowedScopes: readonly VisibilityScope[],
  ): void {
    const parentDocIdStr = parentDoc?.id
      ? typeof parentDoc.id === 'string'
        ? parentDoc.id
        : parentDoc.id.value
      : '';
    if (!parentDoc || !version || version.documentId.trim() !== parentDocIdStr.trim()) {
      throw new DocumentNotFoundException(version?.id ?? 'unknown');
    }
    this.assertDocumentAccess(actor, parentDoc, allowedScopes);
  }

  // =========================================================================
  // Knowledge Source Authorization Rules
  // =========================================================================

  /**
   * Determines whether a document is eligible to serve as a retrieved knowledge source for an actor.
   */
  public isDocumentEligibleAsKnowledgeSource(
    doc: DocumentResourceSummary,
    actorTenantId: string,
    allowedScopes: readonly VisibilityScope[],
  ): boolean {
    if (!doc || !actorTenantId) return false;
    if (doc.tenantId.trim() !== actorTenantId.trim()) return false;
    if (doc.deletedAt !== null && doc.deletedAt !== undefined) return false;
    if (doc.status === 'QUARANTINED' || doc.status === 'FAILED') return false;
    if (!allowedScopes.includes(doc.visibilityScope)) return false;
    return true;
  }

  /**
   * Asserts that a citation source is eligible and available for preview.
   * Citations reference documents; this verifies the underlying document remains active and authorized.
   */
  public assertCitationSourceAccess(
    actor: AiActorContext,
    doc: DocumentResourceSummary,
    allowedScopes: readonly VisibilityScope[],
  ): void {
    this.assertDocumentAccess(actor, doc, allowedScopes);
  }
}
