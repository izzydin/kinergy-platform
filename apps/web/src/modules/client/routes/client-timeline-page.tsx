import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@kinergy-platform/ui';
import { ClientTimelineList } from '../components/client-timeline-list';

export const ClientTimelinePage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();

  if (!clientId) {
    return (
      <div className="p-6 text-sm text-slate-500">No client ID provided in route parameters.</div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Client Context Profile Header */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-xs text-slate-500">
                <Link to="/clients" className="hover:text-indigo-600">
                  Clients Directory
                </Link>
                <span>/</span>
                <span className="font-mono text-slate-700">{clientId}</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                Client Profile & Longitudinal Timeline
              </h1>
              <p className="text-xs text-slate-500 font-mono">Client Reference ID: {clientId}</p>
            </div>
          </div>

          {/* Profile Navigation Tabs */}
          <div className="flex border-b border-slate-200 mt-6 -mb-6 space-x-6 text-sm font-medium">
            <Link
              to={`/clients/${clientId}`}
              className="pb-3 text-slate-500 hover:text-slate-700 border-b-2 border-transparent transition-colors"
            >
              Overview
            </Link>
            <Link
              to={`/clients/${clientId}/timeline`}
              className="pb-3 text-indigo-600 border-b-2 border-indigo-600 font-semibold"
            >
              Activity Timeline
            </Link>
            <Link
              to={`/clients/${clientId}/treatments`}
              className="pb-3 text-slate-500 hover:text-slate-700 border-b-2 border-transparent transition-colors"
            >
              Treatment History
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Main Timeline Stream */}
      <ClientTimelineList clientId={clientId} />
    </div>
  );
};
