import { MoneyDTO } from './money.dto';
import { SaleItemDTO } from './sale-item.dto';

/**
 * Full Sale Aggregate Representation for external API clients.
 * Exposes both structured MoneyDTO objects and flat numeric summary projections.
 */
export interface SaleDTO {
  readonly id: string;
  readonly tenantId?: string;
  readonly clientId?: string;
  readonly currency: string;
  readonly status: string;

  // --- Canonical Structured Monetary Representations ---
  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;

  // --- Flat Summary Read Projections (ADR-0114 Section 5.5) ---
  readonly subtotalAmount: number;
  readonly discountTotalAmount: number;
  readonly totalAmount: number;

  readonly itemCount: number;
  readonly items: readonly SaleItemDTO[];
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
  readonly refundedAt: string | null;
}

/**
 * Lightweight summary projection of a Sale for dashboards, list views, and carts.
 */
export interface SaleSummaryDTO {
  readonly id: string;
  readonly tenantId?: string;
  readonly clientId?: string;
  readonly currency: string;
  readonly status: string;

  readonly subtotal: MoneyDTO;
  readonly discountTotal: MoneyDTO;
  readonly total: MoneyDTO;

  readonly subtotalAmount: number;
  readonly discountTotalAmount: number;
  readonly totalAmount: number;

  readonly itemCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
