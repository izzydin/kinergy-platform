import { SchedulingDomainException } from './scheduling.exception';

export class OptimisticLockException extends SchedulingDomainException {
  public readonly code = 'OPTIMISTIC_LOCK_CONFLICT';

  constructor(entityName: string, entityId: string, attemptedVersion: number) {
    super(
      `Optimistic concurrency conflict on ${entityName} '${entityId}' (Attempted Version: ${attemptedVersion}). Another transaction has modified this record.`,
    );
  }
}
