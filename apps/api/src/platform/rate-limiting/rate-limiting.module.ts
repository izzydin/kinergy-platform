import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigRateLimitConfiguration } from './config-rate-limit-configuration';
import {
  IRateLimitConfiguration,
  RATE_LIMIT_CONFIGURATION,
} from './rate-limit-configuration.interface';
import { CustomThrottlerGuard } from './guards/custom-throttler.guard';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [RateLimitingModule],
      inject: [RATE_LIMIT_CONFIGURATION],
      useFactory: (config: IRateLimitConfiguration) => [
        {
          ttl: config.authLoginWindowSeconds * 1000,
          limit: config.authLoginLimit,
        },
      ],
    }),
  ],
  providers: [
    ConfigRateLimitConfiguration,
    {
      provide: RATE_LIMIT_CONFIGURATION,
      useClass: ConfigRateLimitConfiguration,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
  exports: [RATE_LIMIT_CONFIGURATION, ConfigRateLimitConfiguration],
})
export class RateLimitingModule {}
