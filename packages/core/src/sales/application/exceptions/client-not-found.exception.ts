export class ClientNotFoundException extends Error {
  public readonly code: string = 'CLIENT_NOT_FOUND';

  constructor(public readonly clientId: string) {
    super(`Client with ID '${clientId}' was not found.`);
    this.name = 'ClientNotFoundException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
