import { Prisma } from '@prisma/client';
import {
  ConversationNotFoundException,
  TurnNotFoundException,
  MessageNotFoundException,
  DuplicateEntityException,
  InvalidOwnershipException,
  ConversationPersistenceException,
} from '../../../domain/exceptions/conversation.exceptions';

export type EntityContext =
  | 'AiConversation'
  | 'AiConversationTurn'
  | 'AiConversationMessage'
  | 'AiConversationAuditLog'
  | 'AiConversationCitation';

/**
 * Translates Prisma and PostgreSQL database errors into strongly typed domain exceptions.
 * Prevents raw Prisma exceptions and sensitive prompts or message content from leaking into domain callers.
 */
export class PrismaPersistenceErrorHandler {
  public static handle(
    error: unknown,
    entity: EntityContext,
    identifier?: string,
    tenantId?: string,
  ): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002: Unique constraint failed
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? (error.meta.target as string[]).join(', ')
          : String(error.meta?.target ?? identifier ?? 'unknown');
        throw new DuplicateEntityException(entity, target, tenantId);
      }

      // P2025: Record to update/delete/find not found
      if (error.code === 'P2025') {
        switch (entity) {
          case 'AiConversation':
            throw new ConversationNotFoundException(identifier ?? 'unknown', tenantId ?? 'unknown');
          case 'AiConversationTurn':
            throw new TurnNotFoundException(identifier ?? 'unknown');
          case 'AiConversationMessage':
            throw new MessageNotFoundException(identifier ?? 'unknown');
          case 'AiConversationAuditLog':
            throw new ConversationPersistenceException(`Audit record '${identifier}' not found.`);
          case 'AiConversationCitation':
            throw new ConversationPersistenceException(
              `Citation record '${identifier}' not found.`,
            );
        }
      }

      // P2003: Foreign key constraint failed
      if (error.code === 'P2003') {
        const fieldName = String(error.meta?.field_name ?? 'foreign_key');
        throw new InvalidOwnershipException(
          `Foreign key constraint '${fieldName}' failed for entity '${entity}' in tenant '${tenantId ?? 'unknown'}'. Cross-tenant or invalid ownership boundary referenced.`,
        );
      }
    }

    if (
      error instanceof ConversationNotFoundException ||
      error instanceof TurnNotFoundException ||
      error instanceof MessageNotFoundException ||
      error instanceof DuplicateEntityException ||
      error instanceof InvalidOwnershipException ||
      error instanceof ConversationPersistenceException
    ) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ConversationPersistenceException(
      `Persistence failure on entity '${entity}' (${identifier ?? 'unidentified'}): ${message}`,
      error,
    );
  }
}
