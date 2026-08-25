import { InventoryDomainException } from './inventory-domain.exception';

export class InvalidInventoryItemStateException extends InventoryDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInventoryItemStateException';
  }
}
