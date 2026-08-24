import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../app/providers/auth-provider';
import { CrudListHeader, CrudListLayout } from '../../../../shared/crud';
import { CancelMembershipDialog } from '../components/cancel-membership-dialog';
import { FreezeMembershipDialog } from '../components/freeze-membership-dialog';
import { MembershipFilterBar } from '../components/membership-filter-bar';
import { MembershipListTable } from '../components/membership-list-table';
import { RenewMembershipDialog } from '../components/renew-membership-dialog';
import { UnfreezeMembershipDialog } from '../components/unfreeze-membership-dialog';
import { useMembershipFilters } from '../hooks/use-membership-filters';
import { useMembershipMutations, useMemberships } from '../hooks/use-memberships';
import type { MembershipVM } from '../types';

export const MembershipsListPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const canManageMemberships =
    hasPermission('memberships.create') ||
    hasPermission('memberships.update') ||
    hasRole('ADMIN') ||
    hasRole('OWNER') ||
    hasRole('RECEPTIONIST');

  const [renewingMembership, setRenewingMembership] = useState<MembershipVM | null>(null);
  const [freezingMembership, setFreezingMembership] = useState<MembershipVM | null>(null);
  const [unfreezingMembership, setUnfreezingMembership] = useState<MembershipVM | null>(null);
  const [cancellingMembership, setCancellingMembership] = useState<MembershipVM | null>(null);

  const {
    params,
    search,
    status,
    planId,
    isFiltered,
    sortState,
    setSearch,
    setStatus,
    setPlanId,
    setPage,
    setLimit,
    setSort,
    resetFilters,
  } = useMembershipFilters();

  const { data, isLoading, isError, error, refetch } = useMemberships(params);
  const { renewMembership, freezeMembership, unfreezeMembership, cancelMembership } =
    useMembershipMutations();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;

  const sorting: SortingState = sortState ? [sortState] : [];

  const handleSortingChange: OnChangeFn<SortingState> = (updaterOrValue) => {
    const nextSorting =
      typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue;
    if (nextSorting.length === 0) {
      setSort(undefined);
    } else {
      const first = nextSorting[0];
      if (first) {
        setSort({ id: first.id, desc: first.desc });
      }
    }
  };

  return (
    <CrudListLayout
      header={
        <CrudListHeader
          title="Gym Memberships"
          description="Client membership agreements, subscription lifecycles, and facility access permissions."
        />
      }
      toolbar={
        <MembershipFilterBar
          search={search}
          status={status}
          planId={planId}
          isFiltered={isFiltered}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onPlanChange={setPlanId}
          onResetFilters={resetFilters}
          onCreateClick={() => navigate('/gym/memberships/new')}
          canCreate={canManageMemberships}
        />
      }
    >
      <div data-testid="memberships-list-page">
        <MembershipListTable
          memberships={items}
          totalCount={total}
          page={page}
          pageSize={params.limit ?? 10}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          isLoading={isLoading}
          isError={isError}
          errorMessage={error?.message || 'Failed to load memberships from server.'}
          onRetry={() => void refetch()}
          isFiltered={isFiltered}
          onResetFilters={resetFilters}
          onViewDetails={(m) => navigate(`/gym/memberships/${encodeURIComponent(m.id)}`)}
          onRenew={(m) => setRenewingMembership(m)}
          onFreeze={(m) => setFreezingMembership(m)}
          onUnfreeze={(m) => setUnfreezingMembership(m)}
          onCancel={(m) => setCancellingMembership(m)}
          isRenewing={renewMembership.isPending}
          isFreezing={freezeMembership.isPending}
          isUnfreezing={unfreezeMembership.isPending}
          isCancelling={cancelMembership.isPending}
          canManageMemberships={canManageMemberships}
        />

        {/* Lifecycle Dialog Modals */}
        <RenewMembershipDialog
          membership={renewingMembership}
          open={Boolean(renewingMembership)}
          onOpenChange={(open) => !open && setRenewingMembership(null)}
        />

        <FreezeMembershipDialog
          membership={freezingMembership}
          open={Boolean(freezingMembership)}
          onOpenChange={(open) => !open && setFreezingMembership(null)}
        />

        <UnfreezeMembershipDialog
          membership={unfreezingMembership}
          open={Boolean(unfreezingMembership)}
          onOpenChange={(open) => !open && setUnfreezingMembership(null)}
        />

        <CancelMembershipDialog
          membership={cancellingMembership}
          open={Boolean(cancellingMembership)}
          onOpenChange={(open) => !open && setCancellingMembership(null)}
        />
      </div>
    </CrudListLayout>
  );
};

MembershipsListPage.displayName = 'MembershipsListPage';
