/**
 * Role of the author in conversation turns.
 * Strictly mirrors the database ConversationRole enum.
 */
export type ConversationRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export const ConversationRole = {
  USER: 'USER' as const,
  ASSISTANT: 'ASSISTANT' as const,
  SYSTEM: 'SYSTEM' as const,
};

export function isValidConversationRole(value: unknown): value is ConversationRole {
  return value === 'USER' || value === 'ASSISTANT' || value === 'SYSTEM';
}
