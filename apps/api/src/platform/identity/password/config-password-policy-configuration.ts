import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IPasswordPolicyConfiguration } from './password-policy-configuration.interface';

/**
 * NestJS ConfigService implementation of IPasswordPolicyConfiguration.
 * Pulls Zod-validated password security settings from application environment.
 */
@Injectable()
export class ConfigPasswordPolicyConfiguration implements IPasswordPolicyConfiguration {
  constructor(@Optional() private readonly configService?: ConfigService) {}

  getArgon2MemoryCost(): number {
    return this.configService?.get<number>('ARGON2_MEMORY_COST', 65536) ?? 65536;
  }

  getArgon2TimeCost(): number {
    return this.configService?.get<number>('ARGON2_TIME_COST', 3) ?? 3;
  }

  getArgon2Parallelism(): number {
    return this.configService?.get<number>('ARGON2_PARALLELISM', 4) ?? 4;
  }

  getArgon2HashLength(): number {
    return this.configService?.get<number>('ARGON2_HASH_LENGTH', 32) ?? 32;
  }

  getMinLength(): number {
    return this.configService?.get<number>('PASSWORD_MIN_LENGTH', 12) ?? 12;
  }

  getMaxLength(): number {
    return this.configService?.get<number>('PASSWORD_MAX_LENGTH', 128) ?? 128;
  }

  getRequireUppercase(): boolean {
    return this.configService?.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true) ?? true;
  }

  getRequireLowercase(): boolean {
    return this.configService?.get<boolean>('PASSWORD_REQUIRE_LOWERCASE', true) ?? true;
  }

  getRequireNumber(): boolean {
    return this.configService?.get<boolean>('PASSWORD_REQUIRE_NUMBER', true) ?? true;
  }

  getRequireSpecialChar(): boolean {
    return this.configService?.get<boolean>('PASSWORD_REQUIRE_SPECIAL_CHAR', true) ?? true;
  }

  getPasswordHistoryLimit(): number {
    return this.configService?.get<number>('PASSWORD_HISTORY_LIMIT', 5) ?? 5;
  }
}
