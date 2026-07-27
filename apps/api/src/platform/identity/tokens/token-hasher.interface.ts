import { createHash } from 'crypto';

export interface ITokenHasher {
  hashToken(token: string): string;
}

export const TOKEN_HASHER = Symbol('ITokenHasher');

export class Sha256TokenHasher implements ITokenHasher {
  hashToken(token: string): string {
    if (!token) {
      throw new Error('Token string cannot be empty.');
    }
    return createHash('sha256').update(token).digest('hex');
  }
}
