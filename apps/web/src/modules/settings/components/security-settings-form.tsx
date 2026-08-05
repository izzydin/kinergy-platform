import React from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  PasswordInput,
} from '@kinergy-platform/ui';

export const SecuritySettingsForm: React.FC = () => {
  return (
    <div className="space-y-6">
      <Alert variant="default">
        <AlertTitle>Security Policy Active</AlertTitle>
        <AlertDescription>
          Multi-factor authentication (MFA) and OAuth2 identity token rotation policies enforced.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Update Security Keys</CardTitle>
          <CardDescription>
            Validates PasswordInput accessibility and show/hide toggle behavior within domain forms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField controlId="current-password">
            <FormLabel required>Current Master Password</FormLabel>
            <FormControl>
              <PasswordInput placeholder="Enter current password" />
            </FormControl>
          </FormField>

          <FormField controlId="new-password">
            <FormLabel required>New Master Password</FormLabel>
            <FormControl>
              <PasswordInput placeholder="Enter new password" />
            </FormControl>
            <FormHelperText>Must meet platform security complexity rules.</FormHelperText>
          </FormField>
        </CardContent>
        <CardFooter>
          <Button variant="destructive">Update Security Policy</Button>
        </CardFooter>
      </Card>
    </div>
  );
};
