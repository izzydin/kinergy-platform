export class InvalidDurationException extends Error {
  constructor(message = 'Invalid duration: duration cannot be negative.') {
    super(message);
    this.name = 'InvalidDurationException';
    Object.setPrototypeOf(this, InvalidDurationException.prototype);
  }
}
