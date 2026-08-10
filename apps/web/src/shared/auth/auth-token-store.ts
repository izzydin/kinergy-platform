export type AuthEventListener = (event: 'login' | 'logout' | 'unauthorized') => void;

/**
 * In-Memory Authentication Token & Transport Session Store (`shared/auth/auth-token-store.ts`)
 *
 * Security Architecture (ADR 0018 / ADR 0019 / ADR 0022):
 * - Access tokens are stored strictly in memory to mitigate XSS exfiltration risks.
 * - Tokens are NEVER written to localStorage, sessionStorage, or browser cookies.
 * - Access tokens are never logged or exposed via diagnostic APIs.
 * - Exposes subscription listeners for login, logout, and unauthorized session transitions.
 */
export class AuthTokenStore {
  private accessToken: string | null = null;
  private readonly listeners: Set<AuthEventListener> = new Set();

  /** Retrieves the current in-memory access token */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Sets a new access token in memory */
  setAccessToken(token: string | null): void {
    const previousToken = this.accessToken;
    this.accessToken = token;

    if (!previousToken && token) {
      this.emit('login');
    } else if (previousToken && !token) {
      this.emit('logout');
    }
  }

  /** Checks if an active access token is stored in memory */
  isAuthenticated(): boolean {
    return this.accessToken !== null && this.accessToken.trim().length > 0;
  }

  /** Clears session state and revokes in-memory access token */
  clearSession(): void {
    if (this.accessToken !== null) {
      this.accessToken = null;
      this.emit('logout');
    }
  }

  /** Emits an explicit unauthorized session event (e.g. refresh failure or invalid token) */
  notifyUnauthorized(): void {
    const hadToken = this.accessToken !== null;
    this.accessToken = null;
    if (hadToken) {
      this.emit('unauthorized');
    }
  }

  /** Registers a listener for authentication session events */
  subscribe(listener: AuthEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: 'login' | 'logout' | 'unauthorized'): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Prevent subscriber exceptions from interrupting event dispatching
      }
    }
  }
}

/** Shared singleton instance of AuthTokenStore */
export const authTokenStore = new AuthTokenStore();
