import { InvalidSaleStateException } from './invalid-sale-state.exception';

/**
 * Thrown when an invalid commercial lifecycle state transition is attempted on a Sale aggregate.
 */
export class InvalidSaleTransitionException extends InvalidSaleStateException {
  public override readonly code = 'INVALID_SALE_TRANSITION';

  constructor(
    public readonly currentState: string,
    public readonly targetState: string,
    public readonly reason?: string,
  ) {
    const detail = reason ? ` (${reason})` : '';
    super(
      `Cannot transition Sale from status '${currentState}' to status '${targetState}'${detail}.`,
      'INVALID_SALE_TRANSITION',
    );
    this.name = 'InvalidSaleTransitionException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
