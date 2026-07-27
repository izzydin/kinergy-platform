import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PasswordPolicyService } from './password-policy.service';

/**
 * Service generating cryptographically secure temporary passwords
 * compliant with system password complexity policy.
 */
@Injectable()
export class TemporaryPasswordGeneratorService {
  private readonly uppercaseChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  private readonly lowercaseChars = 'abcdefghijkmnopqrstuvwxyz';
  private readonly numberChars = '23456789';
  private readonly specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  constructor(private readonly passwordPolicyService: PasswordPolicyService) {}

  /**
   * Generates a random, cryptographically secure temporary password
   * matching length (default 16) and complexity rules.
   */
  generate(length = 16): string {
    const minLen = Math.max(12, length);
    const requiredChars: string[] = [
      this.getRandomChar(this.uppercaseChars),
      this.getRandomChar(this.lowercaseChars),
      this.getRandomChar(this.numberChars),
      this.getRandomChar(this.specialChars),
    ];

    const allChars =
      this.uppercaseChars + this.lowercaseChars + this.numberChars + this.specialChars;

    const remainingCount = minLen - requiredChars.length;
    for (let i = 0; i < remainingCount; i++) {
      requiredChars.push(this.getRandomChar(allChars));
    }

    // Shuffle characters securely using Fisher-Yates algorithm with crypto.randomInt
    for (let i = requiredChars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const charI = requiredChars[i];
      const charJ = requiredChars[j];
      if (charI !== undefined && charJ !== undefined) {
        requiredChars[i] = charJ;
        requiredChars[j] = charI;
      }
    }

    const temporaryPassword = requiredChars.join('');

    // Verify generated temporary password passes policy validation
    this.passwordPolicyService.validateOrThrow(temporaryPassword);

    return temporaryPassword;
  }

  private getRandomChar(charset: string): string {
    const randomIndex = crypto.randomInt(0, charset.length);
    return charset.charAt(randomIndex);
  }
}
