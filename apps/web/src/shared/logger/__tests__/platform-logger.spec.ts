import {
  ConsoleSink,
  LogEntry,
  LogSink,
  PlatformLogger,
  sanitizeMetadata,
  sanitizeValue,
} from '../platform-logger';

class MemorySink implements LogSink {
  public entries: LogEntry[] = [];
  log(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

describe('Step A6.4 — Structured Logger Infrastructure', () => {
  let memorySink: MemorySink;

  beforeEach(() => {
    memorySink = new MemorySink();
    PlatformLogger.clearSinks();
    PlatformLogger.addSink(memorySink);
    PlatformLogger.setMinLevel('debug');
  });

  afterEach(() => {
    PlatformLogger.resetMinLevel();
    PlatformLogger.clearSinks();
    PlatformLogger.addSink(new ConsoleSink());
  });

  describe('1. Log Level Hierarchy & Contextual Logging', () => {
    it('emits log entries with level, context, message, and timestamp', () => {
      const logger = new PlatformLogger('TestContext');

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');

      expect(memorySink.entries.length).toBe(3);
      expect(memorySink.entries[0]).toMatchObject({
        level: 'debug',
        message: 'Debug message',
        context: 'TestContext',
      });
      expect(memorySink.entries[1]?.level).toBe('info');
      expect(memorySink.entries[2]?.level).toBe('warn');
      expect(typeof memorySink.entries[0]?.timestamp).toBe('string');
    });

    it('creates child contextual loggers via withContext', () => {
      const parentLogger = new PlatformLogger('Parent');
      const childLogger = parentLogger.withContext('ChildService');

      childLogger.info('Child operation completed');

      expect(memorySink.entries[0]?.context).toBe('ChildService');
    });

    it('serializes Error instances in error logging method', () => {
      const logger = new PlatformLogger('ErrorContext');
      const error = new Error('Database connection failed');

      logger.error('Unhandled database error', error, { queryId: 'q_123' });

      expect(memorySink.entries.length).toBe(1);
      const entry = memorySink.entries[0];
      expect(entry?.level).toBe('error');
      expect(entry?.message).toBe('Unhandled database error');
      expect(entry?.metadata?.queryId).toBe('q_123');
      expect(entry?.metadata?.error).toEqual({
        name: 'Error',
        message: 'Database connection failed',
        stack: expect.any(String),
      });
    });
  });

  describe('2. Minimum Level Threshold Filtering', () => {
    it('suppresses debug logs when min level threshold is info', () => {
      PlatformLogger.setMinLevel('info');
      const logger = new PlatformLogger('ThresholdTest');

      logger.debug('Hidden debug log');
      logger.info('Visible info log');
      logger.error('Visible error log');

      expect(memorySink.entries.length).toBe(2);
      expect(memorySink.entries[0]?.message).toBe('Visible info log');
      expect(memorySink.entries[1]?.message).toBe('Visible error log');
    });

    it('suppresses debug and info logs when min level threshold is warn', () => {
      PlatformLogger.setMinLevel('warn');
      const logger = new PlatformLogger('ThresholdTest');

      logger.debug('Hidden debug log');
      logger.info('Hidden info log');
      logger.warn('Visible warn log');

      expect(memorySink.entries.length).toBe(1);
      expect(memorySink.entries[0]?.message).toBe('Visible warn log');
    });

    it('suppresses all logs when min level threshold is silent', () => {
      PlatformLogger.setMinLevel('silent');
      const logger = new PlatformLogger('ThresholdTest');

      logger.debug('Hidden');
      logger.info('Hidden');
      logger.warn('Hidden');
      logger.error('Hidden');

      expect(memorySink.entries.length).toBe(0);
    });
  });

  describe('3. Sensitive Data Redaction & Security Protection', () => {
    it('redacts sensitive keys in structured metadata', () => {
      const sensitiveMetadata = {
        userId: 'usr_123',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        accessToken: 'access_token_abc',
        refreshToken: 'refresh_token_xyz',
        authorization: 'Bearer secret_token',
        apiKey: 'sk_live_1234567890',
        normalField: 'Safe public value',
      };

      const sanitized = sanitizeMetadata(sensitiveMetadata);

      expect(sanitized).toEqual({
        userId: 'usr_123',
        password: '[REDACTED]',
        token: '[REDACTED]',
        accessToken: '[REDACTED]',
        refreshToken: '[REDACTED]',
        authorization: '[REDACTED]',
        apiKey: '[REDACTED]',
        normalField: 'Safe public value',
      });
    });

    it('redacts inline Bearer tokens in string values', () => {
      expect(sanitizeValue('header', 'Bearer eyJhbGciOi...')).toBe('Bearer [REDACTED]');
    });

    it('recursively redacts nested metadata objects containing sensitive keys', () => {
      const nestedMetadata = {
        request: {
          headers: {
            authorization: 'Bearer secret',
            host: 'api.kinergy.io',
          },
          body: {
            password: 'MyPassword',
            username: 'operator',
          },
        },
      };

      const sanitized = sanitizeMetadata(nestedMetadata);

      expect(sanitized).toEqual({
        request: {
          headers: {
            authorization: '[REDACTED]',
            host: 'api.kinergy.io',
          },
          body: {
            password: '[REDACTED]',
            username: 'operator',
          },
        },
      });
    });

    it('automatically sanitizes metadata logged through logger methods', () => {
      const logger = new PlatformLogger('SecurityContext');

      logger.info('User login attempt', {
        email: 'user@kinergy.io',
        password: 'PlaintextPasswordMustBeRedacted',
      });

      expect(memorySink.entries[0]?.metadata).toEqual({
        email: 'user@kinergy.io',
        password: '[REDACTED]',
      });
    });
  });

  describe('4. Pluggable Log Sink Architecture', () => {
    it('dispatches log entries to all registered sinks', () => {
      const sink2 = new MemorySink();
      PlatformLogger.addSink(sink2);

      const logger = new PlatformLogger('SinkTest');
      logger.info('Broadcasting log entry');

      expect(memorySink.entries.length).toBe(1);
      expect(sink2.entries.length).toBe(1);
      expect(memorySink.entries[0]?.message).toBe('Broadcasting log entry');
      expect(sink2.entries[0]?.message).toBe('Broadcasting log entry');
    });

    it('allows removing log sinks via removeSink', () => {
      const logger = new PlatformLogger('SinkRemoveTest');

      logger.info('Log 1');
      PlatformLogger.removeSink(memorySink);
      logger.info('Log 2');

      expect(memorySink.entries.length).toBe(1);
    });
  });
});
