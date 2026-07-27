import {
  ArgumentMetadata,
  Injectable,
  ValidationPipe,
  ValidationPipeOptions,
} from '@nestjs/common';
import { InputSanitizer } from '../sanitizer/input-sanitizer';

/**
 * Enterprise Production Validation & Sanitization Pipe for API HTTP Requests.
 * - Sanitizes incoming payloads (trims whitespace, strips control characters, neutralizes XSS vectors).
 * - Enforces strict DTO validation (whitelisting, forbidding non-whitelisted properties, type transformation).
 */
@Injectable()
export class GlobalSanitizationValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      ...options,
    });
  }

  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    // 1. Sanitize incoming payload before validation logic
    const sanitizedValue = InputSanitizer.sanitize(value);

    // 2. Execute strict ValidationPipe checks
    return super.transform(sanitizedValue, metadata);
  }
}
