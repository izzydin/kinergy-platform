import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export const CORS_CONFIGURATION = Symbol('CORS_CONFIGURATION');

export interface ICorsConfiguration {
  getAllowedOrigins(): string[];
  getAllowedMethods(): string[];
  getAllowedHeaders(): string[];
  getExposedHeaders(): string[];
  getMaxAge(): number;
  getAllowCredentials(): boolean;
  getTenantDomainPattern(): RegExp | null;
  isOriginAllowed(origin: string | undefined): boolean;
  createCorsOptions(): CorsOptions;
}
