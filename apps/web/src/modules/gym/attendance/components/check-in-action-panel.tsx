import React, { useState, useEffect } from 'react';
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
import { useAttendanceCheckIn } from '../hooks/use-gym-attendance';
import { CheckInMethod, RecordCheckInResponseVM, AccessResult } from '../types';

interface CheckInActionPanelProps {
  readonly clientId: string;
  readonly isEligible: boolean;
  readonly initialMethod?: CheckInMethod;
  readonly onCheckInSuccess?: (result: RecordCheckInResponseVM) => void;
  readonly onResetDesk?: () => void;
}

export const CheckInActionPanel: React.FC<CheckInActionPanelProps> = ({
  clientId,
  isEligible,
  initialMethod,
  onCheckInSuccess,
  onResetDesk,
}) => {
  const [method, setMethod] = useState<CheckInMethod>(
    initialMethod ?? CheckInMethod.MANUAL_RECEPTION,
  );
  const [gateId, setGateId] = useState('turnstile_main');
  const [notes, setNotes] = useState('');
  const [lastResult, setLastResult] = useState<RecordCheckInResponseVM | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string | null>(null);

  // Sync initialMethod if provided/changed
  useEffect(() => {
    if (initialMethod) {
      setMethod(initialMethod);
    }
  }, [initialMethod]);

  // Reset local state when client changes
  useEffect(() => {
    setLastResult(null);
    setSubmissionError(null);
    setIsSubmitting(false);
    setActiveIdempotencyKey(null);
  }, [clientId]);

  const { mutate: recordCheckIn, isPending } = useAttendanceCheckIn();
  const isActionDisabled = isPending || isSubmitting;

  const handleCheckIn = (isRetry = false) => {
    if (isActionDisabled) {
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    // Reuse existing idempotencyKey when retrying an ambiguous / timed-out attempt,
    // ensuring the backend safely replays cached confirmation without false anti-passback rejection.
    let idempotencyKey: string;
    if (isRetry && activeIdempotencyKey) {
      idempotencyKey = activeIdempotencyKey;
    } else {
      const nonce =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      idempotencyKey = `web_desk_${clientId}_${nonce}`;
      setActiveIdempotencyKey(idempotencyKey);
    }

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
          setIsSubmitting(false);
          setActiveIdempotencyKey(null);
          setLastResult(result);
          if (result.isGranted && onCheckInSuccess) {
            onCheckInSuccess(result);
          }
        },
        onError: (err) => {
          setIsSubmitting(false);
          setSubmissionError(err.message || 'Failed to submit check-in to backend. Please retry.');
        },
      },
    );
  };

  const getDenialExplanation = (outcome: string, denialReason: string | null) => {
    if (outcome === AccessResult.DENIED_DUPLICATE_CHECKIN) {
      return 'Duplicate scan: Check-in was already recorded for this member within the 5-minute anti-passback cooldown window.';
    }
    if (outcome === AccessResult.DENIED_EXPIRED) {
      return 'The membership agreement has expired. Please renew membership before admitting.';
    }
    if (outcome === AccessResult.DENIED_FROZEN) {
      return 'The membership is currently frozen / suspended. Please unfreeze before admission.';
    }
    if (outcome === AccessResult.DENIED_CANCELLED) {
      return 'The membership agreement has been cancelled.';
    }
    if (outcome === AccessResult.DENIED_NO_MEMBERSHIP) {
      return 'No active membership agreement was found for this client.';
    }
    if (outcome === AccessResult.DENIED_INACTIVE_CLIENT) {
      return 'Client record is inactive or suspended in Client Registry.';
    }
    return denialReason || 'The client is not eligible for gym admission.';
  };

  return (
    <Card className="w-full bg-card shadow-sm border-border/80" data-testid="check-in-action-panel">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            Record Ingress Admission
          </CardTitle>
          {isEligible ? (
            <Badge variant="default" className="bg-emerald-600 text-[10px] text-white">
              Eligible
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              Ineligible
            </Badge>
          )}
        </div>
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
            disabled={isActionDisabled}
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
              disabled={isActionDisabled}
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
              placeholder="e.g. Guest pass"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isActionDisabled}
              className="text-xs h-8"
              data-testid="notes-input"
            />
          </div>
        </div>

        {/* Primary Action Button */}
        <Button
          onClick={() => handleCheckIn(false)}
          disabled={isActionDisabled}
          className={`w-full py-2 font-medium text-sm transition-all ${
            isEligible
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          }`}
          data-testid="submit-check-in-btn"
        >
          {isActionDisabled ? (
            <span className="flex items-center justify-center space-x-2">
              <Spinner size="sm" />
              <span>Recording Admission...</span>
            </span>
          ) : (
            <span>Record Check-In Admission</span>
          )}
        </Button>

        {/* Network / Submission Error */}
        {submissionError && (
          <Alert variant="destructive" className="text-xs" data-testid="check-in-error-banner">
            <div className="flex items-center justify-between">
              <span>{submissionError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCheckIn(true)}
                className="h-6 text-[10px] ml-2"
                data-testid="retry-check-in-btn"
              >
                Retry
              </Button>
            </div>
          </Alert>
        )}

        {/* Real-Time Operational Feedback Result */}
        {lastResult && (
          <div
            className="pt-2 animate-in fade-in-50"
            data-testid="check-in-result-banner"
            role="status"
            aria-live="polite"
          >
            {lastResult.isGranted ? (
              <div
                className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-900 dark:text-emerald-100 text-xs space-y-2 shadow-sm"
                data-testid="check-in-granted-card"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-sm">✓ Admission Granted</span>
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

                {onResetDesk && (
                  <div className="pt-1 border-t border-emerald-300/40 dark:border-emerald-800/40 flex justify-end">
                    <Button
                      size="sm"
                      onClick={onResetDesk}
                      className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
                      data-testid="next-member-btn"
                    >
                      Next Member &rarr;
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className={`p-3 rounded-lg border text-xs space-y-1.5 shadow-sm ${
                  lastResult.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN ||
                  lastResult.isDuplicate
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
                    : 'bg-destructive/10 border-destructive/40 text-destructive'
                }`}
                data-testid={
                  lastResult.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN ||
                  lastResult.isDuplicate
                    ? 'check-in-duplicate-banner'
                    : 'check-in-rejected-banner'
                }
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>
                    {lastResult.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN ||
                    lastResult.isDuplicate
                      ? '⚠️ Duplicate Check-In Warning (Anti-Passback Alert)'
                      : '✕ Admission Rejected'}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      lastResult.outcome === AccessResult.DENIED_DUPLICATE_CHECKIN ||
                      lastResult.isDuplicate
                        ? 'border-amber-500 text-amber-700 dark:text-amber-300'
                        : 'border-destructive text-destructive'
                    }`}
                  >
                    {lastResult.outcome}
                  </Badge>
                </div>
                <p className="text-[11px]">
                  {getDenialExplanation(lastResult.outcome, lastResult.denialReason)}
                </p>
                {lastResult.attendanceId && (
                  <div className="text-[10px] font-mono opacity-80">
                    Audit Log ID: {lastResult.attendanceId}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
