import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@kinergy-platform/ui';
import { soapNotesSchema, SoapNotesFormData } from '../schemas/session-notes.schema';
import { SoapNotesData, SessionStatusType } from '../types';

interface SoapNotesFormProps {
  initialNotes?: SoapNotesData;
  sessionStatus: SessionStatusType;
  isLoading?: boolean;
  onSave: (data: SoapNotesFormData) => Promise<void> | void;
}

export const SoapNotesForm: React.FC<SoapNotesFormProps> = ({
  initialNotes,
  sessionStatus,
  isLoading = false,
  onSave,
}) => {
  const isReadOnly =
    sessionStatus === 'COMPLETED' || sessionStatus === 'CANCELLED' || sessionStatus === 'NO_SHOW';

  const {
    register,
    handleSubmit,
    watch,
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

  const subjectiveValue = watch('subjective') ?? '';
  const objectiveValue = watch('objective') ?? '';
  const assessmentValue = watch('assessment') ?? '';
  const planValue = watch('plan') ?? '';

  const onSubmit = (data: SoapNotesFormData) => {
    if (isReadOnly) return;
    onSave(data);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-lg font-semibold">Clinical SOAP Documentation</CardTitle>
          <p className="text-sm text-slate-500">
            {isReadOnly
              ? 'Signed clinical documentation — locked & immutable.'
              : 'Record structured findings and clinical progress notes.'}
          </p>
        </div>
        {isReadOnly && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            Locked (Read-Only)
          </span>
        )}
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* S - Subjective */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-700">
                S — Subjective (Patient Complaints, Symptoms, History)
              </label>
              <span className="text-xs text-slate-400">{subjectiveValue.length} / 10,000</span>
            </div>
            <textarea
              {...register('subjective')}
              disabled={isReadOnly || isLoading}
              rows={3}
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Patient stated pain levels, chief complaints, functional improvements..."
            />
            {errors.subjective && (
              <p className="text-xs text-red-600">{errors.subjective.message}</p>
            )}
          </div>

          {/* O - Objective */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-700">
                O — Objective (Muscle Tests, Range of Motion, Palpation)
              </label>
              <span className="text-xs text-slate-400">{objectiveValue.length} / 10,000</span>
            </div>
            <textarea
              {...register('objective')}
              disabled={isReadOnly || isLoading}
              rows={3}
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Kinesiology muscle balance indicators, physical posture findings..."
            />
            {errors.objective && <p className="text-xs text-red-600">{errors.objective.message}</p>}
          </div>

          {/* A - Assessment */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-700">
                A — Assessment (Clinical Analysis, Kinetic Chains)
              </label>
              <span className="text-xs text-slate-400">{assessmentValue.length} / 10,000</span>
            </div>
            <textarea
              {...register('assessment')}
              disabled={isReadOnly || isLoading}
              rows={3}
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Practitioner diagnostic evaluation and progress assessment..."
            />
            {errors.assessment && (
              <p className="text-xs text-red-600">{errors.assessment.message}</p>
            )}
          </div>

          {/* P - Plan */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-700">
                P — Plan (Interventions, Exercises, Follow-up)
              </label>
              <span className="text-xs text-slate-400">{planValue.length} / 10,000</span>
            </div>
            <textarea
              {...register('plan')}
              disabled={isReadOnly || isLoading}
              rows={3}
              className="w-full rounded-md border border-slate-300 p-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Therapeutic exercise prescription, next visit frequency..."
            />
            {errors.plan && <p className="text-xs text-red-600">{errors.plan.message}</p>}
          </div>

          {!isReadOnly && (
            <div className="flex justify-end pt-2">
              <Button type="submit" variant="default" disabled={isLoading || !isDirty}>
                {isLoading ? 'Saving Notes...' : 'Save Notes'}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
