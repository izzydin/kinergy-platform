import { PlatformLoggerService } from './platform-logger.service';

describe('PlatformLoggerService', () => {
  let service: PlatformLoggerService;

  beforeEach(() => {
    service = new PlatformLoggerService();
  });

  it('should execute log method without error', () => {
    expect(() => service.log('Test log', 'TestContext')).not.toThrow();
  });

  it('should execute warn method without error', () => {
    expect(() => service.warn('Test warning', 'TestContext')).not.toThrow();
  });

  it('should execute error method without error', () => {
    expect(() => service.error('Test error', 'trace stack', 'TestContext')).not.toThrow();
  });

  it('should execute debug method without error', () => {
    expect(() => service.debug('Test debug', 'TestContext')).not.toThrow();
  });
});
