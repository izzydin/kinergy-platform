/**
 * Explicit lifecycle status enum for vector index generations.
 * Guarantees zero ambiguity about which index generation is currently active for retrieval.
 */
export enum IndexGenerationStatus {
  DRAFT = 'DRAFT',
  BUILDING = 'BUILDING',
  VALIDATING = 'VALIDATING',
  ACTIVE = 'ACTIVE',
  RETIRED = 'RETIRED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Validates whether an index generation status is terminal (cannot transition further).
 */
export function isTerminalIndexGenerationStatus(status: IndexGenerationStatus): boolean {
  return status === IndexGenerationStatus.ACTIVE
    ? false
    : status === IndexGenerationStatus.RETIRED ||
        status === IndexGenerationStatus.FAILED ||
        status === IndexGenerationStatus.CANCELLED;
}

/**
 * Validates allowed transitions in the IndexGeneration state machine.
 */
export function isValidIndexGenerationTransition(
  from: IndexGenerationStatus,
  to: IndexGenerationStatus,
): boolean {
  if (from === to) return true;

  switch (from) {
    case IndexGenerationStatus.DRAFT:
      return (
        to === IndexGenerationStatus.BUILDING ||
        to === IndexGenerationStatus.CANCELLED ||
        to === IndexGenerationStatus.FAILED
      );
    case IndexGenerationStatus.BUILDING:
      return (
        to === IndexGenerationStatus.VALIDATING ||
        to === IndexGenerationStatus.FAILED ||
        to === IndexGenerationStatus.CANCELLED
      );
    case IndexGenerationStatus.VALIDATING:
      return (
        to === IndexGenerationStatus.ACTIVE ||
        to === IndexGenerationStatus.FAILED ||
        to === IndexGenerationStatus.CANCELLED
      );
    case IndexGenerationStatus.ACTIVE:
      return to === IndexGenerationStatus.RETIRED;
    case IndexGenerationStatus.RETIRED:
      return to === IndexGenerationStatus.ACTIVE; // Permitted for rollback
    case IndexGenerationStatus.FAILED:
    case IndexGenerationStatus.CANCELLED:
      // Terminal states cannot transition further
      return false;
    default:
      return false;
  }
}

export const canTransitionIndexGeneration = isValidIndexGenerationTransition;
