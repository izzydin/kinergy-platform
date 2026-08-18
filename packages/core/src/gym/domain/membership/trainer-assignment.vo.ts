import { ValueObject } from '../shared/value-object';

export interface TrainerAssignmentValue {
  readonly trainerId: string;
  readonly assignedAt: Date;
}

/**
 * Value Object representing the operational linkage between a Member and a designated Fitness Trainer.
 * Strictly holds an opaque scalar trainerId (referencing IAM User.id).
 */
export class TrainerAssignment implements ValueObject<TrainerAssignmentValue> {
  private readonly _trainerId: string;
  private readonly _assignedAt: Date;

  private constructor(trainerId: string, assignedAt: Date) {
    if (!trainerId || trainerId.trim().length === 0) {
      throw new Error('Trainer ID cannot be empty.');
    }
    if (!assignedAt || !(assignedAt instanceof Date) || isNaN(assignedAt.getTime())) {
      throw new Error('Assigned date must be a valid Date.');
    }

    this._trainerId = trainerId.trim();
    this._assignedAt = new Date(assignedAt.getTime());
    Object.freeze(this);
  }

  public static create(trainerId: string, assignedAt: Date = new Date()): TrainerAssignment {
    return new TrainerAssignment(trainerId, assignedAt);
  }

  public get trainerId(): string {
    return this._trainerId;
  }

  public get assignedAt(): Date {
    return new Date(this._assignedAt.getTime());
  }

  public getValue(): TrainerAssignmentValue {
    return {
      trainerId: this.trainerId,
      assignedAt: this.assignedAt,
    };
  }

  public equals(other: ValueObject<TrainerAssignmentValue>): boolean {
    if (!other || !(other instanceof TrainerAssignment)) {
      return false;
    }
    const otherVal = other.getValue();
    return (
      this._trainerId === otherVal.trainerId &&
      this._assignedAt.getTime() === otherVal.assignedAt.getTime()
    );
  }
}
