import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  AlertTitle,
  AlertDescription,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  cn,
} from '@kinergy-platform/ui';
import { ConfirmDiscardDialog, useDirtyGuard } from '../../../shared/forms';
import {
  soapNotesSchema,
  SoapNotesFormData,
  MAX_SECTION_LENGTH,
  MAX_TOTAL_NOTE_LENGTH,
} from '../schemas/session-notes.schema';
import { SoapNotesData, SessionStatusType } from '../types';

export interface SoapNotesFormProps {
  initialNotes?: SoapNotesData;
  sessionStatus: SessionStatusType;
  canEdit?: boolean;
  isSaving?: boolean;
  saveError?: Error | null;
  lastServerUpdatedAt?: string;
  onSave: (data: SoapNotesFormData) => Promise<void> | void;
  onRefresh?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const SoapNotesForm: React.FC<SoapNotesFormProps> = ({
  initialNotes,
  sessionStatus,
  canEdit = true,
  isSaving = false,
  saveError = null,
  lastServerUpdatedAt,
  onSave,
  onRefresh,
  onDirtyChange,
}) => {
  const isTerminalStatus =
    sessionStatus === 'COMPLETED' || sessionStatus === 'CANCELLED' || sessionStatus === 'NO_SHOW';
  const isReadOnly = isTerminalStatus || !canEdit;

  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string | null>(
    lastServerUpdatedAt ?? null,
  );
  const [showRawNotes, setShowRawNotes] = useState<boolean>(
    Boolean(initialNotes?.rawText && initialNotes.rawText.trim().length > 0),
  );

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<SoapNotesFormData>({
    resolver: zodResolver(soapNotesSchema),
    defaultValues: {
      subjective: initialNotes?.subjective ?? '',
      objective: initialNotes?.objective ?? '',
      assessment: initialNotes?.assessment ?? '',
      plan: initialNotes?.plan ?? '',
      rawText: initialNotes?.rawText ?? '',
    },
  });

  // Keep form in sync with authoritative server state when not dirty
  useEffect(() => {
    if (!isDirty && initialNotes) {
      reset({
        subjective: initialNotes.subjective ?? '',
        objective: initialNotes.objective ?? '',
        assessment: initialNotes.assessment ?? '',
        plan: initialNotes.plan ?? '',
        rawText: initialNotes.rawText ?? '',
      });
      if (initialNotes.rawText && initialNotes.rawText.trim().length > 0) {
        setShowRawNotes(true);
      }
    }
  }, [initialNotes, isDirty, reset]);

  // Sync server-confirmed timestamp
  useEffect(() => {
    if (lastServerUpdatedAt) {
      setLastSavedTimestamp(lastServerUpdatedAt);
    }
  }, [lastServerUpdatedAt]);

  // Propagate dirty status to parent container
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const subjectiveValue = watch('subjective') ?? '';
  const objectiveValue = watch('objective') ?? '';
  const assessmentValue = watch('assessment') ?? '';
  const planValue = watch('plan') ?? '';
  const rawTextValue = watch('rawText') ?? '';

  const totalLength =
    subjectiveValue.length +
    objectiveValue.length +
    assessmentValue.length +
    planValue.length +
    rawTextValue.length;

  const getCounterClass = (length: number, max: number) => {
    if (length > max) return 'text-red-600 font-semibold';
    if (length > max * 0.9) return 'text-amber-600 font-medium';
    return 'text-slate-400';
  };

  const onSubmit = async (data: SoapNotesFormData) => {
    if (isReadOnly) return;
    try {
      const result = onSave(data);
      if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
      }
      // Persistence confirmed: reset baseline to updated data to clear dirty flag
      reset(data);
      setLastSavedTimestamp(new Date().toISOString());
    } catch {
      // User input is preserved on error — form remains dirty
    }
  };

  // Prevent accidental loss of unsaved edits during internal navigation or browser exit
  const {
    isBlocked,
    proceed,
    reset: cancelDiscard,
  } = useDirtyGuard({
    isDirty,
    isSubmitSuccessful: !isDirty,
    enabled: !isReadOnly,
  });

  const formattedSavedTime = lastSavedTimestamp
    ? new Date(lastSavedTimestamp).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <>
      <Card className="w-full shadow-sm border-slate-200" data-testid="soap-notes-card">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold text-slate-900">
              Clinical SOAP Documentation
            </CardTitle>
            <p className="text-sm text-slate-500">
              {isTerminalStatus
                ? 'Signed clinical documentation — locked & permanently immutable.'
                : !canEdit
                  ? 'Viewing clinical documentation in read-only mode (insufficient treatment permissions).'
                  : 'Record structured findings, muscle assessments, and treatment progression.'}
            </p>
          </div>

          {/* Multi-Channel Persistence & Lock Status Indicators */}
          <div className="flex items-center gap-2 flex-wrap">
            {isReadOnly ? (
              <span
                data-testid="notes-locked-badge"
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
              >
                🔒 Locked (Read-Only)
              </span>
            ) : isSaving ? (
              <span
                data-testid="notes-saving-badge"
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
              >
                <span
                  className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"
                  aria-hidden="true"
                />
                Saving to server...
              </span>
            ) : saveError ? (
              <span
                data-testid="notes-save-error-badge"
                role="status"
                aria-live="assertive"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200"
              >
                ✕ Save failed
              </span>
            ) : isDirty ? (
              <span
                data-testid="notes-unsaved-badge"
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Unsaved changes
              </span>
            ) : formattedSavedTime ? (
              <span
                data-testid="notes-saved-badge"
                role="status"
                aria-live="polite"
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200"
              >
                ✓ Saved to server ({formattedSavedTime})
              </span>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Failure Alert Banner with In-Place Recovery */}
          {saveError && (
            <Alert
              variant="destructive"
              role="alert"
              className="border-red-200 bg-red-50 text-red-900"
              data-testid="soap-save-error-alert"
            >
              <AlertTitle className="flex items-center gap-2 font-semibold">
                <span>⚠️</span>
                <span>
                  {isReadOnly
                    ? 'Clinical Encounter Locked — Notes Cannot Be Saved'
                    : 'Failed to Persist Clinical Notes'}
                </span>
              </AlertTitle>
              <AlertDescription className="space-y-2 mt-1">
                <p className="text-sm">
                  {isReadOnly
                    ? 'This clinical encounter is completed or locked. Notes can no longer be updated. Your unsaved inputs have been preserved above for review.'
                    : saveError.message ||
                      'An unexpected network or server error occurred. Your clinical inputs have been preserved locally.'}
                </p>
                {!isReadOnly && (
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleSubmit(onSubmit)()}
                      disabled={isSaving}
                      data-testid="soap-retry-save-btn"
                    >
                      {isSaving ? 'Retrying...' : 'Retry Save'}
                    </Button>
                    {onRefresh && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={onRefresh}
                        data-testid="soap-refresh-state-btn"
                      >
                        Reload Server State
                      </Button>
                    )}
                  </div>
                )}
                {isReadOnly && onRefresh && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={onRefresh}
                      data-testid="soap-refresh-state-btn"
                    >
                      Reload Server State
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Form-level schema validation error (e.g. Total characters > 50,000) */}
          {errors.rawText && errors.rawText.message?.includes('Total') && (
            <Alert
              variant="destructive"
              role="alert"
              className="border-red-200 bg-red-50 text-red-900"
            >
              <AlertTitle className="font-semibold">Validation Error</AlertTitle>
              <AlertDescription className="text-sm">{errors.rawText.message}</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-5"
            aria-busy={isSaving}
            noValidate
          >
            {/* S — Subjective */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="soap-subjective"
                  className="text-sm font-medium text-slate-700 flex items-center gap-1.5"
                >
                  <span className="font-bold text-indigo-700">S</span>
                  <span> — Subjective (Patient Complaints, Symptoms, History)</span>
                </label>
                <span
                  id="soap-subjective-desc"
                  className={cn(
                    'text-xs font-mono',
                    getCounterClass(subjectiveValue.length, MAX_SECTION_LENGTH),
                  )}
                >
                  {`${subjectiveValue.length.toLocaleString('en-US')} / ${MAX_SECTION_LENGTH.toLocaleString('en-US')}`}
                </span>
              </div>
              <textarea
                id="soap-subjective"
                {...register('subjective')}
                disabled={isReadOnly || isSaving}
                rows={3}
                aria-invalid={Boolean(errors.subjective)}
                aria-describedby={
                  errors.subjective
                    ? 'soap-subjective-error soap-subjective-desc'
                    : 'soap-subjective-desc'
                }
                className={cn(
                  'w-full rounded-md border p-2.5 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
                  errors.subjective
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : 'border-slate-300 focus:border-indigo-500',
                  (isReadOnly || isSaving) && 'bg-slate-50 text-slate-500 cursor-not-allowed',
                )}
                placeholder="Patient stated pain levels, chief complaints, functional improvements..."
              />
              {errors.subjective && (
                <p
                  id="soap-subjective-error"
                  role="alert"
                  className="text-xs text-red-600 font-medium"
                >
                  {errors.subjective.message}
                </p>
              )}
            </div>

            {/* O — Objective */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="soap-objective"
                  className="text-sm font-medium text-slate-700 flex items-center gap-1.5"
                >
                  <span className="font-bold text-indigo-700">O</span>
                  <span> — Objective (Muscle Tests, Range of Motion, Palpation)</span>
                </label>
                <span
                  id="soap-objective-desc"
                  className={cn(
                    'text-xs font-mono',
                    getCounterClass(objectiveValue.length, MAX_SECTION_LENGTH),
                  )}
                >
                  {`${objectiveValue.length.toLocaleString('en-US')} / ${MAX_SECTION_LENGTH.toLocaleString('en-US')}`}
                </span>
              </div>
              <textarea
                id="soap-objective"
                {...register('objective')}
                disabled={isReadOnly || isSaving}
                rows={3}
                aria-invalid={Boolean(errors.objective)}
                aria-describedby={
                  errors.objective
                    ? 'soap-objective-error soap-objective-desc'
                    : 'soap-objective-desc'
                }
                className={cn(
                  'w-full rounded-md border p-2.5 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
                  errors.objective
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : 'border-slate-300 focus:border-indigo-500',
                  (isReadOnly || isSaving) && 'bg-slate-50 text-slate-500 cursor-not-allowed',
                )}
                placeholder="Kinesiology muscle balance indicators, posture findings, structural tests..."
              />
              {errors.objective && (
                <p
                  id="soap-objective-error"
                  role="alert"
                  className="text-xs text-red-600 font-medium"
                >
                  {errors.objective.message}
                </p>
              )}
            </div>

            {/* A — Assessment */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="soap-assessment"
                  className="text-sm font-medium text-slate-700 flex items-center gap-1.5"
                >
                  <span className="font-bold text-indigo-700">A</span>
                  <span> — Assessment (Clinical Analysis, Kinetic Chains)</span>
                </label>
                <span
                  id="soap-assessment-desc"
                  className={cn(
                    'text-xs font-mono',
                    getCounterClass(assessmentValue.length, MAX_SECTION_LENGTH),
                  )}
                >
                  {`${assessmentValue.length.toLocaleString('en-US')} / ${MAX_SECTION_LENGTH.toLocaleString('en-US')}`}
                </span>
              </div>
              <textarea
                id="soap-assessment"
                {...register('assessment')}
                disabled={isReadOnly || isSaving}
                rows={3}
                aria-invalid={Boolean(errors.assessment)}
                aria-describedby={
                  errors.assessment
                    ? 'soap-assessment-error soap-assessment-desc'
                    : 'soap-assessment-desc'
                }
                className={cn(
                  'w-full rounded-md border p-2.5 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
                  errors.assessment
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : 'border-slate-300 focus:border-indigo-500',
                  (isReadOnly || isSaving) && 'bg-slate-50 text-slate-500 cursor-not-allowed',
                )}
                placeholder="Practitioner diagnostic evaluation, kinetic chain correlations, progress..."
              />
              {errors.assessment && (
                <p
                  id="soap-assessment-error"
                  role="alert"
                  className="text-xs text-red-600 font-medium"
                >
                  {errors.assessment.message}
                </p>
              )}
            </div>

            {/* P — Plan */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="soap-plan"
                  className="text-sm font-medium text-slate-700 flex items-center gap-1.5"
                >
                  <span className="font-bold text-indigo-700">P</span>
                  <span> — Plan (Interventions, Exercises, Follow-up)</span>
                </label>
                <span
                  id="soap-plan-desc"
                  className={cn(
                    'text-xs font-mono',
                    getCounterClass(planValue.length, MAX_SECTION_LENGTH),
                  )}
                >
                  {`${planValue.length.toLocaleString('en-US')} / ${MAX_SECTION_LENGTH.toLocaleString('en-US')}`}
                </span>
              </div>
              <textarea
                id="soap-plan"
                {...register('plan')}
                disabled={isReadOnly || isSaving}
                rows={3}
                aria-invalid={Boolean(errors.plan)}
                aria-describedby={errors.plan ? 'soap-plan-error soap-plan-desc' : 'soap-plan-desc'}
                className={cn(
                  'w-full rounded-md border p-2.5 text-sm shadow-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1',
                  errors.plan
                    ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                    : 'border-slate-300 focus:border-indigo-500',
                  (isReadOnly || isSaving) && 'bg-slate-50 text-slate-500 cursor-not-allowed',
                )}
                placeholder="Therapeutic exercise prescription, ergonomic advice, follow-up cadence..."
              />
              {errors.plan && (
                <p id="soap-plan-error" role="alert" className="text-xs text-red-600 font-medium">
                  {errors.plan.message}
                </p>
              )}
            </div>

            {/* Optional Freeform Observations & Raw Notes Section */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRawNotes((prev) => !prev)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                aria-expanded={showRawNotes}
                aria-controls="soap-raw-section"
              >
                <span>{showRawNotes ? '▼ Hide' : '▶ Show'} Freeform Notes & Raw Observations</span>
              </button>

              {showRawNotes && (
                <div id="soap-raw-section" className="mt-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <label htmlFor="soap-raw-text" className="text-xs font-medium text-slate-600">
                      Additional Clinical Notes / Raw Dictation (Optional)
                    </label>
                    <span
                      id="soap-raw-desc"
                      className={cn(
                        'text-xs font-mono',
                        getCounterClass(rawTextValue.length, MAX_TOTAL_NOTE_LENGTH),
                      )}
                    >
                      {`${rawTextValue.length.toLocaleString('en-US')} / ${MAX_TOTAL_NOTE_LENGTH.toLocaleString('en-US')}`}
                    </span>
                  </div>
                  <textarea
                    id="soap-raw-text"
                    {...register('rawText')}
                    disabled={isReadOnly || isSaving}
                    rows={2}
                    aria-invalid={Boolean(
                      errors.rawText && !errors.rawText.message?.includes('Total'),
                    )}
                    aria-describedby="soap-raw-desc"
                    className={cn(
                      'w-full rounded-md border p-2.5 text-xs shadow-sm font-mono transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                      errors.rawText && !errors.rawText.message?.includes('Total')
                        ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                        : 'border-slate-300 focus:border-indigo-500',
                      (isReadOnly || isSaving) && 'bg-slate-50 text-slate-500 cursor-not-allowed',
                    )}
                    placeholder="Unstructured observations, verbal patient quotes, legacy charting..."
                  />
                </div>
              )}
            </div>

            {/* Bottom Actions and Total Note Metrics */}
            {!isReadOnly && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  Total note length:{' '}
                  <span
                    data-testid="soap-total-counter"
                    className={cn(
                      'font-mono font-medium',
                      totalLength > 45000 && 'text-amber-600',
                      totalLength > MAX_TOTAL_NOTE_LENGTH && 'text-red-600 font-bold',
                    )}
                  >
                    {`${totalLength.toLocaleString('en-US')} / ${MAX_TOTAL_NOTE_LENGTH.toLocaleString('en-US')} chars`}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isDirty && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => reset()}
                      data-testid="soap-reset-btn"
                    >
                      Discard Edits
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="default"
                    disabled={isSaving || !isDirty || totalLength > MAX_TOTAL_NOTE_LENGTH}
                    data-testid="soap-save-btn"
                  >
                    {isSaving ? 'Saving Notes...' : 'Save Notes'}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Unsaved Changes Route Protection Modal */}
      <ConfirmDiscardDialog
        open={isBlocked}
        onConfirm={proceed}
        onCancel={cancelDiscard}
        title="Discard unsaved clinical documentation?"
        description="You have unsaved changes in this session's SOAP notes. Leaving this page will discard your recent entries. Are you sure you wish to discard them?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
      />
    </>
  );
};
