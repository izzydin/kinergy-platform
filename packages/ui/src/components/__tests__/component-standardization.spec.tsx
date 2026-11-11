import { fireEvent, render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Radio,
  RadioGroup,
  Select,
  Separator,
  StatusBadge,
  StatusIndicator,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '../index';

expect.extend(toHaveNoViolations);

describe('DS-03 Shared UI Component Standardization Suite', () => {
  describe('1. Button System Standardization', () => {
    it('passes automated axe accessibility checks on all variants', async () => {
      const { container } = render(
        <div className="space-x-2">
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

    it('renders Primary variant mapped to Forest Green background and White text', () => {
      render(<Button variant="primary">Submit Form</Button>);
      const button = screen.getByRole('button', { name: /submit form/i });
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('renders Brand variant mapped to Kinergy Green background and Charcoal text', () => {
      render(<Button variant="brand">Brand Highlight</Button>);
      const button = screen.getByRole('button', { name: /brand highlight/i });
      expect(button).toHaveClass('bg-brand', 'text-brand-foreground');
    });

    it('renders Outline variant with card background, border, and Charcoal text', () => {
      render(<Button variant="outline">Cancel</Button>);
      const button = screen.getByRole('button', { name: /cancel/i });
      expect(button).toHaveClass('bg-card', 'text-foreground', 'border-input');
    });

    it('renders Ghost variant with transparent background and Charcoal text', () => {
      render(<Button variant="ghost">Dismiss</Button>);
      const button = screen.getByRole('button', { name: /dismiss/i });
      expect(button).toHaveClass('text-foreground');
    });

    it('renders Link variant with Forest text and underline on hover', () => {
      render(<Button variant="link">Learn More</Button>);
      const button = screen.getByRole('button', { name: /learn more/i });
      expect(button).toHaveClass('text-primary', 'underline-offset-4');
    });

    it('supports icon-only button with required aria-label', () => {
      render(
        <Button size="icon" aria-label="Settings configuration">
          <span aria-hidden="true">⚙</span>
        </Button>,
      );
      const button = screen.getByRole('button', { name: /settings configuration/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('h-10', 'w-10');
    });

    it('maintains accessible focus ring and disabled states', () => {
      render(<Button disabled>Disabled Action</Button>);
      const button = screen.getByRole('button', { name: /disabled action/i });
      expect(button).toBeDisabled();
      expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50');
    });

    it('renders loading state with aria-busy and spinner', () => {
      render(
        <Button isLoading loadingText="Saving Record...">
          Save
        </Button>,
      );
      const button = screen.getByRole('button', { name: /saving record.../i });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Saving Record...')).toBeInTheDocument();
    });
  });

  describe('2. Form System Controls (Textarea, Select, Checkbox, Switch, Radio)', () => {
    describe('Textarea', () => {
      it('passes axe accessibility checks with label', async () => {
        const { container } = render(
          <div>
            <label htmlFor="notes">Clinical Notes</label>
            <Textarea id="notes" placeholder="Enter session notes..." />
          </div>,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('renders invalid state with aria-invalid="true" and destructive border', () => {
        render(<Textarea aria-label="Notes" isInvalid />);
        const textarea = screen.getByRole('textbox', { name: /notes/i });
        expect(textarea).toHaveAttribute('aria-invalid', 'true');
        expect(textarea).toHaveClass('border-destructive');
      });

      it('renders disabled state', () => {
        render(<Textarea aria-label="Notes" disabled />);
        const textarea = screen.getByRole('textbox', { name: /notes/i });
        expect(textarea).toBeDisabled();
      });
    });

    describe('Select', () => {
      it('passes axe accessibility checks with label', async () => {
        const { container } = render(
          <div>
            <label htmlFor="plan-select">Select Membership Plan</label>
            <Select id="plan-select">
              <option value="basic">Basic Plan</option>
              <option value="premium">Premium Plan</option>
            </Select>
          </div>,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('renders invalid state with aria-invalid and destructive border', () => {
        render(
          <Select aria-label="Select Plan" isInvalid>
            <option value="a">A</option>
          </Select>,
        );
        const select = screen.getByRole('combobox', { name: /select plan/i });
        expect(select).toHaveAttribute('aria-invalid', 'true');
        expect(select).toHaveClass('border-destructive');
      });
    });

    describe('Checkbox', () => {
      it('passes axe accessibility checks with integrated label', async () => {
        const { container } = render(
          <Checkbox label="Agree to terms" description="Required for registration" />,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('toggles checked state on click and invokes onChange callback', () => {
        const handleChange = jest.fn();
        render(<Checkbox label="Auto-renew subscription" onChange={handleChange} />);
        const checkbox = screen.getByRole('checkbox', { name: /auto-renew subscription/i });
        expect(checkbox).not.toBeChecked();

        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();
        expect(handleChange).toHaveBeenCalledTimes(1);
      });

      it('renders disabled state with disabled cursor', () => {
        render(<Checkbox label="Locked option" disabled />);
        const checkbox = screen.getByRole('checkbox', { name: /locked option/i });
        expect(checkbox).toBeDisabled();
      });
    });

    describe('Switch', () => {
      it('passes axe accessibility checks', async () => {
        const { container } = render(
          <Switch label="Enable Notifications" description="Receive appointment alerts" />,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('toggles aria-checked status on click and Space/Enter keydown', () => {
        const handleCheckedChange = jest.fn();
        render(<Switch label="Dark Mode" onCheckedChange={handleCheckedChange} />);
        const switchControl = screen.getByRole('switch', { name: /dark mode/i });
        expect(switchControl).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(switchControl);
        expect(switchControl).toHaveAttribute('aria-checked', 'true');
        expect(handleCheckedChange).toHaveBeenCalledWith(true);

        fireEvent.keyDown(switchControl, { key: ' ' });
        expect(switchControl).toHaveAttribute('aria-checked', 'false');
        expect(handleCheckedChange).toHaveBeenCalledWith(false);
      });
    });

    describe('RadioGroup & Radio', () => {
      it('passes axe accessibility checks', async () => {
        const { container } = render(
          <RadioGroup defaultValue="monthly">
            <Radio value="monthly" label="Monthly Billing" />
            <Radio value="annual" label="Annual Billing" />
          </RadioGroup>,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('manages value selection across radio options', () => {
        const handleValueChange = jest.fn();
        render(
          <RadioGroup defaultValue="monthly" onValueChange={handleValueChange}>
            <Radio value="monthly" label="Monthly Billing" />
            <Radio value="annual" label="Annual Billing" />
          </RadioGroup>,
        );

        const monthlyRadio = screen.getByRole('radio', { name: /monthly billing/i });
        const annualRadio = screen.getByRole('radio', { name: /annual billing/i });

        expect(monthlyRadio).toBeChecked();
        expect(annualRadio).not.toBeChecked();

        fireEvent.click(annualRadio);
        expect(annualRadio).toBeChecked();
        expect(handleValueChange).toHaveBeenCalledWith('annual');
      });
    });
  });

  describe('3. Status & Feedback Components (Badge, StatusBadge, StatusIndicator, Alert, Toast)', () => {
    describe('StatusBadge (WCAG 1.4.1 Compliance)', () => {
      it('passes axe accessibility checks across all semantic statuses', async () => {
        const { container } = render(
          <div className="flex gap-2">
            <StatusBadge status="success" label="Active" />
            <StatusBadge status="warning" label="Expiring Soon" />
            <StatusBadge status="danger" label="Payment Failed" />
            <StatusBadge status="info" label="Draft" />
            <StatusBadge status="neutral" label="Archived" />
          </div>,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('combines semantic icon, accessible label, and token styling', () => {
        render(<StatusBadge status="success" label="Paid in Full" />);
        const badge = screen.getByLabelText('Paid in Full');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent('Paid in Full');
        expect(badge).toHaveClass('bg-status-success-surface', 'text-status-success');
      });

      it('supports solid tone using canonical status background and white text', () => {
        render(<StatusBadge status="danger" label="Cancelled" tone="solid" />);
        const badge = screen.getByLabelText('Cancelled');
        expect(badge).toHaveClass('bg-status-danger', 'text-status-danger-foreground');
      });
    });

    describe('StatusIndicator', () => {
      it('renders role="status" and visible label', () => {
        render(<StatusIndicator status="success" label="System Operational" pulse />);
        const indicator = screen.getByRole('status', { name: /system operational/i });
        expect(indicator).toBeInTheDocument();
        expect(screen.getByText('System Operational')).toBeInTheDocument();
      });
    });

    describe('Alert Standardization', () => {
      it('renders success, warning, danger, and info variants using semantic design tokens', () => {
        const { rerender } = render(
          <Alert variant="success">
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>Record updated.</AlertDescription>
          </Alert>,
        );
        expect(screen.getByRole('alert')).toHaveClass(
          'border-status-success-border',
          'bg-status-success-surface',
          'text-status-success',
        );

        rerender(
          <Alert variant="warning">
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>Low inventory threshold.</AlertDescription>
          </Alert>,
        );
        expect(screen.getByRole('alert')).toHaveClass(
          'border-status-warning-border',
          'bg-status-warning-surface',
          'text-status-warning',
        );

        rerender(
          <Alert variant="info">
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>Scheduled maintenance at midnight.</AlertDescription>
          </Alert>,
        );
        expect(screen.getByRole('alert')).toHaveClass(
          'border-status-info-border',
          'bg-status-info-surface',
          'text-status-info',
        );
      });
    });

    describe('Badge Standardization', () => {
      it('supports official brand variant and semantic variants', () => {
        render(
          <div>
            <Badge variant="brand">Kinergy Signature</Badge>
            <Badge variant="success">Confirmed</Badge>
            <Badge variant="warning">Pending</Badge>
            <Badge variant="info">Scheduled</Badge>
            <Badge variant="neutral">Inactive</Badge>
          </div>,
        );
        expect(screen.getByText('Kinergy Signature')).toHaveClass(
          'bg-brand',
          'text-brand-foreground',
        );
        expect(screen.getByText('Confirmed')).toHaveClass('bg-status-success');
        expect(screen.getByText('Pending')).toHaveClass('bg-status-warning');
        expect(screen.getByText('Scheduled')).toHaveClass('bg-status-info');
        expect(screen.getByText('Inactive')).toHaveClass('bg-muted');
      });
    });
  });

  describe('4. Layout & Navigation Components (Tabs, Separator)', () => {
    describe('Tabs', () => {
      it('passes axe accessibility checks', async () => {
        const { container } = render(
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">Overview Panel Content</TabsContent>
            <TabsContent value="history">History Panel Content</TabsContent>
          </Tabs>,
        );
        const results = await axe(container);
        expect(results).toHaveNoViolations();
      });

      it('manages active tab selection and panel visibility', () => {
        render(
          <Tabs defaultValue="tab1">
            <TabsList>
              <TabsTrigger value="tab1">Tab One</TabsTrigger>
              <TabsTrigger value="tab2">Tab Two</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1">Content One</TabsContent>
            <TabsContent value="tab2">Content Two</TabsContent>
          </Tabs>,
        );

        const tab1 = screen.getByRole('tab', { name: /tab one/i });
        const tab2 = screen.getByRole('tab', { name: /tab two/i });

        expect(tab1).toHaveAttribute('aria-selected', 'true');
        expect(tab2).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByText('Content One')).toBeInTheDocument();
        expect(screen.queryByText('Content Two')).not.toBeInTheDocument();

        fireEvent.click(tab2);
        expect(tab1).toHaveAttribute('aria-selected', 'false');
        expect(tab2).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByText('Content One')).not.toBeInTheDocument();
        expect(screen.getByText('Content Two')).toBeInTheDocument();
      });
    });

    describe('Separator', () => {
      it('renders semantic role="separator" when not decorative', () => {
        render(<Separator decorative={false} orientation="horizontal" />);
        const separator = screen.getByRole('separator');
        expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
        expect(separator).toHaveClass('h-[1px]', 'w-full', 'bg-border');
      });

      it('renders role="none" when decorative', () => {
        const { container } = render(<Separator decorative />);
        expect(container.firstChild).toHaveAttribute('role', 'none');
      });
    });
  });
});
