export class AssetNotFoundException extends Error {
  public readonly code = 'ASSET_NOT_FOUND';

  constructor(identifier: string) {
    super(`Fixed asset not found with identifier: '${identifier}'.`);
    this.name = 'AssetNotFoundException';
    Object.setPrototypeOf(this, AssetNotFoundException.prototype);
  }
}
