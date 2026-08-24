import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useNotification } from '../../../../app/providers/notification-provider';
import { CrudListHeader, CrudListLayout } from '../../../../shared/crud';
import { ArchivePlanDialog } from '../components/archive-plan-dialog';
import { PlanFilterBar } from '../components/plan-filter-bar';
import { PlanFormDialog } from '../components/plan-form-dialog';
import { PlanListTable } from '../components/plan-list-table';
import { UpdatePricingDialog } from '../components/update-pricing-dialog';
import { usePlanFilters } from '../hooks/use-plan-filters';
import { usePlanMutations, usePlans } from '../hooks/use-plans';
import type { MembershipPlanVM } from '../types';

export const PlansListPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const { success, error: notifyError } = useNotification();
  const canManagePlans =
    hasPermission('plans.create') ||
    hasPermission('plans.update') ||
    hasRole('ADMIN') ||
    hasRole('OWNER');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pricingPlan, setPricingPlan] = useState<MembershipPlanVM | null>(null);
  const [archivingPlan, setArchivingPlan] = useState<MembershipPlanVM | null>(null);

  const {
    params,
    search,
    status,
    activeOnly,
    isFiltered,
    sortState,
    setSearch,
    setStatus,
    setActiveOnly,
    setPage,
    setLimit,
    setSort,
    resetFilters,
  } = usePlanFilters();

  const { data, isLoading, isError, error, refetch } = usePlans(params);
  const { publishPlan, archivePlan } = usePlanMutations();

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

  const handlePublish = (plan: MembershipPlanVM) => {
    publishPlan.mutate(plan.id, {
      onSuccess: (published) => {
        success('Plan Published', `Plan "${published.name}" is now ACTIVE for commercial sale.`);
      },
      onError: (err) => {
        notifyError(err, 'Failed to publish plan');
      },
    });
  };

  return (
    <CrudListLayout
      header={
        <CrudListHeader
          title="Membership Plans"
          description="Commercial membership packages, access duration rules, visit quotas, and pricing catalog."
        />
      }
      toolbar={
        <PlanFilterBar
          search={search}
          status={status}
          activeOnly={activeOnly}
          isFiltered={isFiltered}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onActiveOnlyChange={setActiveOnly}
          onResetFilters={resetFilters}
          onCreateClick={() => setIsCreateOpen(true)}
          canCreate={canManagePlans}
        />
      }
    >
      <div data-testid="plans-list-page">
        <PlanListTable
          plans={items}
          totalCount={total}
          page={page}
          pageSize={params.limit ?? 10}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
          sorting={sorting}
          onSortingChange={handleSortingChange}
          isLoading={isLoading}
          isError={isError}
          errorMessage={error?.message || 'Failed to load membership plans from server.'}
          onRetry={() => void refetch()}
          isFiltered={isFiltered}
          onResetFilters={resetFilters}
          onViewDetails={(plan) => navigate(`/gym/plans/${encodeURIComponent(plan.id)}`)}
          onEditPricing={(plan) => setPricingPlan(plan)}
          onPublish={handlePublish}
          onArchive={(plan) => setArchivingPlan(plan)}
          isPublishing={publishPlan.isPending}
          isArchiving={archivePlan.isPending}
          canManagePlans={canManagePlans}
        />

        {/* Create Plan Dialog */}
        <PlanFormDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

        {/* Update Pricing Dialog */}
        <UpdatePricingDialog
          plan={pricingPlan}
          open={Boolean(pricingPlan)}
          onOpenChange={(open) => !open && setPricingPlan(null)}
        />

        {/* Archive Plan Dialog */}
        <ArchivePlanDialog
          plan={archivingPlan}
          open={Boolean(archivingPlan)}
          onOpenChange={(open) => !open && setArchivingPlan(null)}
        />
      </div>
    </CrudListLayout>
  );
};

PlansListPage.displayName = 'PlansListPage';
