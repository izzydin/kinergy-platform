import { Injectable, Inject } from '@nestjs/common';
import {
  VisibilityScope,
  IKnowledgeDocumentRepositoryPort,
  KNOWLEDGE_DOCUMENT_REPOSITORY_PORT,
  AiResourceAuthorizationPolicy,
} from '@kinergy-platform/core';

export interface DocumentAuthorizationResult {
  readonly authorizedDocumentIds?: string[];
  readonly isDenied: boolean;
}

/**
 * Service enforcing pre-retrieval access control, RBAC visibility scope mapping,
 * and document-level authorization boundaries.
 *
 * Implements the security principle of Least Privilege and Fail-Closed semantics.
 */
@Injectable()
export class RetrievalSecurityPolicyService {
  private readonly resourcePolicy = new AiResourceAuthorizationPolicy();

  constructor(
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY_PORT)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
  ) {}

  /**
   * Resolves allowable document visibility scopes based on the authenticated user's assigned roles.
   * Fails closed by returning an empty array if no recognized roles are held.
   */
  public resolveAllowedVisibilityScopes(roles: readonly string[]): VisibilityScope[] {
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return [];
    }

    const scopes = new Set<VisibilityScope>();

    for (const rawRole of roles) {
      const role = rawRole.trim().toLowerCase();

      // Executive / Management Tier
      if (
        role === 'owner' ||
        role === 'superadmin' ||
        role === 'admin' ||
        role === 'management' ||
        role === 'manager'
      ) {
        scopes.add(VisibilityScope.ALL_STAFF);
        scopes.add(VisibilityScope.CLINICAL_STAFF);
        scopes.add(VisibilityScope.MANAGEMENT);
      }
      // Clinical Tier (Physiotherapists, Doctors, Kinesiologists)
      else if (
        role === 'therapist' ||
        role === 'clinical staff' ||
        role === 'clinical' ||
        role === 'doctor' ||
        role === 'physiotherapist'
      ) {
        scopes.add(VisibilityScope.ALL_STAFF);
        scopes.add(VisibilityScope.CLINICAL_STAFF);
      }
      // Operational Staff Tier (Trainers, Receptionists, Kitchen Staff)
      else if (
        role === 'trainer' ||
        role === 'receptionist' ||
        role === 'staff' ||
        role === 'kitchen staff'
      ) {
        scopes.add(VisibilityScope.ALL_STAFF);
      }
    }

    return Array.from(scopes);
  }

  /**
   * Evaluates requested document IDs against tenant ownership, soft-delete state,
   * and visibility clearance.
   *
   * Invariants:
   * - Documents belonging to other tenants are silently dropped (zero leakage of existence).
   * - Soft-deleted documents are silently dropped.
   * - Documents with higher visibility classification than allowedScopes are dropped.
   * - If an explicit subset of documentIds was requested, but NONE are authorized,
   *   returns `isDenied: true` to trigger an immediate zero-result response.
   */
  public async resolveAuthorizedDocumentIds(
    tenantId: string,
    requestedDocumentIds: string[] | undefined,
    allowedScopes: readonly VisibilityScope[],
  ): Promise<DocumentAuthorizationResult> {
    if (!requestedDocumentIds || requestedDocumentIds.length === 0) {
      return { authorizedDocumentIds: undefined, isDenied: false };
    }

    const cleanIds = Array.from(
      new Set(
        requestedDocumentIds
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter((id) => id.length > 0),
      ),
    );

    if (cleanIds.length === 0) {
      return { authorizedDocumentIds: undefined, isDenied: false };
    }

    const authorizedIds: string[] = [];

    // Verify each document individually through the tenant-scoped repository
    for (const docId of cleanIds) {
      try {
        const doc = await this.documentRepo.findById(tenantId, docId);
        if (!doc) {
          // Document does not exist in this tenant (or belongs to another tenant).
          // Silently discard to prevent existence enumeration.
          continue;
        }

        // Authoritative eligibility check via AiResourceAuthorizationPolicy
        const isEligible = this.resourcePolicy.isDocumentEligibleAsKnowledgeSource(
          {
            id: doc.id.value,
            tenantId: doc.tenantId,
            uploadedBy: doc.uploadedBy,
            visibilityScope: doc.visibilityScope,
            deletedAt: doc.deletedAt,
          },
          tenantId,
          allowedScopes,
        );

        if (!isEligible) {
          continue;
        }

        authorizedIds.push(doc.id.value);
      } catch {
        // Persistence or validation error - fail closed for this document
        continue;
      }
    }

    if (authorizedIds.length === 0) {
      // User specifically requested a document subset, but has clearance for none of them.
      // Deny access without revealing document existence.
      return { authorizedDocumentIds: [], isDenied: true };
    }

    return { authorizedDocumentIds: authorizedIds, isDenied: false };
  }
}
