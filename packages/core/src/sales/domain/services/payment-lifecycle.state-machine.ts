import {
  PaymentStatus,
  SUPPORTED_PAYMENT_STATUSES,
  PaymentTransitionRule,
  PAYMENT_TRANSITION_MATRIX,
  ALLOWED_PAYMENT_TRANSITIONS,
  assertValidPaymentStatus,
} from '../enums/payment-status.enum';
import { InvalidPaymentTransitionException } from '../exceptions/invalid-payment-transition.exception';
import { PaymentDomainException } from '../exceptions/payment-domain.exception';

/**
 * Supported transition command action discriminators.
 */
export enum PaymentTransitionAction {
  COMPLETE = 'COMPLETE',
  FAIL = 'FAIL',
  CANCEL = 'CANCEL',
}

/**
 * Command to transition a payment to COMPLETED.
 */
export interface CompletePaymentTransitionCommand {
  readonly action: PaymentTransitionAction.COMPLETE | 'COMPLETE' | 'complete';
}

/**
 * Command to transition a payment to FAILED.
 */
export interface FailPaymentTransitionCommand {
  readonly action: PaymentTransitionAction.FAIL | 'FAIL' | 'fail';
  readonly reason?: string;
}

/**
 * Command to transition a payment to CANCELLED.
 */
export interface CancelPaymentTransitionCommand {
  readonly action: PaymentTransitionAction.CANCEL | 'CANCEL' | 'cancel';
  readonly reason?: string;
}

/**
 * Authoritative discriminated union of all valid transition commands.
 */
export type PaymentTransitionCommand =
  CompletePaymentTransitionCommand | FailPaymentTransitionCommand | CancelPaymentTransitionCommand;

/**
 * Authoritative, deterministic Lifecycle State Machine governing Payment state transitions.
 * Enforces the canonical state machine established by Phase 7.6 ADR-0116:
 *
 *                ┌──────────────┐
 *                │   PENDING    │
 *                └──────┬───────┘
 *                       │
 *             ┌─────────┼─────────┐
 *             ▼         ▼         ▼
 *        COMPLETED    FAILED   CANCELLED
 *
 * Architectural Invariants:
 * 1. Single Authoritative Definition: One source of truth for allowed and prohibited transitions.
 * 2. Determinism: Same (currentStatus, target/command) always produces identical output.
 * 3. Terminal State Immutability: COMPLETED, FAILED, and CANCELLED have zero allowed outgoing transitions.
 * 4. Purity: Zero dependencies on Prisma, NestJS, HTTP, DTOs, or database enums.
 */
export class PaymentLifecycleStateMachine {
  /**
   * The complete 4x4 transition matrix as defined by ADR-0116.
   */
  public static readonly TRANSITION_MATRIX: readonly PaymentTransitionRule[] =
    PAYMENT_TRANSITION_MATRIX;

  /**
   * Authoritative lookup map from source status to allowed target statuses.
   */
  public static readonly ALLOWED_TRANSITIONS: Readonly<
    Record<PaymentStatus, readonly PaymentStatus[]>
  > = ALLOWED_PAYMENT_TRANSITIONS;

  /**
   * Evaluates whether a transition from source status to target status is legally permitted.
   * Answers the domain query: "Can this Payment move from state A to state B?"
   */
  public static canTransition(currentStatus: PaymentStatus, targetStatus: PaymentStatus): boolean {
    assertValidPaymentStatus(currentStatus);
    assertValidPaymentStatus(targetStatus);

    if (currentStatus === targetStatus) {
      return false; // Self-transitions and repeated transitions are prohibited
    }

    const allowed = this.ALLOWED_TRANSITIONS[currentStatus];
    return allowed ? allowed.includes(targetStatus) : false;
  }

  /**
   * Returns the list of permitted destination statuses from a given current status.
   */
  public static getAllowedTransitions(currentStatus: PaymentStatus): readonly PaymentStatus[] {
    assertValidPaymentStatus(currentStatus);
    return this.ALLOWED_TRANSITIONS[currentStatus] ?? Object.freeze([]);
  }

  /**
   * Returns the list of prohibited destination statuses from a given current status.
   */
  public static getProhibitedTransitions(currentStatus: PaymentStatus): readonly PaymentStatus[] {
    assertValidPaymentStatus(currentStatus);
    const allowed = this.getAllowedTransitions(currentStatus);
    return Object.freeze(SUPPORTED_PAYMENT_STATUSES.filter((target) => !allowed.includes(target)));
  }

  /**
   * Evaluates whether a status represents a terminal state with zero outgoing transitions.
   */
  public static isTerminal(status: PaymentStatus): boolean {
    assertValidPaymentStatus(status);
    return this.getAllowedTransitions(status).length === 0;
  }

  /**
   * Resolves the target PaymentStatus for a given transition action.
   * Throws PaymentDomainException if the action is unrecognized.
   */
  public static resolveTargetStatus(action: unknown): PaymentStatus {
    if (typeof action !== 'string') {
      throw new PaymentDomainException(
        `Invalid transition command action: '${String(action)}'. Supported actions: COMPLETE, FAIL, CANCEL.`,
        'INVALID_TRANSITION_COMMAND',
      );
    }

    const normalized = action.trim().toUpperCase();
    switch (normalized) {
      case PaymentTransitionAction.COMPLETE:
        return PaymentStatus.COMPLETED;
      case PaymentTransitionAction.FAIL:
        return PaymentStatus.FAILED;
      case PaymentTransitionAction.CANCEL:
        return PaymentStatus.CANCELLED;
      default:
        throw new PaymentDomainException(
          `Invalid transition command action: '${action}'. Supported actions: COMPLETE, FAIL, CANCEL.`,
          'INVALID_TRANSITION_COMMAND',
        );
    }
  }

  /**
   * Generates a descriptive reason message for an invalid transition attempt.
   */
  public static getInvalidTransitionReason(
    currentStatus: PaymentStatus,
    targetStatus: PaymentStatus,
  ): string {
    if (currentStatus === targetStatus) {
      if (currentStatus === PaymentStatus.COMPLETED) {
        return 'Completed payments are permanently immutable';
      }
      return `Cannot transition from '${currentStatus}' to identical status '${targetStatus}' (repeated transition prohibited)`;
    }

    if (currentStatus === PaymentStatus.COMPLETED) {
      return 'Completed payments are permanently immutable';
    }

    if (targetStatus === PaymentStatus.COMPLETED) {
      return `Cannot settle a payment that is ${currentStatus}`;
    }

    if (targetStatus === PaymentStatus.FAILED) {
      return `Cannot fail a payment that is ${currentStatus}`;
    }

    if (targetStatus === PaymentStatus.CANCELLED) {
      return `Cannot cancel a payment that is ${currentStatus}`;
    }

    return `Transition from '${currentStatus}' to '${targetStatus}' is prohibited by ADR-0116 lifecycle rules`;
  }

  /**
   * Asserts that a transition from currentStatus to targetStatus is valid.
   * Throws InvalidPaymentTransitionException if the transition is prohibited.
   */
  public static assertTransitionValid(
    currentStatus: PaymentStatus,
    targetStatus: PaymentStatus,
    customReason?: string,
  ): void {
    assertValidPaymentStatus(currentStatus);
    assertValidPaymentStatus(targetStatus);

    if (!this.canTransition(currentStatus, targetStatus)) {
      const reason = customReason ?? this.getInvalidTransitionReason(currentStatus, targetStatus);
      throw new InvalidPaymentTransitionException(currentStatus, targetStatus, reason);
    }
  }

  /**
   * Deterministically calculates the next PaymentStatus given a current status and target or command.
   * Throws InvalidPaymentTransitionException if the transition is prohibited.
   * Old state remains completely untouched on exception.
   */
  public static transition(
    currentStatus: PaymentStatus,
    targetOrCommand: PaymentStatus | PaymentTransitionCommand,
  ): PaymentStatus {
    let targetStatus: PaymentStatus;

    if (
      typeof targetOrCommand === 'object' &&
      targetOrCommand !== null &&
      'action' in targetOrCommand
    ) {
      targetStatus = this.resolveTargetStatus(targetOrCommand.action);
    } else {
      targetStatus = targetOrCommand as PaymentStatus;
    }

    this.assertTransitionValid(currentStatus, targetStatus);
    return targetStatus;
  }
}
