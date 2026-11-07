export type PosCategory =
  'GYM_MEMBERSHIP' | 'KINESIOLOGY' | 'FOOD' | 'DRINKS_PRODUCTS' | 'ROOM_RENTAL';

export interface PosCartItem {
  id: string;
  sourceType: string;
  sourceId: string;
  skuOrCode?: string;
  category: PosCategory;
  name: string;
  description?: string;
  unitPriceCents: number;
  unitPriceAmount: number;
  quantity: number;
  maxStock?: number;
  metadata?: {
    planDurationDays?: number;
    membershipId?: string;
    therapistId?: string;
    therapistName?: string;
    roomCapacity?: number;
    appointmentDate?: string;
    serviceType?: string;
  };
}

export interface PosDiscount {
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  reason?: string;
}

export type PosPaymentMethod = 'CASH' | 'QR';

export interface PosCompletedSaleSummary {
  saleId: string;
  receiptId?: string;
  receiptNumber?: string;
  clientId?: string;
  clientName?: string;
  isWalkIn: boolean;
  currency: string;
  items: PosCartItem[];
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentMethod: PosPaymentMethod;
  paymentStatus: string;
  completedAt: string;
  tenderAmount?: number;
  changeAmount?: number;
}
