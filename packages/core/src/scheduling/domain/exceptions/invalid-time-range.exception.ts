export class InvalidTimeRangeException extends Error {
  constructor(message = 'Invalid time range: start date must be strictly before end date.') {
    super(message);
    this.name = 'InvalidTimeRangeException';
    Object.setPrototypeOf(this, InvalidTimeRangeException.prototype);
  }
}
