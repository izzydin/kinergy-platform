/**
 * Domain Exception thrown when an attendance record invariant is violated.
 */
export class InvalidAttendanceException extends Error {
  constructor(message: string) {
    super(`Invalid Attendance: ${message}`);
    this.name = 'InvalidAttendanceException';
    Object.setPrototypeOf(this, InvalidAttendanceException.prototype);
  }
}
