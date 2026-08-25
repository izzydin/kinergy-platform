import { InventoryDomainException } from './inventory-domain.exception';

export class InvalidMoneyException extends InventoryDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyException';
  }
}
