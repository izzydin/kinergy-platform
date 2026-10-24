import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Archive, ArchiveRestore, AlertCircle, Info } from 'lucide-react';
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
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const displayName =
    client.fullName || `${client.firstName} ${client.lastName}`.trim() || client.referenceNumber;
  const isArchived = client.status === 'ARCHIVED';

  const handleEditClick = () => {
    setFeedbackNotice('Client profile editing will be implemented in Milestone 3.3.');
  };

  const handleArchiveToggleClick = () => {
    setFeedbackNotice(
      isArchived
        ? 'Client profile restoration will be implemented in Milestone 3.4.'
        : 'Client profile archiving will be implemented in Milestone 3.4.',
    );
  };

  return (
    <div className="space-y-4">
      {/* Informational Feedback Notice if an action belonging to subsequent milestones is triggered */}
      {feedbackNotice && (
        <Alert
          variant="default"
          className="bg-indigo-50/80 border-indigo-200 text-indigo-900 flex items-start gap-3"
          role="status"
        >
          <Info className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <AlertTitle className="text-xs font-semibold text-indigo-950">
              Planned Capability
            </AlertTitle>
            <AlertDescription className="text-xs text-indigo-800 mt-0.5">
              {feedbackNotice}
            </AlertDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFeedbackNotice(null)}
            className="h-6 px-2 text-xs text-indigo-600 hover:text-indigo-950 hover:bg-indigo-100"
            aria-label="Dismiss notice"
          >
            Dismiss
          </Button>
        </Alert>
      )}

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
            memberships, and new appointment scheduling may be restricted.
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
                  onClick={handleEditClick}
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
                  onClick={handleArchiveToggleClick}
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
    </div>
  );
};
