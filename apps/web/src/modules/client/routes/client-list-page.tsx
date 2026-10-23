import React, { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button } from '@kinergy-platform/ui';
import { PlusCircle } from 'lucide-react';
import { CrudListLayout, CrudListHeader } from '../../../shared/crud';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { HasPermission } from '../../../app/routes/permission-guard';
import { useClientFilters } from '../hooks/use-client-filters';
import { useClientList } from '../hooks/use-client-queries';
import { ClientTableToolbar } from '../components/client-table-toolbar';
import { ClientListTable } from '../components/client-list-table';

export interface ClientListPageProps {
  onCreateClient?: () => void;
}

export const ClientListPage: React.FC<ClientListPageProps> = ({ onCreateClient }) => {
  const auth = useAuth();
  const navigate = useNavigate();

  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('client:read')
      : auth.currentUser?.permissions?.some(
          (p) => p === 'client:read' || p === 'clients.read' || p === '*',
        ),
  );

  const {
    params,
    q,
    page,
    limit,
    sortState,
    filters,
    isFiltered,
    setSearch,
    setPage,
    setLimit,
    handleSortingChange,
    setStatus,
    resetFilters,
  } = useClientFilters();

  const { data, isLoading, isFetching, isError, error, refetch } = useClientList(params, {
    enabled: canRead,
  });

  // Synchronize pagination if filter changes reduce totalPages below current page
  useEffect(() => {
    if (data && data.totalPages > 0 && page > data.totalPages) {
      setPage(data.totalPages);
    }
  }, [data, page, setPage]);

  const handleCreate = useCallback(() => {
    if (onCreateClient) {
      onCreateClient();
    } else {
      navigate('/clients/new');
    }
  }, [onCreateClient, navigate]);

  const toolbar = useMemo(
    () => (
      <ClientTableToolbar
        search={q}
        status={filters.status}
        isFiltered={isFiltered}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onResetFilters={resetFilters}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        onCreateClick={handleCreate}
      />
    ),
    [
      q,
      filters.status,
      isFiltered,
      setSearch,
      setStatus,
      resetFilters,
      refetch,
      isFetching,
      handleCreate,
    ],
  );

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'client:read' to view client directory." />
    );
  }

  return (
    <CrudListLayout
      header={
        <CrudListHeader
          title="Clients"
          description="Search, filter, and manage client profiles and clinical records across facilities."
          badge={<Badge variant="outline">Directory</Badge>}
          action={
            <HasPermission name="client:write">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleCreate}
                className="gap-1.5"
                data-testid="header-create-client-button"
              >
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                <span>Create Client</span>
              </Button>
            </HasPermission>
          }
        />
      }
    >
      <ClientListTable
        clients={data?.items ?? []}
        totalCount={data?.total ?? 0}
        page={page}
        pageSize={limit}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        sorting={sortState}
        onSortingChange={handleSortingChange}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        errorMessage={error instanceof Error ? error.message : undefined}
        onRetry={() => refetch()}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        toolbar={toolbar}
        onCreateClick={handleCreate}
      />
    </CrudListLayout>
  );
};
