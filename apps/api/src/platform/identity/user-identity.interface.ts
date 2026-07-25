export interface IUserIdentity {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}
