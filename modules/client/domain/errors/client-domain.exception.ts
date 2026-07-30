export class ClientDomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientDomainException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidClientNameException extends ClientDomainException {
  constructor(reason: string) {
    super(`Invalid Client Name: ${reason}`);
    this.name = 'InvalidClientNameException';
  }
}

export class InvalidEmailAddressException extends ClientDomainException {
  constructor(email: string) {
    super(`Invalid Email Address: '${email}' is not a valid email format.`);
    this.name = 'InvalidEmailAddressException';
  }
}

export class InvalidPhoneNumberException extends ClientDomainException {
  constructor(phone: string) {
    super(
      `Invalid Phone Number: '${phone}' could not be normalized to valid E.164 format (+[country_code][digits]).`,
    );
    this.name = 'InvalidPhoneNumberException';
  }
}

export class InvalidClientReferenceException extends ClientDomainException {
  constructor(ref: string) {
    super(
      `Invalid Client Reference Number: '${ref}' does not match required CLI-YYYY-XXXXX format.`,
    );
    this.name = 'InvalidClientReferenceException';
  }
}

export class ClientAlreadyLinkedException extends ClientDomainException {
  constructor(clientId: string, existingIdentityId: string) {
    super(
      `Client Domain Invariant Violation: Client '${clientId}' is already linked to identity '${existingIdentityId}'.`,
    );
    this.name = 'ClientAlreadyLinkedException';
  }
}

export class ClientAlreadyArchivedException extends ClientDomainException {
  constructor(clientId: string) {
    super(`Client State Transition Error: Client '${clientId}' is already ARCHIVED.`);
    this.name = 'ClientAlreadyArchivedException';
  }
}

export class ClientAlreadyActiveException extends ClientDomainException {
  constructor(clientId: string) {
    super(`Client State Transition Error: Client '${clientId}' is already ACTIVE.`);
    this.name = 'ClientAlreadyActiveException';
  }
}

export class ClientConcurrencyException extends ClientDomainException {
  constructor(clientId: string, expectedVersion: number) {
    super(
      `Optimistic Concurrency Failure: Client '${clientId}' version mismatch. Expected prior version ${expectedVersion - 1}.`,
    );
    this.name = 'ClientConcurrencyException';
  }
}
