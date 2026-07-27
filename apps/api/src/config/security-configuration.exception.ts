/**
 * Fatal exception thrown when security critical configuration parameters
 * (such as production JWT secrets or database encryption credentials) are missing or insecure.
 */
export class SecurityConfigurationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityConfigurationException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
