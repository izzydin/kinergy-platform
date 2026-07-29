import {
  ClientAlreadyActiveException,
  ClientAlreadyArchivedException,
  ClientAlreadyLinkedException,
} from '../../errors';
import {
  ClientArchivedEvent,
  ClientCreatedEvent,
  ClientRestoredEvent,
  IdentityLinkedEvent,
} from '../../events';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
} from '../../value-objects';
import { Client } from '../client.aggregate';

describe('Client Aggregate Root Unit Tests', () => {
  const createSampleRegisterProps = () => ({
    id: ClientId.create('9b1deb4d-3b7d-416b-9548-52ee8c8230e5'),
    referenceNumber: ClientReferenceNumber.create(2026, 1),
    name: ClientName.create('María', 'Gómez'),
    email: EmailAddress.create('maria.gomez@kinergy.com'),
    phone: E164PhoneNumber.create('+59170000000'),
    identityId: null,
  });

  it('should register a new Client aggregate root with version = 1 and ACTIVE status', () => {
    const props = createSampleRegisterProps();
    const client = Client.register(props);

    expect(client.id).toBe('9b1deb4d-3b7d-416b-9548-52ee8c8230e5');
    expect(client.referenceNumber.value).toBe('CLI-2026-00001');
    expect(client.name.fullName).toBe('María Gómez');
    expect(client.email.value).toBe('maria.gomez@kinergy.com');
    expect(client.phone.value).toBe('+59170000000');
    expect(client.identityId).toBeNull();
    expect(client.status).toBe(ClientStatus.ACTIVE);
    expect(client.version).toBe(1);
    expect(client.normalizedSearchName.value).toBe('maria gomez');

    expect(client.domainEvents).toHaveLength(1);
    expect(client.domainEvents[0]).toBeInstanceOf(ClientCreatedEvent);
  });

  it('should link identity credentials, increment version to 2, and emit IdentityLinkedEvent', () => {
    const client = Client.register(createSampleRegisterProps());
    client.clearEvents();

    client.linkIdentity('usr_auth_123');

    expect(client.identityId).toBe('usr_auth_123');
    expect(client.version).toBe(2);
    expect(client.domainEvents).toHaveLength(1);
    expect(client.domainEvents[0]).toBeInstanceOf(IdentityLinkedEvent);
  });

  it('should throw ClientAlreadyLinkedException if identity is already linked', () => {
    const client = Client.register(createSampleRegisterProps());
    client.linkIdentity('usr_auth_123');

    expect(() => client.linkIdentity('usr_auth_456')).toThrow(ClientAlreadyLinkedException);
  });

  it('should archive an active client, increment version, and emit ClientArchivedEvent', () => {
    const client = Client.register(createSampleRegisterProps());
    client.clearEvents();

    client.archive();

    expect(client.status).toBe(ClientStatus.ARCHIVED);
    expect(client.version).toBe(2);
    expect(client.domainEvents).toHaveLength(1);
    expect(client.domainEvents[0]).toBeInstanceOf(ClientArchivedEvent);
  });

  it('should throw ClientAlreadyArchivedException when archiving an already archived client', () => {
    const client = Client.register(createSampleRegisterProps());
    client.archive();

    expect(() => client.archive()).toThrow(ClientAlreadyArchivedException);
  });

  it('should restore an archived client back to ACTIVE status, increment version, and emit ClientRestoredEvent', () => {
    const client = Client.register(createSampleRegisterProps());
    client.archive();
    client.clearEvents();

    client.restore();

    expect(client.status).toBe(ClientStatus.ACTIVE);
    expect(client.version).toBe(3);
    expect(client.domainEvents).toHaveLength(1);
    expect(client.domainEvents[0]).toBeInstanceOf(ClientRestoredEvent);
  });

  it('should throw ClientAlreadyActiveException when restoring an active client', () => {
    const client = Client.register(createSampleRegisterProps());

    expect(() => client.restore()).toThrow(ClientAlreadyActiveException);
  });
});
