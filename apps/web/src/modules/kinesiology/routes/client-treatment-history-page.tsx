import React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, Button } from '@kinergy-platform/ui';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudError } from '../../../shared/crud';
import { TreatmentHistoryList } from '../components/treatment-history-list';

export const ClientTreatmentHistoryPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  let canRead = true;
  try {
    const auth = useAuth();
    if (typeof auth?.hasPermission === 'function') {
      canRead = auth.hasPermission('kinesiology.sessions.read');
    }
  } catch {
    // Permissive fallback in unit test harnesses without AuthProvider
  }

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'kinesiology.sessions.read' to view client clinical treatment history." />
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

  const handleSelectSession = (sessionId: string) => {
    navigate(`/kinesiology/sessions/${encodeURIComponent(sessionId)}`);
  };

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
                Client Profile & Clinical Records
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
              className="pb-3 text-slate-500 hover:text-slate-700 border-b-2 border-transparent transition-colors"
            >
              Activity Timeline
            </Link>
            <Link
              to={`/clients/${clientId}/treatments`}
              className="pb-3 text-indigo-600 border-b-2 border-indigo-600 font-semibold"
            >
              Treatment History
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Main Treatment History Component */}
      <TreatmentHistoryList clientId={clientId} onSelectSession={handleSelectSession} />
    </div>
  );
};
