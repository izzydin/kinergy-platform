import { AggregateRoot } from '../kernel';
import {
  ArchivedClientCannotBeModifiedException,
  ClientAlreadyActiveException,
  ClientAlreadyArchivedException,
  ClientAlreadyLinkedException,
  OptimisticLockException,
} from '../errors/client-domain.exception';
import {
  ClientArchivedEvent,
  ClientCreatedEvent,
  ClientRestoredEvent,
  IdentityLinkedEvent,
} from '../events';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../value-objects';

export interface ClientProps {
  referenceNumber: ClientReferenceNumber;
  identityId: string | null;
  name: ClientName;
  email: EmailAddress;
  phone: E164PhoneNumber;
  normalizedSearchName: NormalizedSearchName;
  status: ClientStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterClientProps {
  id?: ClientId;
  referenceNumber: ClientReferenceNumber;
  name: ClientName;
  email: EmailAddress;
  phone: E164PhoneNumber;
  identityId?: string | null;
  normalizedSearchName?: NormalizedSearchName;
}

export class Client extends AggregateRoot<ClientProps> {
  private _clientId: ClientId;

  private constructor(props: ClientProps, id?: ClientId) {
    const clientId = id ?? ClientId.create();
    super(props, clientId.value);
    this._clientId = clientId;
  }

  public get clientId(): ClientId {
    return this._clientId;
  }

  public override get id(): string {
    return this._clientId.value;
  }

  public get referenceNumber(): ClientReferenceNumber {
    return this.props.referenceNumber;
  }

  public get identityId(): string | null {
    return this.props.identityId;
  }

  public get name(): ClientName {
    return this.props.name;
  }

  public get email(): EmailAddress {
    return this.props.email;
  }

  public get phone(): E164PhoneNumber {
    return this.props.phone;
  }

  public get normalizedSearchName(): NormalizedSearchName {
    return this.props.normalizedSearchName;
  }

  public get status(): ClientStatus {
    return this.props.status;
  }

  public get version(): number {
    return this.props.version;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Factory method to register a new Client aggregate root.
   */
  public static register(props: RegisterClientProps): Client {
    const clientId = props.id ?? ClientId.create();
    const normalizedSearchName =
      props.normalizedSearchName ?? NormalizedSearchName.create(props.name);
    const now = new Date();

    const client = new Client(
      {
        referenceNumber: props.referenceNumber,
        identityId: props.identityId ?? null,
        name: props.name,
        email: props.email,
        phone: props.phone,
        normalizedSearchName,
        status: ClientStatus.ACTIVE,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      clientId,
    );

    client.addDomainEvent(
      new ClientCreatedEvent(
        clientId.value,
        props.referenceNumber.value,
        props.email.value,
        props.phone.value,
        now,
      ),
    );

    return client;
  }

  /**
   * Reconstitutes an existing Client aggregate root from persistence data.
   */
  public static reconstitute(props: ClientProps, id: ClientId): Client {
    return new Client(props, id);
  }

  /**
   * Updates details of the client profile (partial update).
   * Throws ArchivedClientCannotBeModifiedException if client is ARCHIVED.
   * Throws OptimisticLockException if current version does not match expectedVersion.
   */
  public updateDetails(params: {
    name?: ClientName;
    email?: EmailAddress;
    phone?: E164PhoneNumber;
    expectedVersion: number;
  }): void {
    if (this.props.status === ClientStatus.ARCHIVED) {
      throw new ArchivedClientCannotBeModifiedException(this.id);
    }

    if (this.props.version !== params.expectedVersion) {
      throw new OptimisticLockException(this.id, this.props.version, params.expectedVersion);
    }

    if (params.name) {
      this.props.name = params.name;
      this.props.normalizedSearchName = NormalizedSearchName.create(params.name);
    }

    if (params.email) {
      this.props.email = params.email;
    }

    if (params.phone) {
      this.props.phone = params.phone;
    }

    this.props.version++;
    this.props.updatedAt = new Date();
  }

  /**
   * Links user authentication credentials to client profile if not already linked.
   */
  public linkIdentity(identityId: string): void {
    const trimmedIdentityId = (identityId || '').trim();

    if (this.props.identityId !== null) {
      throw new ClientAlreadyLinkedException(this.id, this.props.identityId);
    }

    if (!trimmedIdentityId) {
      throw new Error('IdentityId cannot be empty.');
    }

    this.props.identityId = trimmedIdentityId;
    this.props.version++;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new IdentityLinkedEvent(this.id, trimmedIdentityId, this.props.updatedAt));
  }

  /**
   * Archives the client profile.
   */
  public archive(expectedVersion?: number): void {
    if (this.props.status === ClientStatus.ARCHIVED) {
      throw new ClientAlreadyArchivedException(this.id);
    }

    if (expectedVersion !== undefined && this.props.version !== expectedVersion) {
      throw new OptimisticLockException(this.id, this.props.version, expectedVersion);
    }

    this.props.status = ClientStatus.ARCHIVED;
    this.props.version++;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new ClientArchivedEvent(this.id, this.props.updatedAt));
  }

  /**
   * Restores an archived client profile back to ACTIVE status.
   */
  public restore(expectedVersion?: number): void {
    if (this.props.status === ClientStatus.ACTIVE) {
      throw new ClientAlreadyActiveException(this.id);
    }

    if (expectedVersion !== undefined && this.props.version !== expectedVersion) {
      throw new OptimisticLockException(this.id, this.props.version, expectedVersion);
    }

    this.props.status = ClientStatus.ACTIVE;
    this.props.version++;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new ClientRestoredEvent(this.id, this.props.updatedAt));
  }
}
