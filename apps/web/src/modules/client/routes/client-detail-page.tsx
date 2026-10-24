import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@kinergy-platform/ui';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudError, CrudLoading } from '../../../shared/crud';
import { useClientDetail } from '../hooks/use-client-queries';
import { ClientProfileHeader } from '../components/client-profile-header';
import { ClientDetailsCard } from '../components/client-details-card';
import { ClientRelatedFeaturesCard } from '../components/client-related-features-card';
import { ClientTimelineList } from '../components/client-timeline-list';

export const ClientDetailPage: React.FC = () => {
  const { clientId = '' } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const checkPermission = (perm: string) => {
    if (typeof auth.hasPermission === 'function') {
      return auth.hasPermission(perm);
    }
    const colonPrefix = perm.split(':')[0] ?? perm;
    const dotPrefix = perm.split('.')[0] ?? perm;
    return (
      auth.currentUser?.permissions?.some(
        (p) => p === perm || p === '*' || p.startsWith(colonPrefix) || p.startsWith(dotPrefix),
      ) ?? false
    );
  };

  const canRead = checkPermission('client:read');
  const canWrite = checkPermission('client:write');
  const canReadKinesiology = checkPermission('kinesiology.sessions.read');
  const canReadMemberships = checkPermission('memberships.read');
  const canReadSales = checkPermission('sales.read');

  const {
    data: client,
    isLoading,
    isError,
    error,
    refetch,
  } = useClientDetail(clientId, { enabled: canRead });

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'client:read' to view client profile." />
    );
  }

  if (!clientId || clientId.trim().length === 0) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <CrudError
          title="Invalid Client Identifier"
          error="No valid client ID was supplied in the route path."
          secondaryAction={
            <Button variant="outline" size="sm" onClick={() => navigate('/clients')}>
              Back to Directory
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <CrudLoading variant="detail" />
      </div>
    );
  }

  if (isError) {
    const isNotFound =
      (error as { status?: number })?.status === 404 ||
      (error as { statusCode?: number })?.statusCode === 404 ||
      error?.message?.toLowerCase().includes('not found');

    return (
      <div className="p-6 max-w-6xl mx-auto">
        <CrudError
          title={isNotFound ? 'Client Not Found' : 'Failed to Load Client Profile'}
          error={
            isNotFound
              ? `The client profile for ID "${clientId}" could not be located or has been deleted.`
              : error?.message ||
                'An unexpected error occurred while communicating with the Client API.'
          }
          onRetry={isNotFound ? undefined : () => void refetch()}
          secondaryAction={
            <Button variant="outline" size="sm" onClick={() => navigate('/clients')}>
              Back to Directory
            </Button>
          }
        />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <CrudError
          title="Client Not Found"
          error={`The client profile for ID "${clientId}" could not be located or has been deleted.`}
          secondaryAction={
            <Button variant="outline" size="sm" onClick={() => navigate('/clients')}>
              Back to Directory
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* 1. Header with Breadcrumbs, Badges, and Permission-Aware Actions */}
      <ClientProfileHeader
        client={client}
        canEdit={canWrite}
        canArchive={canWrite}
        activeTab="overview"
      />

      {/* 2. Supported Personal, Contact, and Audit Metadata Fields */}
      <ClientDetailsCard client={client} />

      {/* 3. Cross-Domain Operational Workflows (Treatments, Memberships, Commercial History) */}
      <ClientRelatedFeaturesCard
        clientId={client.id}
        canReadKinesiology={canReadKinesiology}
        canReadMemberships={canReadMemberships}
        canReadSales={canReadSales}
      />

      {/* 4. Longitudinal Activity Timeline (Independent Query & Resilience Boundary) */}
      <ClientTimelineList clientId={client.id} />
    </div>
  );
};
