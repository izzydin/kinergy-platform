export interface MembershipPlanDTO {
  id: string;
  code: string;
  name: string;
  description?: string;
  durationInDays: number;
  priceAmount: number;
  priceCurrency: string;
  visitQuota?: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
