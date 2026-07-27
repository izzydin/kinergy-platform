/**
 * Captured log entry recorded by MockLogger.
 */
export interface CapturedLogEntry {
  level: 'log' | 'error' | 'warn' | 'debug' | 'verbose';
  message: string;
  context?: string;
  trace?: string;
}

/**
 * Mock Logger capturing logs silently for assertion in tests.
 */
export class MockLogger {
  public logs: CapturedLogEntry[] = [];

  public log(message: string, context?: string): void {
    this.logs.push({ level: 'log', message, context });
  }

  public error(message: string, trace?: string, context?: string): void {
    this.logs.push({ level: 'error', message, trace, context });
  }

  public warn(message: string, context?: string): void {
    this.logs.push({ level: 'warn', message, context });
  }

  public debug(message: string, context?: string): void {
    this.logs.push({ level: 'debug', message, context });
  }

  public verbose(message: string, context?: string): void {
    this.logs.push({ level: 'verbose', message, context });
  }

  public clear(): void {
    this.logs = [];
  }

  public hasLog(messageSubstring: string, level?: CapturedLogEntry['level']): boolean {
    return this.logs.some(
      (entry) => entry.message.includes(messageSubstring) && (!level || entry.level === level),
    );
  }
}
