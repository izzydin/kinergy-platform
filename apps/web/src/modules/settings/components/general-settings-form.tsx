import React, { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormControl,
  FormField,
  FormHelperText,
  FormLabel,
  Input,
} from '@kinergy-platform/ui';
import type { GeneralSettingsFormValues } from '../types';

export const GeneralSettingsForm: React.FC = () => {
  const [formValues, setFormValues] = useState<GeneralSettingsFormValues>({
    workspaceName: 'Kinergy Platform Enterprise',
    adminEmail: 'admin@kinergy.io',
    timezone: 'UTC-05:00 Eastern Time',
  });
  const [isSaved, setIsSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>General Workspace Settings</CardTitle>
          <CardDescription>
            Architectural validation form demonstrating FormField composition and input contracts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField controlId="workspace-name">
            <FormLabel required>Workspace Name</FormLabel>
            <FormControl>
              <Input
                value={formValues.workspaceName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormValues({ ...formValues, workspaceName: e.target.value })
                }
              />
            </FormControl>
            <FormHelperText>Official organization moniker.</FormHelperText>
          </FormField>

          <FormField controlId="admin-email">
            <FormLabel required>Admin Email Address</FormLabel>
            <FormControl>
              <Input
                type="email"
                value={formValues.adminEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormValues({ ...formValues, adminEmail: e.target.value })
                }
              />
            </FormControl>
            <FormHelperText>Receives platform security alerts.</FormHelperText>
          </FormField>
        </CardContent>
        <CardFooter className="flex items-center justify-between">
          <Button type="submit">Save Preferences</Button>
          {isSaved && (
            <span className="font-medium text-emerald-600 text-sm">
              Preferences saved successfully!
            </span>
          )}
        </CardFooter>
      </Card>
    </form>
  );
};
