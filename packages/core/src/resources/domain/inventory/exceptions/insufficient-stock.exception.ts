import { InventoryDomainException } from './inventory-domain.exception';

export class InsufficientStockException extends InventoryDomainException {
  constructor(sku: string, currentStock: number, requestedDelta: number) {
    super(
      `Insufficient stock for item with SKU '${sku}'. Current stock is ${currentStock.toFixed(2)}, but requested reduction is ${requestedDelta.toFixed(2)}. Invariant [INV-1] violated.`,
    );
    this.name = 'InsufficientStockException';
  }
}
