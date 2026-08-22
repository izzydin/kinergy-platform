import { z } from 'zod';

export const checkInSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  method: z
    .enum(['BARCODE', 'RFID', 'QR_CODE', 'MANUAL_RECEPTION', 'BIOMETRIC'])
    .default('QR_CODE'),
  gateId: z.string().optional(),
  notes: z.string().max(250).optional(),
});

export type CheckInFormValues = z.infer<typeof checkInSchema>;
