import { Module } from '@nestjs/common';
import { ConfigCorsConfiguration } from './cors/config-cors-configuration';
import { CORS_CONFIGURATION } from './cors/cors-configuration.interface';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';

@Module({
  providers: [
    ConfigCorsConfiguration,
    {
      provide: CORS_CONFIGURATION,
      useClass: ConfigCorsConfiguration,
    },
    SecurityHeadersMiddleware,
  ],
  exports: [ConfigCorsConfiguration, CORS_CONFIGURATION, SecurityHeadersMiddleware],
})
export class WebSecurityModule {}
