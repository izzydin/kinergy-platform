import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Alert,
  Spinner,
  Badge,
} from '@kinergy-platform/ui';
import { useRecordCheckInMutation } from '../hooks/use-attendance';
import { CheckInMethod, RecordCheckInResultDTO, AccessResult } from '../types';

interface CheckInActionPanelProps {
  readonly clientId: string;
  readonly isEligible: boolean;
  readonly onCheckInSuccess?: (result: RecordCheckInResultDTO) => void;
}

export const CheckInActionPanel: React.FC<CheckInActionPanelProps> = ({
  clientId,
  isEligible,
  onCheckInSuccess,
}) => {
  const [method, setMethod] = useState<CheckInMethod>(CheckInMethod.MANUAL_RECEPTION);
  const [gateId, setGateId] = useState('turnstile_main');
  const [notes, setNotes] = useState('');
  const [lastResult, setLastResult] = useState<RecordCheckInResultDTO | null>(null);

  const { mutate: recordCheckIn, isPending } = useRecordCheckInMutation();

  const handleCheckIn = () => {
    // Generate unique idempotency nonce
    const idempotencyKey = `web_desk_${clientId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    recordCheckIn(
      {
        clientId,
        method,
        gateId: gateId.trim() || undefined,
        idempotencyKey,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          setLastResult(result);
          if (result.isGranted && onCheckInSuccess) {
            onCheckInSuccess(result);
          }
        },
      },
    );
  };

  return (
    <Card className="w-full bg-card shadow-sm border-border/80" data-testid="check-in-action-panel">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold text-foreground">
          Record Ingress Admission
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Method Selector */}
        <div className="space-y-1.5">
          <label
            htmlFor="check-in-method-select"
            className="text-xs font-medium text-muted-foreground block"
          >
            Ingress Channel / Method
          </label>
          <select
            id="check-in-method-select"
            value={method}
            onChange={(e) => setMethod(e.target.value as CheckInMethod)}
            disabled={isPending}
            className="w-full text-xs h-9 px-3 rounded-md border border-input bg-background text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="check-in-method-select"
          >
            <option value={CheckInMethod.MANUAL_RECEPTION}>Reception Desk (Manual Override)</option>
            <option value={CheckInMethod.QR_CODE}>Mobile App QR Code Scanner</option>
            <option value={CheckInMethod.RFID}>RFID Keycard / Wristband</option>
            <option value={CheckInMethod.BARCODE}>Barcode Card Scan</option>
            <option value={CheckInMethod.BIOMETRIC}>Biometric Terminal</option>
          </select>
        </div>

        {/* Gate ID and Optional Notes */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label htmlFor="gate-id-input" className="text-[11px] text-muted-foreground">
              Access Point / Gate
            </label>
            <Input
              id="gate-id-input"
              type="text"
              placeholder="e.g. Turnstile 1"
              value={gateId}
              onChange={(e) => setGateId(e.target.value)}
              disabled={isPending}
              className="text-xs h-8"
              data-testid="gate-id-input"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="notes-input" className="text-[11px] text-muted-foreground">
              Operator Notes (Optional)
            </label>
            <Input
              id="notes-input"
              type="text"
              placeholder="e.g. VIP guest"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              className="text-xs h-8"
              data-testid="notes-input"
            />
          </div>
        </div>

        {/* Primary Action Button */}
        <Button
          onClick={handleCheckIn}
          disabled={isPending}
          className={`w-full py-2 font-medium text-sm transition-all ${
            isEligible
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          }`}
          data-testid="submit-check-in-btn"
        >
          {isPending ? (
            <span className="flex items-center justify-center space-x-2">
              <Spinner size="sm" />
              <span>Recording Check-In...</span>
            </span>
          ) : (
            <span>Record Check-In Admission</span>
          )}
        </Button>

        {/* Real-Time Operational Feedback Result */}
        {lastResult && (
          <div className="pt-2" data-testid="check-in-result-banner">
            {lastResult.isGranted ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-100 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-semibold">
                  <span>✓ Admission Granted</span>
                  <Badge variant="default" className="bg-emerald-600 text-white text-[10px] px-2">
                    {lastResult.isIdempotentReplay ? 'Replay' : 'Granted'}
                  </Badge>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-200">
                  Recorded at {new Date(lastResult.checkInTime).toLocaleTimeString()} via{' '}
                  {lastResult.method}
                </p>
                <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                  Attendance ID: {lastResult.attendanceId}
                </div>
              </div>
            ) : (
              <Alert
                variant={
                  lastResult.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN
                    ? 'default'
                    : 'destructive'
                }
                className="text-xs"
              >
                <strong>
                  {lastResult.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN
                    ? 'Duplicate Check-In'
                    : 'Check-In Rejected'}
                  :
                </strong>{' '}
                {lastResult.denialReason ?? 'Ineligible membership state.'}
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
