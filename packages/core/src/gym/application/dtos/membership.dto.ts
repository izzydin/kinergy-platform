export interface MembershipPeriodDTO {
  startDate: string;
  endDate: string;
  durationDays: number;
}

export interface FreezeWindowDTO {
  startDate: string;
  endDate: string;
  durationDays: number;
  reason?: string;
}

export interface MembershipDTO {
  id: string;
  version: number;
  status: string;
  clientId: string;
  planId: string;
  period: MembershipPeriodDTO;
  assignedTrainerId?: string;
  freezeHistory: FreezeWindowDTO[];
  createdAt: string;
  updatedAt: string;
}
