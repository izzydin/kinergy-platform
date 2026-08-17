import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TreatmentHistoryList } from '../components/treatment-history-list';

export const ClientTreatmentHistoryPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();

  if (!clientId) {
    return (
      <div className="p-6 text-sm text-slate-500">No client ID provided in route parameters.</div>
    );
  }

  const handleSelectSession = (sessionId: string) => {
    navigate(`/kinesiology/sessions/${sessionId}`);
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <TreatmentHistoryList clientId={clientId} onSelectSession={handleSelectSession} />
    </div>
  );
};
