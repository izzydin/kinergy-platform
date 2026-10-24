import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Archive, ArchiveRestore, AlertCircle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@kinergy-platform/ui';
import { ClientStatusBadge } from './client-status-badge';
import { ClientEditDialog } from './client-edit-dialog';
import { ClientArchiveDialog } from './client-archive-dialog';
import { ClientRestoreDialog } from './client-restore-dialog';
import type { ClientModel } from '../types/client.types';

export interface ClientProfileHeaderProps {
  client: ClientModel;
  canEdit?: boolean;
  canArchive?: boolean;
  activeTab?: 'overview' | 'timeline' | 'treatments';
}

export const ClientProfileHeader: React.FC<ClientProfileHeaderProps> = ({
  client,
  canEdit = false,
  canArchive = false,
  activeTab = 'overview',
}) => {
  const navigate = useNavigate();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);

  const displayName =
    client.fullName || `${client.firstName} ${client.lastName}`.trim() || client.referenceNumber;
  const isArchived = client.status === 'ARCHIVED';

  return (
    <div className="space-y-4">
      {/* Archived Status Warning Banner */}
      {isArchived && (
        <Alert
          variant="destructive"
          className="bg-amber-50/90 border-amber-300 text-amber-900"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 text-amber-700" aria-hidden="true" />
          <AlertTitle className="text-sm font-semibold text-amber-950">
            Archived Client Profile
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800 mt-1">
            This client record is currently archived. Active service delivery, recurring
            memberships, and new appointment scheduling are restricted. To make changes, restore the
            profile.
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Header Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-2">
              {/* Back Link & Breadcrumbs */}
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/clients')}
                  className="h-6 px-1.5 text-xs text-slate-500 hover:text-indigo-600 gap-1"
                  aria-label="Back to client directory"
                >
                  <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                  <span>Clients Directory</span>
                </Button>
                <span>/</span>
                <span className="font-mono text-slate-700">{client.referenceNumber}</span>
              </div>

              {/* Title & Status */}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{displayName}</h1>
                <Badge variant="outline" className="font-mono text-xs">
                  {client.referenceNumber}
                </Badge>
                <ClientStatusBadge status={client.status} />
              </div>

              <p className="text-xs text-slate-500 font-mono">
                System Identifier: <span className="select-all">{client.id}</span>
              </p>
            </div>

            {/* Lifecycle Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0">
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                  disabled={isArchived}
                  title={isArchived ? 'Archived client profiles cannot be edited' : undefined}
                  className="gap-1.5 text-xs"
                  aria-label="Edit client profile"
                  data-testid="edit-client-button"
                >
                  <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit Profile</span>
                </Button>
              )}

              {canArchive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (isArchived ? setIsRestoreOpen(true) : setIsArchiveOpen(true))}
                  className="gap-1.5 text-xs"
                  aria-label={isArchived ? 'Restore client profile' : 'Archive client profile'}
                  data-testid="archive-toggle-button"
                >
                  {isArchived ? (
                    <>
                      <ArchiveRestore className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Restore Client</span>
                    </>
                  ) : (
                    <>
                      <Archive className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                      <span>Archive Client</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Profile Sub-route Navigation Tabs */}
          <div className="flex border-b border-slate-200 mt-6 -mb-6 space-x-6 text-sm font-medium">
            <Link
              to={`/clients/${client.id}`}
              className={`pb-3 transition-colors ${
                activeTab === 'overview'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
              }`}
            >
              Overview
            </Link>
            <Link
              to={`/clients/${client.id}/timeline`}
              className={`pb-3 transition-colors ${
                activeTab === 'timeline'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
              }`}
            >
              Activity Timeline
            </Link>
            <Link
              to={`/clients/${client.id}/treatments`}
              className={`pb-3 transition-colors ${
                activeTab === 'treatments'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
              }`}
            >
              Treatment History
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Edit Profile Modal Dialog */}
      {canEdit && (
        <ClientEditDialog client={client} open={isEditOpen} onOpenChange={setIsEditOpen} />
      )}

      {/* Archive Confirmation Dialog */}
      {canArchive && (
        <ClientArchiveDialog client={client} open={isArchiveOpen} onOpenChange={setIsArchiveOpen} />
      )}

      {/* Restore Confirmation Dialog */}
      {canArchive && (
        <ClientRestoreDialog client={client} open={isRestoreOpen} onOpenChange={setIsRestoreOpen} />
      )}
    </div>
  );
};
