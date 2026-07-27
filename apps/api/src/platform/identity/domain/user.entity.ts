import { UserStatus } from './user-status.enum';

export interface IUserProps {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
  hashedRefreshToken?: string | null;
  refreshTokenExpiresAt?: Date | null;
  tokenVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

/**
 * Pure Identity Domain Entity representing user credentials, account status,
 * and security authorizations only.
 */
export class User {
  private readonly _id: string;
  private _email: string;
  private _passwordHash: string;
  private _status: UserStatus;
  private _roles: string[];
  private _permissions: string[];
  private _tenantId: string | null;
  private _hashedRefreshToken: string | null;
  private _refreshTokenExpiresAt: Date | null;
  private _tokenVersion: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _deletedAt: Date | null;

  constructor(props: IUserProps) {
    this._id = props.id;
    this._email = props.email;
    this._passwordHash = props.passwordHash;
    this._status = props.status ?? UserStatus.PENDING_ACTIVATION;
    this._roles = props.roles ?? [];
    this._permissions = props.permissions ?? [];
    this._tenantId = props.tenantId ?? null;
    this._hashedRefreshToken = props.hashedRefreshToken ?? null;
    this._refreshTokenExpiresAt = props.refreshTokenExpiresAt ?? null;
    this._tokenVersion = props.tokenVersion ?? 1;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._deletedAt = props.deletedAt ?? null;
  }

  public get id(): string {
    return this._id;
  }

  public get email(): string {
    return this._email;
  }

  public get passwordHash(): string {
    return this._passwordHash;
  }

  public get status(): UserStatus {
    return this._status;
  }

  public get roles(): string[] {
    return [...this._roles];
  }

  public get permissions(): string[] {
    return [...this._permissions];
  }

  public get tenantId(): string | null {
    return this._tenantId;
  }

  public get hashedRefreshToken(): string | null {
    return this._hashedRefreshToken;
  }

  public get refreshTokenExpiresAt(): Date | null {
    return this._refreshTokenExpiresAt;
  }

  public get tokenVersion(): number {
    return this._tokenVersion;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public get deletedAt(): Date | null {
    return this._deletedAt;
  }

  public isActive(): boolean {
    return !this.isDeleted() && this._status === UserStatus.ACTIVE;
  }

  public isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  public activate(): void {
    if (this.isDeleted()) {
      throw new Error('Cannot activate a soft-deleted user.');
    }
    this._status = UserStatus.ACTIVE;
    this._updatedAt = new Date();
  }

  public deactivate(): void {
    if (this.isDeleted()) {
      throw new Error('Cannot deactivate a soft-deleted user.');
    }
    this._status = UserStatus.DEACTIVATED;
    this.clearRefreshToken();
    this.incrementTokenVersion();
    this._updatedAt = new Date();
  }

  public softDelete(): void {
    if (this.isDeleted()) {
      throw new Error('User is already soft-deleted.');
    }
    this._status = UserStatus.DEACTIVATED;
    this._deletedAt = new Date();
    this.clearRefreshToken();
    this.incrementTokenVersion();
    this._updatedAt = new Date();
  }

  public changePassword(newPasswordHash: string): void {
    if (this.isDeleted()) {
      throw new Error('Cannot change password for soft-deleted user.');
    }
    this._passwordHash = newPasswordHash;
    this.clearRefreshToken();
    this.incrementTokenVersion();
    this._updatedAt = new Date();
  }

  public updateEmail(newEmail: string): void {
    if (this.isDeleted()) {
      throw new Error('Cannot update a soft-deleted user.');
    }
    this._email = newEmail;
    this._updatedAt = new Date();
  }

  public updateRoles(newRoles: string[]): void {
    if (this.isDeleted()) {
      throw new Error('Cannot update a soft-deleted user.');
    }
    this._roles = newRoles;
    this._updatedAt = new Date();
  }

  public setRefreshToken(hashedToken: string, expiresAt: Date): void {
    this._hashedRefreshToken = hashedToken;
    this._refreshTokenExpiresAt = expiresAt;
    this._updatedAt = new Date();
  }

  public clearRefreshToken(): void {
    this._hashedRefreshToken = null;
    this._refreshTokenExpiresAt = null;
    this._updatedAt = new Date();
  }

  public incrementTokenVersion(): void {
    this._tokenVersion += 1;
    this._updatedAt = new Date();
  }
}
