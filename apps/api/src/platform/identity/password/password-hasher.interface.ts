/**
 * Abstract Port Interface for Password Hashing and Verification.
 * Keeps domain and application layers completely decoupled from specific hashing libraries (Argon2, Bcrypt, PBKDF2).
 */
export interface IPasswordHasher {
  /**
   * Hashes a raw plaintext password securely using the configured hashing algorithm.
   */
  hash(password: string): Promise<string>;

  /**
   * Verifies a raw plaintext password against a stored hash string.
   */
  verify(password: string, hash: string): Promise<boolean>;
}

/**
 * Dependency Injection Symbol for NestJS provider binding.
 */
export const PASSWORD_HASHER = Symbol('IPasswordHasher');
