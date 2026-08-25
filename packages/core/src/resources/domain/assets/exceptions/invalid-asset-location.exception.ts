export class InvalidAssetLocationException extends Error {
  public readonly code = 'INVALID_ASSET_LOCATION';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidAssetLocationException';
    Object.setPrototypeOf(this, InvalidAssetLocationException.prototype);
  }
}
