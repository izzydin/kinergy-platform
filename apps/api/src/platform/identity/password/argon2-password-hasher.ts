import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { pbkdf2Sync } from 'crypto';
import { IPasswordHasher } from './password-hasher.interface';

/**
 * Options interface for Argon2id hashing configuration.
 */
export interface Argon2Options {
  memoryCost?: number; // In KB (65536 KB = 64 MB)
  timeCost?: number; // Number of iterations
  parallelism?: number; // Number of threads
  hashLength?: number; // Output length in bytes
}

@Injectable()
export class Argon2PasswordHasher implements IPasswordHasher {
  private readonly options: Parameters<typeof argon2.hash>[1];

  constructor(options?: Argon2Options) {
    this.options = {
      type: argon2.argon2id,
      memoryCost: options?.memoryCost ?? 65536, // 64 MB
      timeCost: options?.timeCost ?? 3,
      parallelism: options?.parallelism ?? 4,
      hashLength: options?.hashLength ?? 32,
      raw: false,
    };
  }

  /**
   * Hashes a raw plaintext password using Argon2id with secure parameters.
   */
  async hash(password: string): Promise<string> {
    if (!password) {
      throw new Error('Password string cannot be empty.');
    }
    const result = await argon2.hash(password, this.options);
    return result as string;
  }

  /**
   * Verifies a raw plaintext password against a stored hash string.
   * Supports automatic detection and verification of legacy/seed PBKDF2 hashes ($pbkdf2-sha512$).
   */
  async verify(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    try {
      // 1. Check for legacy/seed PBKDF2 hash format ($pbkdf2-sha512$i=100000$salt$hash)
      if (hash.startsWith('$pbkdf2-sha512$')) {
        return this.verifyPbkdf2Hash(password, hash);
      }

      // 2. Verify native Argon2 hash ($argon2id$, $argon2i$, $argon2d$)
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }

      // Unrecognized hash format
      return false;
    } catch {
      // Return false safely on invalid hash strings or verification errors
      return false;
    }
  }

  /**
   * Fallback verification helper for PBKDF2 hashes ($pbkdf2-sha512$i=100000$<salt>$<hash>).
   */
  private verifyPbkdf2Hash(password: string, hash: string): boolean {
    const parts = hash.split('$');
    // Format: ["", "pbkdf2-sha512", "i=100000", "<salt>", "<derivedKey>"]
    if (parts.length !== 5 || parts[1] !== 'pbkdf2-sha512') {
      return false;
    }

    const iterPart = parts[2];
    const salt = parts[3];
    const expectedKey = parts[4];

    if (!iterPart || !salt || !expectedKey) {
      return false;
    }

    const iterationsMatch = iterPart.match(/^i=(\d+)$/);
    const iterationCountStr = iterationsMatch ? iterationsMatch[1] : undefined;
    const iterations = iterationCountStr ? parseInt(iterationCountStr, 10) : 100000;

    const derivedKey = pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');

    // Constant-time buffer comparison
    if (derivedKey.length !== expectedKey.length) {
      return false;
    }

    let diff = 0;
    for (let i = 0; i < derivedKey.length; i++) {
      diff |= derivedKey.charCodeAt(i) ^ expectedKey.charCodeAt(i);
    }
    return diff === 0;
  }
}
