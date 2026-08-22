import React from 'react';
import { useParams } from 'react-router-dom';
import { useMembershipDetail } from '../hooks/use-memberships';

export const MembershipDetailPage: React.FC = () => {
  const { membershipId = '' } = useParams<{ membershipId: string }>();
  const { data: membership, isLoading, isError, error } = useMembershipDetail(membershipId);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading membership details...</div>;
  }

  if (isError || !membership) {
    return (
      <div className="p-6 text-sm text-red-500">
        Error loading membership: {(error as Error)?.message ?? 'Not found'}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="membership-detail-page">
      <h1 className="text-2xl font-bold">Membership Agreement</h1>
      <p className="text-sm font-mono text-gray-500">ID: {membership.id}</p>
      <div className="text-sm">
        Client ID: <span className="font-mono">{membership.clientId}</span>
      </div>
      <div className="text-sm">
        Plan ID: <span className="font-mono">{membership.planId}</span>
      </div>
      <div className="text-sm">
        Status: <span className="font-semibold">{membership.status}</span>
      </div>
      <div className="text-sm">
        Period: {membership.period.startDate} to {membership.period.endDate} (
        {membership.period.durationDays} days)
      </div>
    </div>
  );
};
