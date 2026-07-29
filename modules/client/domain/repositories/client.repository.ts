import { Client } from '../aggregates/client.aggregate';
import { ClientId, ClientReferenceNumber, E164PhoneNumber, EmailAddress } from '../value-objects';

export interface ClientRepository {
  save(client: Client): Promise<void>;
  findById(id: ClientId): Promise<Client | null>;
  findByEmail(email: EmailAddress): Promise<Client | null>;
  findByPhone(phone: E164PhoneNumber): Promise<Client | null>;
  findByIdentityId(identityId: string): Promise<Client | null>;
  findByReferenceNumber(ref: ClientReferenceNumber): Promise<Client | null>;
}
