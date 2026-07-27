export interface IRefreshTokenProps {
  id: string;
  tokenHash: string;
  familyId: string;
  userId: string;
  isRevoked?: boolean;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Pure Domain Entity representing a Refresh Token session record.
 * Completely framework-agnostic.
 */
export class RefreshToken {
  private readonly _id: string;
  private readonly _tokenHash: string;
  private readonly _familyId: string;
  private readonly _userId: string;
  private _isRevoked: boolean;
  private readonly _expiresAt: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: IRefreshTokenProps) {
    this._id = props.id;
    this._tokenHash = props.tokenHash;
    this._familyId = props.familyId;
    this._userId = props.userId;
    this._isRevoked = props.isRevoked ?? false;
    this._expiresAt = props.expiresAt;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  public get id(): string {
    return this._id;
  }

  public get tokenHash(): string {
    return this._tokenHash;
  }

  public get familyId(): string {
    return this._familyId;
  }

  public get userId(): string {
    return this._userId;
  }

  public get isRevoked(): boolean {
    return this._isRevoked;
  }

  public get expiresAt(): Date {
    return this._expiresAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public isExpired(now: Date = new Date()): boolean {
    return now.getTime() > this._expiresAt.getTime();
  }

  public isValid(now: Date = new Date()): boolean {
    return !this._isRevoked && !this.isExpired(now);
  }

  public revoke(): void {
    this._isRevoked = true;
    this._updatedAt = new Date();
  }
}
