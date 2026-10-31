import React, { useState } from 'react';
import { Mail, Phone, User, Calendar, Shield, Clock, Hash, Layers, Link2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@kinergy-platform/ui';
import { useAuth } from '../../../app/providers/auth-provider';
import { ClientLinkIdentityDialog } from './client-link-identity-dialog';
import type { ClientModel } from '../types/client.types';

export interface ClientDetailsCardProps {
  client: ClientModel;
}

export const ClientDetailsCard: React.FC<ClientDetailsCardProps> = ({ client }) => {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const { hasPermission, hasRole } = useAuth();
  const canLink = hasPermission('client:write') || hasRole('ADMIN') || hasRole('STAFF');
  const isArchived = client.status === 'ARCHIVED';

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 1. Identification & Contact Information */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Personal & Contact Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                First Name
              </dt>
              <dd className="mt-1 font-medium text-foreground" data-testid="client-first-name">
                {client.firstName || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Last Name
              </dt>
              <dd className="mt-1 font-medium text-foreground" data-testid="client-last-name">
                {client.lastName || '—'}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Email Address
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {client.email ? (
                  <a
                    href={`mailto:${client.email}`}
                    className="font-medium text-primary hover:underline"
                    data-testid="client-email"
                  >
                    {client.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Phone Number
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {client.phone ? (
                  <a
                    href={`tel:${client.phone}`}
                    className="font-medium text-primary hover:underline"
                    data-testid="client-phone"
                  >
                    {client.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Identity Account Link
              </dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                {client.identityId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs text-primary bg-primary/10"
                      data-testid="client-identity-linked"
                    >
                      {client.identityId}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground italic">
                      (Permanent link • Unlinking unsupported)
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs text-muted-foreground italic"
                      data-testid="client-identity-unlinked"
                    >
                      Not linked to user account
                    </span>
                    {canLink && !isArchived && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsLinkDialogOpen(true)}
                        className="h-6 px-2 text-xs gap-1"
                        data-testid="link-identity-trigger-button"
                        aria-label="Link user account identity"
                      >
                        <Link2 className="h-3 w-3" aria-hidden="true" />
                        Link Identity
                      </Button>
                    )}
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 2. Record Governance & System Metadata */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Record Governance & Audit Metadata</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Reference ID
              </dt>
              <dd
                className="mt-1 font-mono text-xs font-semibold text-foreground"
                data-testid="client-ref-num"
              >
                {client.referenceNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Version
              </dt>
              <dd className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Hash className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <span>v{client.version}</span>
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Registration Date
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span data-testid="client-created-at">{formatDate(client.createdAt)}</span>
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Last Updated
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span data-testid="client-updated-at">{formatDate(client.updatedAt)}</span>
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                System Identifier
              </dt>
              <dd className="mt-1 font-mono text-xs text-muted-foreground select-all break-all">
                {client.id}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Link Identity Modal Dialog */}
      {canLink && (
        <ClientLinkIdentityDialog
          client={client}
          open={isLinkDialogOpen}
          onOpenChange={setIsLinkDialogOpen}
        />
      )}
    </div>
  );
};
