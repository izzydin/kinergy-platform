export class SourceNotFoundException extends Error {
  public readonly code: string = 'SOURCE_NOT_FOUND';

  constructor(
    message: string,
    public readonly sourceType?: string,
    public readonly sourceId?: string,
  ) {
    super(message);
    this.name = 'SourceNotFoundException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
