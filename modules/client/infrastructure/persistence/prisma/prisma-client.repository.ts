import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import { ClientSearchRepository } from '../../../domain/repositories/client-search.repository';
import { SearchClientsCriteria } from '../../../domain/repositories/search-clients-criteria.interface';
import { PaginatedResultDto } from '../../../application/dto/paginated-result.dto';
import {
  ClientId,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../../../domain/value-objects';
import { OptimisticLockException } from '../../../domain/errors/client-domain.exception';

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
        throw new OptimisticLockException(client.id, client.version - 1, priorVersion);
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

  async search(criteria: SearchClientsCriteria): Promise<PaginatedResultDto<Client>> {
    const page = Math.max(1, criteria.page ?? 1);
    const limit = Math.max(1, Math.min(100, criteria.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {};

    // 1. Multi-field text match across: normalizedSearchName, email, phone, referenceNumber
    if (criteria.query && criteria.query.trim()) {
      const q = criteria.query.trim().toLowerCase();
      where.OR = [
        { normalizedSearchName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { referenceNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    // 2. Status filtering & includeArchived logic
    if (criteria.status) {
      where.status = criteria.status;
    } else if (!criteria.includeArchived) {
      where.status = ClientStatus.ACTIVE;
    }

    // 3. Date range filters
    if (criteria.createdFrom || criteria.createdTo) {
      where.createdAt = {};
      if (criteria.createdFrom) {
        where.createdAt.gte = criteria.createdFrom;
      }
      if (criteria.createdTo) {
        where.createdAt.lte = criteria.createdTo;
      }
    }

    // 4. Dynamic sorting
    const sortField =
      criteria.sortBy === 'name'
        ? 'normalizedSearchName'
        : criteria.sortBy === 'updatedAt'
          ? 'updatedAt'
          : 'createdAt';

    const sortOrder: 'asc' | 'desc' = criteria.sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const orderBy: Prisma.ClientOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [records, total] = await Promise.all([
      this.client.client.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.client.client.count({ where }),
    ]);

    const clients = records.map(ClientMapper.toDomain);
    return PaginatedResultDto.create(clients, total, page, limit);
  }
}
