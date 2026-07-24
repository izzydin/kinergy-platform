import { registerAs } from '@nestjs/config';

export interface AppServerConfig {
  port: number;
  environment: string;
  apiPrefix: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
}

export const appConfig = registerAs('app', (): AppServerConfig => ({
  port: Number(process.env['PORT']) || 3000,
  environment: process.env['NODE_ENV'] || 'development',
  apiPrefix: process.env['API_PREFIX'] || 'api/v1',
  corsOrigins: (process.env['CORS_ORIGINS'] || 'http://localhost:4200').split(','),
  swaggerEnabled: process.env['SWAGGER_ENABLED'] !== 'false',
}));
