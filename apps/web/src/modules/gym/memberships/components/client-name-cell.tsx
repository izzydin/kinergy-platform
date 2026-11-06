import React, { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { useClientDetail } from '../../../client/hooks/use-client-queries';

export interface ClientNameCellProps {
  clientId: string;
  clientName?: string;
}

const ClientNameFetcher: React.FC<{ clientId: string; fallback?: string }> = ({
  clientId,
  fallback,
}) => {
  const { data: client, isLoading } = useClientDetail(clientId, {
    enabled: Boolean(!fallback && clientId),
  });

  if (fallback) {
    return (
      <span className="font-medium text-xs text-foreground" data-testid={`client-name-${clientId}`}>
        {fallback}
      </span>
    );
  }

  if (isLoading) {
    return <span className="text-muted-foreground text-xs animate-pulse">Loading...</span>;
  }

  const name =
    client?.fullName ||
    (client?.firstName ? `${client.firstName} ${client.lastName}`.trim() : null);

  return (
    <span className="font-medium text-xs text-foreground" data-testid={`client-name-${clientId}`}>
      {name || '—'}
    </span>
  );
};

export const ClientNameCell: React.FC<ClientNameCellProps> = ({ clientId, clientName }) => {
  const queryClient = useContext(QueryClientContext);

  if (clientName) {
    return (
      <span className="font-medium text-xs text-foreground" data-testid={`client-name-${clientId}`}>
        {clientName}
      </span>
    );
  }

  if (!queryClient) {
    return (
      <span className="font-medium text-xs text-foreground" data-testid={`client-name-${clientId}`}>
        {clientName || '—'}
      </span>
    );
  }

  return <ClientNameFetcher clientId={clientId} fallback={clientName} />;
};
