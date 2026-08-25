import { InventoryDomainException } from './inventory-domain.exception';

export class InvalidQuantityException extends InventoryDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuantityException';
  }
}
