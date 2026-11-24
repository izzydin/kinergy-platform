/**
 * Status of an individual AI generation attempt (AiConversationMessage).
 * Strictly mirrors the database GenerationStatus enum.
 */
export type GenerationStatus =
  'PENDING' | 'STREAMING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';

export const GenerationStatus = {
  PENDING: 'PENDING' as const,
  STREAMING: 'STREAMING' as const,
  SUCCESS: 'SUCCESS' as const,
  FAILED: 'FAILED' as const,
  CANCELLED: 'CANCELLED' as const,
  INTERRUPTED: 'INTERRUPTED' as const,
};

export function isValidGenerationStatus(value: unknown): value is GenerationStatus {
  return (
    value === 'PENDING' ||
    value === 'STREAMING' ||
    value === 'SUCCESS' ||
    value === 'FAILED' ||
    value === 'CANCELLED' ||
    value === 'INTERRUPTED'
  );
}
