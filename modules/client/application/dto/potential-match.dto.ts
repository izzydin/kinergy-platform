export interface PotentialMatchDto {
  clientId: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string;
  matchReason: 'EXACT_PHONE' | 'SIMILAR_NAME' | 'SIMILAR_PHONE';
}
