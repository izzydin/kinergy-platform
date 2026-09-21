import { PrismaClient } from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleOptimisticLockException } from '../../../../domain/exceptions/optimistic-lock.exception';
import { PrismaSaleMapper } from '../mappers/prisma-sale.mapper';

import { SaleRepositoryPort } from '../../../../application/ports/sale-repository.port';

export type SaleRepositoryInterface = SaleRepositoryPort;

export class PrismaSaleRepository implements SaleRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async findById(id: SaleId | string): Promise<Sale | null> {
    const saleIdStr = typeof id === 'string' ? id.trim() : id.value;

    const raw = await this.prisma.sale.findUnique({
      where: { id: saleIdStr },
      include: {
        items: true,
      },
    });

    if (!raw) {
      return null;
    }

    return PrismaSaleMapper.toDomain(raw);
  }

  public async save(sale: Sale): Promise<void> {
    const { sale: saleData, items: itemsData } = PrismaSaleMapper.toPersistence(sale);

    await this.prisma.$transaction(async (tx) => {
      if (sale.version === 1) {
        // Initial insert
        await tx.sale.upsert({
          where: { id: saleData.id },
          create: {
            ...saleData,
            items: {
              create: itemsData,
            },
          },
          update: {
            ...saleData,
          },
        });
      } else {
        // Optimistic concurrency control check against prior version
        const priorVersion = sale.version - 1;
        const result = await tx.sale.updateMany({
          where: {
            id: saleData.id,
            version: priorVersion,
          },
          data: {
            ...saleData,
          },
        });

        if (result.count === 0) {
          throw new SaleOptimisticLockException('Sale', saleData.id, priorVersion);
        }

        // Synchronize child line items: delete removed items and upsert current items
        const currentItemIds = itemsData.map((item) => item.id);
        await tx.saleItem.deleteMany({
          where: {
            saleId: saleData.id,
            id: { notIn: currentItemIds },
          },
        });

        for (const itemData of itemsData) {
          await tx.saleItem.upsert({
            where: { id: itemData.id },
            create: itemData,
            update: itemData,
          });
        }
      }
    });
  }
}
