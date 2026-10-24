import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@kinergy-platform/ui';
import { CrudFormLayout, CrudFormHeader } from '../../../shared/crud';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { useRegisterClientMutation } from '../hooks/use-client-mutations';
import { ClientRegistrationForm } from '../components/client-registration-form';
import type { RegisterClientInputDTO, RegisterClientResponseDTO } from '../types/client.types';

export const ClientCreatePage: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();

  const canWrite = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('client:write')
      : auth.currentUser?.permissions?.some(
          (p) => p === 'client:write' || p === 'clients.write' || p === '*',
        ),
  );

  const registerMutation = useRegisterClientMutation();

  const handleSubmit = useCallback(
    async (payload: RegisterClientInputDTO): Promise<RegisterClientResponseDTO> => {
      return registerMutation.mutateAsync(payload);
    },
    [registerMutation],
  );

  const handleSuccess = useCallback(
    (newClient: RegisterClientResponseDTO) => {
      // Authoritatively navigate to the newly created client's profile ID
      navigate(`/clients/${newClient.id}`);
    },
    [navigate],
  );

  const handleCancel = useCallback(() => {
    navigate('/clients');
  }, [navigate]);

  if (!canWrite) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'client:write' to register new clients." />
    );
  }

  return (
    <CrudFormLayout
      maxWidth="2xl"
      header={
        <CrudFormHeader
          title="Register Client"
          description="Register a new client profile into the healthcare & wellness platform."
          badge={<Badge variant="outline">Registration</Badge>}
          backLink={{ href: '/clients', label: 'Back to Client Directory' }}
        />
      }
    >
      <div data-testid="client-create-page">
        <ClientRegistrationForm
          onSubmit={handleSubmit}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </CrudFormLayout>
  );
};
