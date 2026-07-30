export class ClientAlreadyExistsException extends Error {
  constructor(matchField: 'email' | 'phone', value: string) {
    super(
      `Hard Duplicate Rejection: A client profile already exists with the given ${matchField} '${value}'.`,
    );
    this.name = 'ClientAlreadyExistsException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ClientNotFoundException extends Error {
  constructor(clientId: string) {
    super(`Client Not Found: Client with ID '${clientId}' does not exist.`);
    this.name = 'ClientNotFoundException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
