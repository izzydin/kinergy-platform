import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormControl,
  FormErrorMessage,
  FormField,
  FormHelperText,
  FormLabel,
  Input,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@kinergy-platform/ui';
import { generalSettingsSchema, type GeneralSettingsFormValues } from '../types';

export const GeneralSettingsForm: React.FC = () => {
  const [avatarUrl, setAvatarUrl] = useState<string>(
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  );
  const [simulateError, setSimulateError] = useState<boolean>(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<GeneralSettingsFormValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: {
      workspaceName: 'Kinergy Platform HQ',
      contactEmail: 'architect@kinergy-platform.io',
      environment: 'production',
      bio: 'Primary validation workspace for architectural foundation testing.',
    },
  });

  const onSubmit = async (data: GeneralSettingsFormValues) => {
    setSubmitStatus('idle');
    setToastMessage(null);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (simulateError) {
      setSubmitStatus('error');
      return;
    }

    setSubmitStatus('success');
    setToastMessage(`Workspace settings updated successfully for "${data.workspaceName}".`);
  };

  return (
    <ToastProvider>
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>General Workspace Preferences</CardTitle>
              <CardDescription>
                Validates React Hook Form + Zod resolution, Text Inputs, Avatars, Dialogs, and Form
                Alerts.
              </CardDescription>
            </div>
            <Badge variant="outline">Form Validation Spec</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
            {/* 1. Avatar Update Verification Section */}
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={avatarUrl} alt="Workspace Avatar" />
                  <AvatarFallback className="font-bold text-lg">KP</AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-semibold text-foreground text-sm">Workspace Brand Mark</h4>
                  <p className="text-xs text-muted-foreground">JPG, PNG, or GIF up to 2MB.</p>
                </div>
              </div>

              {/* Dialog Trigger to Simulate Photo Upload */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Change Avatar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Workspace Avatar</DialogTitle>
                    <DialogDescription>
                      Validates modal overlay integration, focus trapping, and avatar preview state
                      updates.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-4">
                    <FormField>
                      <FormLabel>Avatar Image URL</FormLabel>
                      <FormControl>
                        <Input
                          value={avatarUrl}
                          onChange={(e) => setAvatarUrl(e.target.value)}
                          placeholder="https://example.com/avatar.png"
                          data-testid="avatar-url-input"
                        />
                      </FormControl>
                    </FormField>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="default" size="sm">
                        Confirm Avatar Change
                      </Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* 2. Error State Alert */}
            {submitStatus === 'error' && (
              <Alert variant="destructive" data-testid="general-form-error">
                <AlertTitle>Form Submission Failed</AlertTitle>
                <AlertDescription>
                  Simulated Gateway Timeout: Unable to synchronize settings with remote server.
                  Please retry.
                </AlertDescription>
              </Alert>
            )}

            {/* 3. Success State Alert */}
            {submitStatus === 'success' && (
              <Alert variant="default" data-testid="general-form-success">
                <AlertTitle>Settings Saved</AlertTitle>
                <AlertDescription>
                  Your workspace preferences have been validated and saved to memory.
                </AlertDescription>
              </Alert>
            )}

            {/* 4. Text Input: Workspace Name */}
            <FormField isInvalid={Boolean(errors.workspaceName)}>
              <FormLabel required>Workspace Name</FormLabel>
              <FormControl>
                <Input
                  {...register('workspaceName')}
                  placeholder="e.g. Kinergy Core"
                  data-testid="workspace-name-input"
                />
              </FormControl>
              <FormHelperText>Identifies your organization on the platform.</FormHelperText>
              <FormErrorMessage>{errors.workspaceName?.message}</FormErrorMessage>
            </FormField>

            {/* 5. Text Input: Contact Email */}
            <FormField isInvalid={Boolean(errors.contactEmail)}>
              <FormLabel required>Administrative Contact Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  {...register('contactEmail')}
                  placeholder="admin@kinergy-platform.io"
                  data-testid="contact-email-input"
                />
              </FormControl>
              <FormHelperText>
                Receives critical platform security alerts and system advisories.
              </FormHelperText>
              <FormErrorMessage>{errors.contactEmail?.message}</FormErrorMessage>
            </FormField>

            {/* 6. Text Area / Bio Description */}
            <FormField isInvalid={Boolean(errors.bio)}>
              <FormLabel>Workspace Description</FormLabel>
              <FormControl>
                <Input
                  {...register('bio')}
                  placeholder="Enter description..."
                  data-testid="bio-input"
                />
              </FormControl>
              <FormHelperText>
                Optional summary of this organization's operational scope.
              </FormHelperText>
              <FormErrorMessage>{errors.bio?.message}</FormErrorMessage>
            </FormField>

            {/* 7. Simulation Controls & Form Action Bar */}
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-background sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateError}
                  onChange={(e) => setSimulateError(e.target.checked)}
                  className="rounded border-border"
                  data-testid="simulate-error-checkbox"
                />
                <span>Simulate Server Submission Failure</span>
              </label>

              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    reset();
                    setSubmitStatus('idle');
                  }}
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  isLoading={isSubmitting}
                  loadingText="Saving Preferences..."
                >
                  Save Workspace Settings
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Form Architecture Verification: Validates strict decoupling of presentational primitives
          from form state resolvers.
        </CardFooter>
      </Card>

      {/* Toast Notification Viewport */}
      <ToastViewport>
        {toastMessage && (
          <Toast variant="default">
            <div className="grid gap-1">
              <ToastTitle>Workspace Updated</ToastTitle>
              <ToastDescription>{toastMessage}</ToastDescription>
            </div>
            <ToastClose onClick={() => setToastMessage(null)} />
          </Toast>
        )}
      </ToastViewport>
    </ToastProvider>
  );
};
