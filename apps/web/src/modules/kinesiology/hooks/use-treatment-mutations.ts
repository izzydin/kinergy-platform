import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kinesiologyApi } from '../api/kinesiology-api';
import { useNotification } from '../../../app/providers/notification-provider';
import { kinesiologyQueryKeys } from './use-treatment-session';
import {
  AssignTherapistPayload,
  CancelSessionPayload,
  CreateSessionPayload,
  TreatmentSessionModel,
  UpdateNotesPayload,
} from '../types';

export function useTreatmentMutations(sessionId?: string) {
  const queryClient = useQueryClient();
  const { success, error } = useNotification();

  const createSessionMutation = useMutation<TreatmentSessionModel, Error, CreateSessionPayload>({
    mutationFn: (payload) => kinesiologyApi.createSession(payload),
    onSuccess: (data) => {
      success('Treatment session created successfully');
      queryClient.invalidateQueries({ queryKey: kinesiologyQueryKeys.sessions() });
      if (data.clientId) {
        queryClient.invalidateQueries({
          queryKey: kinesiologyQueryKeys.history(data.clientId),
        });
      }
    },
    onError: (err) => {
      error(err);
    },
  });

  const startSessionMutation = useMutation<TreatmentSessionModel, Error, void>({
    mutationFn: () => {
      if (!sessionId) throw new Error('Session ID required');
      return kinesiologyApi.startSession(sessionId);
    },
    onSuccess: (data) => {
      success('Treatment session started');
      queryClient.setQueryData(kinesiologyQueryKeys.session(sessionId!), data);
      queryClient.invalidateQueries({ queryKey: kinesiologyQueryKeys.sessions() });
    },
    onError: (err) => {
      error(err);
    },
  });

  const assignTherapistMutation = useMutation<TreatmentSessionModel, Error, AssignTherapistPayload>(
    {
      mutationFn: (payload) => {
        if (!sessionId) throw new Error('Session ID required');
        return kinesiologyApi.assignTherapist(sessionId, payload);
      },
      onSuccess: (data) => {
        success('Therapist assigned successfully');
        queryClient.setQueryData(kinesiologyQueryKeys.session(sessionId!), data);
        queryClient.invalidateQueries({ queryKey: kinesiologyQueryKeys.sessions() });
      },
      onError: (err) => {
        error(err);
      },
    },
  );

  const updateNotesMutation = useMutation<TreatmentSessionModel, Error, UpdateNotesPayload>({
    mutationFn: (payload) => {
      if (!sessionId) throw new Error('Session ID required');
      return kinesiologyApi.updateNotes(sessionId, payload);
    },
    onSuccess: (data) => {
      success('Clinical notes saved successfully');
      queryClient.setQueryData(kinesiologyQueryKeys.session(sessionId!), data);
    },
    onError: (err) => {
      error(err);
    },
  });

  const completeSessionMutation = useMutation<TreatmentSessionModel, Error, void>({
    mutationFn: () => {
      if (!sessionId) throw new Error('Session ID required');
      return kinesiologyApi.completeSession(sessionId);
    },
    onSuccess: (data) => {
      success('Treatment session signed & completed');
      queryClient.setQueryData(kinesiologyQueryKeys.session(sessionId!), data);
      queryClient.invalidateQueries({ queryKey: kinesiologyQueryKeys.sessions() });
      if (data.clientId) {
        queryClient.invalidateQueries({
          queryKey: kinesiologyQueryKeys.history(data.clientId),
        });
      }
    },
    onError: (err) => {
      error(err);
    },
  });

  const cancelSessionMutation = useMutation<TreatmentSessionModel, Error, CancelSessionPayload>({
    mutationFn: (payload) => {
      if (!sessionId) throw new Error('Session ID required');
      return kinesiologyApi.cancelSession(sessionId, payload);
    },
    onSuccess: (data) => {
      success('Treatment session cancelled');
      queryClient.setQueryData(kinesiologyQueryKeys.session(sessionId!), data);
      queryClient.invalidateQueries({ queryKey: kinesiologyQueryKeys.sessions() });
    },
    onError: (err) => {
      error(err);
    },
  });

  return {
    createSession: createSessionMutation,
    startSession: startSessionMutation,
    assignTherapist: assignTherapistMutation,
    updateNotes: updateNotesMutation,
    completeSession: completeSessionMutation,
    cancelSession: cancelSessionMutation,
  };
}
