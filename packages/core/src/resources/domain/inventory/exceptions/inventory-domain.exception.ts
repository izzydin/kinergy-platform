export class InventoryDomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryDomainException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
