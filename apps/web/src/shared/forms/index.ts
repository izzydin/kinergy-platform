/**
 * Form Framework — Shared Infrastructure
 *
 * Composable form layout, submit actions, validation summary, dirty guard hooks,
 * and server error integration.
 *
 * Designed to complement the `@kinergy-platform/ui` FormField suite.
 * Feature forms remain explicit React components — this framework standardises
 * composition and behaviour, NOT form generation from configuration.
 *
 * @packageDocumentation
 */

// ─── Form Primitives & Context ──────────────────────────────────────────────
export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
  FormFieldContext,
  FormItemContext,
  type FormFieldContextValue,
  type FormItemContextValue,
  type FormItemProps,
  type FormLabelProps,
  type FormControlProps,
  type FormDescriptionProps,
  type FormMessageProps,
} from './components/form';

// ─── Layout ─────────────────────────────────────────────────────────────────
export { FormLayout, type FormLayoutProps, type FormLayoutVariant } from './components/form-layout';
export { FormSection, type FormSectionProps } from './components/form-section';
export {
  FormFieldGroup,
  type FormFieldGroupProps,
  type FormFieldGroupColumns,
} from './components/form-field-group';
export {
  FormActions,
  type FormActionsProps,
  type FormActionsAlign,
} from './components/form-actions';

// ─── Actions ────────────────────────────────────────────────────────────────
export { FormSubmitButton, type FormSubmitButtonProps } from './components/form-submit-button';
export { FormCancelButton, type FormCancelButtonProps } from './components/form-cancel-button';

// ─── Validation Summary ──────────────────────────────────────────────────────
export {
  FormValidationSummary,
  extractValidationErrorItems,
  type FormValidationSummaryProps,
  type FormValidationErrorItem,
} from './components/form-validation-summary';

// ─── Dirty Guard ─────────────────────────────────────────────────────────────
export {
  ConfirmDiscardDialog,
  type ConfirmDiscardDialogProps,
} from './components/confirm-discard-dialog';
export {
  useDirtyGuard,
  type DirtyGuardOptions,
  type DirtyGuardResult,
} from './hooks/use-dirty-guard';
export {
  useDirtyDialogGuard,
  type DirtyDialogGuardOptions,
  type DirtyDialogGuardResult,
} from './hooks/use-dirty-dialog-guard';

// ─── Server Error Integration ─────────────────────────────────────────────────
export {
  useApplyServerErrors,
  type ApplyServerErrorsOptions,
  type ServerValidationDetails,
} from './hooks/use-apply-server-errors';
