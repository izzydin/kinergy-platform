import { InventoryDomainException } from './inventory-domain.exception';

export class InvalidSkuException extends InventoryDomainException {
  constructor(invalidSku: string, details?: string) {
    super(
      `Invalid SKU '${invalidSku}'. SKU must be an uppercase alphanumeric string between 3 and 32 characters (letters, numbers, hyphens, and underscores only).${
        details ? ` Details: ${details}` : ''
      }`,
    );
    this.name = 'InvalidSkuException';
  }
}
