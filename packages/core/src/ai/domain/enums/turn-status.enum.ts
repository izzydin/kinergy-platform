/**
 * Status of a multi-turn conversation turn (AiConversationTurn).
 * Strictly mirrors the database TurnStatus enum.
 */
export type TurnStatus =
  'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export const TurnStatus = {
  PENDING: 'PENDING' as const,
  STREAMING: 'STREAMING' as const,
  COMPLETED: 'COMPLETED' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
  INTERRUPTED: 'INTERRUPTED' as const,
};

export function isValidTurnStatus(value: unknown): value is TurnStatus {
  return (
    value === 'PENDING' ||
    value === 'STREAMING' ||
    value === 'COMPLETED' ||
    value === 'FAILED' ||
    value === 'CANCELLED' ||
    value === 'INTERRUPTED'
  );
}
