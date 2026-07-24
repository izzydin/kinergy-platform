export interface GuardResult {
  succeeded: boolean;
  message?: string;
}

export class Guard {
  public static againstNullOrUndefined(value: unknown, argumentName: string): GuardResult {
    if (value === null || value === undefined) {
      return {
        succeeded: false,
        message: `${argumentName} is null or undefined`,
      };
    }
    return { succeeded: true };
  }
}
