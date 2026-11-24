import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationAuditRepositoryPort } from '../../ports/outbound/ai-conversation-audit-repository.port';
import { AiConversationAuditLog } from '../../domain/models/ai-conversation-audit-log.entity';
import { ConversationDetailDto, MessageDto } from '../dtos/ai-conversation.dtos';
import {
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  InvalidTurnInputError,
  TransactionFailureError,
} from '../errors/ai-conversation-application.error';

export interface PrivilegedInspectConversationInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly inspectorUserId: string;
  readonly inspectorRole: string;
  readonly reason: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface PrivilegedInspectConversationResult {
  readonly auditLogId: string;
  readonly conversation: ConversationDetailDto;
  readonly messages: readonly MessageDto[];
  readonly inspectedAt: string;
}

/**
 * Privileged use case allowing authorized Owner personnel to inspect conversation history.
 *
 * Security & Audit Invariants:
 * 1. Restricted strictly to the 'Owner' role with 'ai.conversations.audit' permission.
 * 2. Scoped strictly to the authenticated tenant.
 * 3. Mandatory justification reason (min 10 characters).
 * 4. Fails closed: if the audit record cannot be committed, execution immediately throws
 *    and NEVER returns conversation content.
 * 5. Preserves independent audit retention in PostgreSQL.
 */
export class PrivilegedInspectConversationUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly auditRepo: IAiConversationAuditRepositoryPort,
  ) {}

  public async execute(
    input: PrivilegedInspectConversationInput,
  ): Promise<PrivilegedInspectConversationResult> {
    // 1. Validate Input
    if (!input) {
      throw new InvalidTurnInputError('input', 'Inspection input cannot be null or undefined.');
    }
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }
    const conversationId = input.conversationId?.trim();
    if (!conversationId) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }
    const inspectorUserId = input.inspectorUserId?.trim();
    if (!inspectorUserId) {
      throw new InvalidTurnInputError('inspectorUserId', 'Inspector user ID is required.');
    }
    const inspectorRole = input.inspectorRole?.trim();
    if (!inspectorRole) {
      throw new InvalidTurnInputError('inspectorRole', 'Inspector role is required.');
    }
    const reason = input.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new InvalidTurnInputError(
        'reason',
        'A clinical or compliance reason of at least 10 characters is required for privileged inspection.',
      );
    }

    // 2. Enforce Owner-Only Policy at Application Level
    if (inspectorRole.toLowerCase() !== 'owner') {
      throw new TenantOwnershipViolationError(
        conversationId,
        tenantId,
        'Privileged conversation inspection is strictly restricted to the Owner role.',
      );
    }

    // 3. Find Conversation within Tenant Scope
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    // 4. Retrieve Canonical Message History
    const historyResult = await this.messageRepo.listCanonicalHistory(tenantId, conversationId, {
      limit: 100,
    });

    const messages: MessageDto[] = historyResult.messages.map((m) => ({
      id: m.id.value,
      turnId: m.turnId.value,
      role: m.role,
      sequenceNumber: m.sequenceNumber,
      attemptNumber: m.attemptNumber,
      isCanonical: m.isCanonical,
      status: m.status,
      content: m.content,
      sources: m.sources,
      metadata: m.metadata ? { ...m.metadata } : null,
      createdAt: m.createdAt.toISOString(),
      completedAt: m.completedAt ? m.completedAt.toISOString() : null,
    }));

    // 5. Create Audit Log Entity
    const auditLog = AiConversationAuditLog.create({
      tenantId,
      conversationId: conversation.id.value,
      conversationTitleSnapshot: conversation.title.value,
      conversationOwnerUserId: conversation.userId,
      inspectorUserId,
      inspectorRole,
      action: 'PRIVILEGED_CONVERSATION_INSPECTED',
      reason,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    // 6. Fail-Closed Audit Persistence: Must succeed before content is returned
    let savedAudit: AiConversationAuditLog;
    try {
      savedAudit = await this.auditRepo.save(auditLog);
    } catch (auditError) {
      throw new TransactionFailureError(
        'Privileged inspection aborted: failed to persist mandatory audit log.',
        auditError,
      );
    }

    const conversationDetail: ConversationDetailDto = {
      id: conversation.id.value,
      tenantId: conversation.tenantId,
      userId: conversation.userId,
      title: conversation.title.value,
      turnCounter: conversation.turnCounter,
      messageCounter: conversation.messageCounter,
      lastActivityAt: conversation.lastActivityAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      isArchived: conversation.isArchived(),
      activeTurnId: null,
    };

    return {
      auditLogId: savedAudit.id,
      conversation: conversationDetail,
      messages,
      inspectedAt: savedAudit.createdAt.toISOString(),
    };
  }
}
