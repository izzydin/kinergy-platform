import { Receipt } from '../../domain/receipt.aggregate';
import {
  ReceiptDTO,
  ReceiptClientSnapshotDTO,
  ReceiptItemSnapshotDTO,
  ReceiptPaymentSnapshotDTO,
} from '../dtos/receipt.dto';
import { MoneyMapper } from './money.mapper';

/**
 * Maps Receipt aggregate root and its embedded snapshots to API-safe, precision-preserving ReceiptDTO.
 */
export class ReceiptMapper {
  /**
   * Maps a Receipt aggregate root to ReceiptDTO.
   */
  public static toDTO(receipt: Receipt): ReceiptDTO {
    const clientSnapshot: ReceiptClientSnapshotDTO | null = receipt.clientSnapshot
      ? {
          clientId: receipt.clientSnapshot.clientId,
          referenceNumber: receipt.clientSnapshot.referenceNumber,
          fullName: receipt.clientSnapshot.fullName,
          email: receipt.clientSnapshot.email,
          phone: receipt.clientSnapshot.phone,
        }
      : null;

    const items: ReceiptItemSnapshotDTO[] = receipt.items.map((item) => ({
      itemId: item.itemId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      description: item.description,
      skuOrCode: item.skuOrCode,
      quantity: item.quantity,
      unitPrice: MoneyMapper.toDTO(item.unitPrice),
      discountTotal: MoneyMapper.toDTO(item.discountTotal),
      subtotal: MoneyMapper.toDTO(item.subtotal),
      total: MoneyMapper.toDTO(item.total),
    }));

    const payments: ReceiptPaymentSnapshotDTO[] = receipt.payments.map((p) => ({
      paymentId: p.paymentId,
      method: p.method,
      amount: MoneyMapper.toDTO(p.amount),
      status: p.status,
      reference: p.reference,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    }));

    return {
      id: receipt.id.value,
      tenantId: receipt.tenantId,
      saleId: receipt.saleId.value,
      receiptNumber: receipt.receiptNumber.value,
      saleReference: receipt.saleReference,
      issuedAt: receipt.issuedAt.toISOString(),
      clientSnapshot,
      items,
      itemCount: receipt.itemCount,
      subtotal: MoneyMapper.toDTO(receipt.subtotal),
      discountTotal: MoneyMapper.toDTO(receipt.discountTotal),
      total: MoneyMapper.toDTO(receipt.total),
      currency: receipt.currency,
      payments,
      paymentMethod: receipt.paymentMethod,
      paymentStatus: receipt.paymentStatus,
      status: receipt.status,
      reprintCount: receipt.reprintCount,
      lastReprintedAt: receipt.lastReprintedAt ? receipt.lastReprintedAt.toISOString() : null,
      createdAt: receipt.createdAt.toISOString(),
      version: receipt.version,
    };
  }
}
