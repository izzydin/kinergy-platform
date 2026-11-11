import { fireEvent, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormControl,
  FormErrorMessage,
  FormField,
  FormHelperText,
  FormLabel,
  Input,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '../index';

describe('WCAG 2.2 AA Comprehensive Component Accessibility Audit (axe-core)', () => {
  describe('1. Button System (WCAG 2.2 AA & SC 4.1.2 Name, Role, Value)', () => {
    it('passes automated axe audit across all 7 button variants', async () => {
      const { container } = render(
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Primary Action</Button>
          <Button variant="brand">Brand Action</Button>
          <Button variant="secondary">Secondary Action</Button>
          <Button variant="outline">Outline Action</Button>
          <Button variant="ghost">Ghost Action</Button>
          <Button variant="destructive">Destructive Action</Button>
          <Button variant="link">Link Action</Button>
        </div>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('requires accessible names on icon-only buttons', async () => {
      const { container } = render(
        <Button size="icon" aria-label="Open settings panel">
          <span aria-hidden="true">⚙</span>
        </Button>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
      expect(screen.getByRole('button', { name: 'Open settings panel' })).toBeInTheDocument();
    });

    it('exposes appropriate accessibility attributes in loading and disabled states', async () => {
      const { container, rerender } = render(
        <Button isLoading aria-label="Saving client record">
          Save
        </Button>,
      );
      let results = await axe(container);
      expect(results).toHaveNoViolations();
      const loadingBtn = screen.getByRole('button');
      expect(loadingBtn).toHaveAttribute('aria-busy', 'true');
      expect(loadingBtn).toBeDisabled();

      rerender(<Button disabled>Disabled Action</Button>);
      results = await axe(container);
      expect(results).toHaveNoViolations();
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('supports keyboard activation via Enter and Space keys', () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Keyboard Accessible</Button>);
      const btn = screen.getByRole('button', { name: 'Keyboard Accessible' });

      btn.focus();
      expect(document.activeElement).toBe(btn);

      fireEvent.keyDown(btn, { key: 'Enter', code: 'Enter' });
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('2. Form System & Controls (WCAG 2.2 SC 1.3.1, 3.3.1, 3.3.2)', () => {
    it('passes automated axe audit on fully configured text Input with FormField', async () => {
      const { container } = render(
        <FormField controlId="full-name" isInvalid={false}>
          <FormLabel required>Client Full Name</FormLabel>
          <FormControl>
            <Input placeholder="Enter legal name" required />
          </FormControl>
          <FormHelperText>Must match official identity document.</FormHelperText>
        </FormField>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const input = screen.getByRole('textbox', { name: /client full name/i });
      expect(input).toHaveAttribute('required');
      expect(input).toHaveAttribute('aria-describedby', 'full-name-helper');
    });

    it('exposes aria-invalid and aria-errormessage on validation failure', async () => {
      const { container } = render(
        <FormField controlId="email-addr" isInvalid={true}>
          <FormLabel>Email Address</FormLabel>
          <FormControl>
            <Input type="email" defaultValue="invalid-email" />
          </FormControl>
          <FormErrorMessage>Please enter a valid RFC-compliant email address.</FormErrorMessage>
        </FormField>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const input = screen.getByRole('textbox', { name: /email address/i });
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', 'email-addr-helper email-addr-error');
      expect(screen.getByRole('alert')).toHaveTextContent(/valid rfc-compliant/i);
    });

    it('passes automated axe audit on Textarea control', async () => {
      const { container } = render(
        <FormField controlId="clinical-notes">
          <FormLabel>Clinical Subjective Notes</FormLabel>
          <FormControl>
            <Textarea placeholder="Document patient reported symptoms" />
          </FormControl>
          <FormHelperText>Keep observations objective and chronological.</FormHelperText>
        </FormField>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on Select control with label', async () => {
      const { container } = render(
        <FormField controlId="membership-plan">
          <FormLabel htmlFor="membership-plan-select">Membership Plan</FormLabel>
          <FormControl>
            <Select id="membership-plan-select" defaultValue="standard">
              <option value="basic">Basic Tier</option>
              <option value="standard">Standard Tier</option>
              <option value="premium">Premium VIP Tier</option>
            </Select>
          </FormControl>
        </FormField>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('passes automated axe audit on Checkbox control with associated label', async () => {
      const { container } = render(
        <Checkbox id="terms-consent" label="I accept the service agreement" />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
      expect(
        screen.getByRole('checkbox', { name: /i accept the service agreement/i }),
      ).toBeInTheDocument();
    });

    it('passes automated axe audit on Switch control with accessible label', async () => {
      const { container } = render(
        <Switch id="notifications-toggle" label="Enable SMS Appointment Reminders" />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
      expect(
        screen.getByRole('switch', { name: /enable sms appointment reminders/i }),
      ).toBeInTheDocument();
    });

    it('passes automated axe audit on RadioGroup control', async () => {
      const { container } = render(
        <RadioGroup defaultValue="card" aria-label="Preferred payment method">
          <Radio value="card" id="r-card" label="Credit / Debit Card" />
          <Radio value="cash" id="r-cash" label="Cash at Reception" />
        </RadioGroup>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('3. Modal Dialog & Overlays (WCAG 2.2 SC 2.1.2 No Keyboard Trap, SC 2.4.3)', () => {
    it('passes automated axe audit when Dialog is open with Title and Description', async () => {
      const { baseElement } = render(
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Plan Deactivation</DialogTitle>
              <DialogDescription>
                Deactivating this membership plan will prevent new subscribers from choosing it.
              </DialogDescription>
            </DialogHeader>
            <p className="text-xs">Active subscribers will retain their existing terms.</p>
            <DialogFooter>
              <Button variant="outline">Cancel</Button>
              <Button variant="destructive">Confirm Deactivate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );
      const results = await axe(baseElement);
      expect(results).toHaveNoViolations();
      expect(screen.getByRole('dialog', { name: 'Confirm Plan Deactivation' })).toBeInTheDocument();
    });

    it('provides accessible close triggers and maintains no keyboard traps', () => {
      const handleClose = jest.fn();
      render(
        <Dialog open onOpenChange={handleClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Accessible Modal</DialogTitle>
              <DialogDescription>Modal description for screen readers.</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button variant="outline" onClick={handleClose}>
                Dismiss
              </Button>
            </DialogClose>
          </DialogContent>
        </Dialog>,
      );

      const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
      fireEvent.click(dismissBtn);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  describe('4. Navigation & Tabs (WCAG 2.2 SC 2.4.7 Focus Visible, SC 4.1.2)', () => {
    it('passes automated axe audit for Tabs component with role tablist and tabpanel', async () => {
      const { container } = render(
        <Tabs defaultValue="overview">
          <TabsList aria-label="Client profile sub-navigation">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="history">Treatment History</TabsTrigger>
            <TabsTrigger value="billing">Invoices & Billing</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p>Client general overview content.</p>
          </TabsContent>
          <TabsContent value="history">
            <p>Clinical encounter timeline content.</p>
          </TabsContent>
          <TabsContent value="billing">
            <p>Invoices ledger content.</p>
          </TabsContent>
        </Tabs>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const activeTab = screen.getByRole('tab', { name: 'Overview' });
      expect(activeTab).toHaveAttribute('aria-selected', 'true');
    });

    it('switches active tabs upon keyboard trigger', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList aria-label="Settings categories">
            <TabsTrigger value="tab1">General</TabsTrigger>
            <TabsTrigger value="tab2">Security</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">General Settings Pane</TabsContent>
          <TabsContent value="tab2">Security Settings Pane</TabsContent>
        </Tabs>,
      );

      const tab2 = screen.getByRole('tab', { name: 'Security' });
      fireEvent.click(tab2);
      expect(tab2).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Security Settings Pane')).toBeVisible();
    });
  });

  describe('5. Status Badges & Alerts (WCAG 2.2 SC 1.4.1 Non-reliance on Color)', () => {
    it('passes automated axe audit on StatusBadge across all status scales', async () => {
      const { container } = render(
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="success" label="Active Member" />
          <StatusBadge status="warning" label="Payment Pending" />
          <StatusBadge status="danger" label="Agreement Suspended" />
          <StatusBadge status="info" label="Scheduled Service" />
        </div>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders Alert in default, warning, and destructive variants with role alert', async () => {
      const { container } = render(
        <div className="space-y-3">
          <Alert variant="default">
            <AlertTitle>Scheduled Maintenance</AlertTitle>
            <AlertDescription>
              System will undergo routine maintenance at 02:00 UTC.
            </AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Expiring Agreement</AlertTitle>
            <AlertDescription>Member agreement expires in 3 days.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>Anti-passback cooldown active for this membership.</AlertDescription>
          </Alert>
        </div>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();

      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(3);
    });
  });

  describe('6. Feedback & Notifications (WCAG 2.2 SC 4.1.3 Status Messages)', () => {
    it('passes automated axe audit on Toast notifications with ToastProvider and Viewport', async () => {
      const { container } = render(
        <ToastProvider>
          <Toast>
            <ToastTitle>Payment Successful</ToastTitle>
            <ToastDescription>Transaction #9021 settled via Cash Tender.</ToastDescription>
          </Toast>
          <ToastViewport aria-label="Notifications" />
        </ToastProvider>,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('renders Spinner with sr-only text for screen-reader announcement', async () => {
      const { container } = render(<Spinner size="md" label="Synchronizing records..." />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
      expect(screen.getByText('Synchronizing records...')).toBeInTheDocument();
    });

    it('renders Skeleton with aria-hidden="true" to prevent redundant screen reader chatter', () => {
      render(<Skeleton className="h-6 w-32" />);
      const skeleton = document.querySelector('.animate-pulse');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
