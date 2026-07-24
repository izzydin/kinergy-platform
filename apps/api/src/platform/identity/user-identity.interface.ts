export interface IUserIdentity {
  userId: string;
  email: string;
  roles: string[];
  metadata?: Record<string, unknown>;
}
