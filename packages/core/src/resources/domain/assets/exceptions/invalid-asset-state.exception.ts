export class InvalidAssetStateException extends Error {
  public readonly code = 'INVALID_ASSET_STATE';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidAssetStateException';
    Object.setPrototypeOf(this, InvalidAssetStateException.prototype);
  }
}
