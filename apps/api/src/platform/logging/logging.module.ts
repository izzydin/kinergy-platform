import { Module } from '@nestjs/common';
import { LOGGER_PORT } from './logger-port.interface';
import { PlatformLoggerService } from './platform-logger.service';

@Module({
  providers: [
    PlatformLoggerService,
    {
      provide: LOGGER_PORT,
      useExisting: PlatformLoggerService,
    },
  ],
  exports: [PlatformLoggerService, LOGGER_PORT],
})
export class LoggingModule {}
