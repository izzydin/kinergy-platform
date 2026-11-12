import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
} from '@kinergy-platform/ui';
import { UserPlus, CalendarPlus, ShoppingCart, PackagePlus, QrCode, Zap } from 'lucide-react';
import { useDashboardAccess } from '../api/operational-dashboard-queries';

export interface OperationalQuickActionItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly to: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly enabled: boolean;
}

export interface DashboardQuickActionsProps {
  /** Compact mode renders header-bar buttons; panel mode renders a structured card section */
  variant?: 'compact' | 'panel';
}

/**
 * Role- and permission-aware Quick Actions for daily Kinergy business workflows.
 * Every action navigates to a real, implemented application route.
 */
export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  variant = 'panel',
}) => {
  const {
    roleProfile,
    canRegisterClient,
    canCreateAppointment,
    canCreateSale,
    canReceiveInventory,
    canRegisterCheckIn,
  } = useDashboardAccess();

  const allActions: OperationalQuickActionItem[] = [
    {
      id: 'register-check-in',
      label: 'Register Gym Check-in',
      description: 'Verify membership eligibility and record client arrival',
      to: '/gym/attendance',
      icon: QrCode,
      enabled: canRegisterCheckIn,
    },
    {
      id: 'create-appointment',
      label: 'Create Appointment',
      description: 'Book a clinic evaluation, treatment, or training session',
      to: '/scheduling/book',
      icon: CalendarPlus,
      enabled: canCreateAppointment,
    },
    {
      id: 'create-sale',
      label: 'Create Sale',
      description: 'Open POS checkout for retail products or services',
      to: '/sales/new',
      icon: ShoppingCart,
      enabled: canCreateSale,
    },
    {
      id: 'register-client',
      label: 'Register Client',
      description: 'Create a new client profile and contact record',
      to: '/clients/new',
      icon: UserPlus,
      enabled: canRegisterClient,
    },
    {
      id: 'receive-inventory',
      label: 'Receive Inventory',
      description: 'Inspect catalog stock levels and record stock receipts',
      to: '/resources/inventory',
      icon: PackagePlus,
      enabled: canReceiveInventory,
    },
  ];

  // Prioritize actions according to the user's operational role profile
  const priorityOrderByRole: Record<string, string[]> = {
    INVENTORY: [
      'receive-inventory',
      'create-sale',
      'register-check-in',
      'create-appointment',
      'register-client',
    ],
    TRAINER: [
      'create-appointment',
      'register-check-in',
      'register-client',
      'create-sale',
      'receive-inventory',
    ],
    RECEPTIONIST: [
      'register-check-in',
      'create-appointment',
      'create-sale',
      'register-client',
      'receive-inventory',
    ],
    EXECUTIVE: [
      'register-check-in',
      'create-appointment',
      'create-sale',
      'register-client',
      'receive-inventory',
    ],
  };

  const priorityList = priorityOrderByRole[roleProfile] ?? priorityOrderByRole.EXECUTIVE!;
  const permittedActions = allActions
    .filter((action) => action.enabled)
    .sort((a, b) => priorityList.indexOf(a.id) - priorityList.indexOf(b.id));

  if (permittedActions.length === 0) {
    return null;
  }

  if (variant === 'compact') {
    const primaryActions = permittedActions.slice(0, 3);
    return (
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="dashboard-quick-actions-compact"
      >
        {primaryActions.map((action, index) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.id}
              asChild
              variant={index === 0 ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
            >
              <Link to={action.to} data-testid={`quick-action-compact-${action.id}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{action.label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="border-border" data-testid="dashboard-quick-actions">
      <CardHeader className="pb-3 border-b border-border/60">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" aria-hidden="true" />
          <span>Quick Actions</span>
        </CardTitle>
        <CardDescription className="text-xs mt-0.5">
          Direct shortcuts to common front-desk, clinical, and inventory workflows
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {permittedActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.id}
                to={action.to}
                data-testid={`quick-action-${action.id}`}
                className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {action.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
