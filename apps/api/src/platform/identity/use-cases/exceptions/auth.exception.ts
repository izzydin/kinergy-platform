export class AuthException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidCredentialsException extends AuthException {
  constructor(message = 'Invalid email or password.') {
    super(message);
  }
}

export class AccountDisabledException extends AuthException {
  constructor(message = 'Invalid email or password.') {
    super(message);
  }
}

export class InvalidTokenException extends AuthException {
  constructor(message = 'Invalid or expired token.') {
    super(message);
  }
}

export class UserNotFoundException extends AuthException {
  constructor(message = 'User profile not found.') {
    super(message);
  }
}
