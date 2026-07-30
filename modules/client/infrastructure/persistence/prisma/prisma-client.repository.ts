import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import { ClientSearchRepository } from '../../../domain/repositories/client-search.repository';
import {
  ClientId,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../../../domain/value-objects';
import { ClientConcurrencyException } from '../../../domain/errors/client-domain.exception';
import { ClientMapper } from './client.mapper';

interface PrismaClientProvider {
  getClient?: () => PrismaClient;
  client?: PrismaClient['client'];
}

@Injectable()
export class PrismaClientRepository implements ClientRepository, ClientSearchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private get client(): PrismaClient {
    const provider = this.prisma as unknown as PrismaClientProvider;
    if (typeof provider.getClient === 'function') {
      return provider.getClient() as PrismaClient;
    }
    return this.prisma;
  }

  async save(client: Client): Promise<void> {
    const data = ClientMapper.toPersistence(client);

    if (client.version === 1) {
      await this.client.client.upsert({
        where: { id: client.id },
        create: data,
        update: data,
      });
    } else {
      const priorVersion = client.version - 1;
      const result = await this.client.client.updateMany({
        where: {
          id: client.id,
          version: priorVersion,
        },
        data,
      });

      if (result.count === 0) {
        throw new ClientConcurrencyException(client.id, client.version);
      }
    }
  }

  async findById(id: ClientId): Promise<Client | null> {
    const record = await this.client.client.findUnique({
      where: { id: id.value },
    });
    return record ? ClientMapper.toDomain(record) : null;
  }

  async findByEmail(email: EmailAddress): Promise<Client | null> {
    const record = await this.client.client.findFirst({
      where: { normalizedEmail: email.value },
    });
    return record ? ClientMapper.toDomain(record) : null;
  }

  async findByPhone(phone: E164PhoneNumber): Promise<Client | null> {
    const record = await this.client.client.findFirst({
      where: { normalizedPhone: phone.value },
    });
    return record ? ClientMapper.toDomain(record) : null;
  }

  async findByIdentityId(identityId: string): Promise<Client | null> {
    const record = await this.client.client.findUnique({
      where: { identityId },
    });
    return record ? ClientMapper.toDomain(record) : null;
  }

  async findByReferenceNumber(ref: ClientReferenceNumber): Promise<Client | null> {
    const record = await this.client.client.findUnique({
      where: { referenceNumber: ref.value },
    });
    return record ? ClientMapper.toDomain(record) : null;
  }

  async searchByName(normalizedQuery: NormalizedSearchName): Promise<Client[]> {
    const records = await this.client.client.findMany({
      where: {
        normalizedSearchName: {
          contains: normalizedQuery.value,
          mode: 'insensitive',
        },
      },
    });
    return records.map(ClientMapper.toDomain);
  }

  async searchByStatus(status: ClientStatus): Promise<Client[]> {
    const records = await this.client.client.findMany({
      where: { status },
    });
    return records.map(ClientMapper.toDomain);
  }
}
