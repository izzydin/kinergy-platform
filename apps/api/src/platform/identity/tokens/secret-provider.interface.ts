/**
 * Abstract Port Interface for JWT Secret and Configuration Management.
 * Decouples token infrastructure from environment variable lookups.
 */
export interface ISecretProvider {
  getAccessSecret(): string;
  getRefreshSecret(): string;
  getAccessExpiresIn(): string;
  getRefreshExpiresIn(): string;
  getIssuer(): string;
  getAudience(): string;
}

/**
 * Dependency Injection Symbol for NestJS binding.
 */
export const SECRET_PROVIDER = Symbol('ISecretProvider');
