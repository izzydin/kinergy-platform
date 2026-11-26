import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../app/providers/notification-provider';
import { knowledgeApi } from '../api/knowledge.api';
import { knowledgeQueryKeys } from '../api/knowledge-query-keys';
import type { UpdateDocumentMetadataRequest } from '../types/knowledge-contract.types';

export function useDeleteKnowledgeDocument() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (documentId: string) => knowledgeApi.deleteDocument(documentId),
    onSuccess: (_data, documentId) => {
      notification.success('Documento eliminado correctamente.');
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.detail(documentId) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al eliminar el documento.');
    },
  });
}

export function useRestoreKnowledgeDocument() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (documentId: string) => knowledgeApi.restoreDocument(documentId),
    onSuccess: (restored) => {
      notification.success('Documento restaurado correctamente.');
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.detail(restored.id) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.ingestion(restored.id) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al restaurar el documento.');
    },
  });
}

export function useReprocessKnowledgeDocument() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (documentId: string) => knowledgeApi.reprocessDocument(documentId),
    onSuccess: (_data, documentId) => {
      notification.success('Proceso de reindexación iniciado.');
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.detail(documentId) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.ingestion(documentId) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al reindexar el documento.');
    },
  });
}

export function useRetryDocumentIngestion() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (documentId: string) => knowledgeApi.retryIngestion(documentId),
    onSuccess: (_data, documentId) => {
      notification.success('Reintento de indexación iniciado.');
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.detail(documentId) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.ingestion(documentId) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al reintentar la indexación.');
    },
  });
}

export function useRetryVersionIngestion() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ documentId, versionId }: { documentId: string; versionId: string }) =>
      knowledgeApi.retryVersionIngestion(documentId, versionId),
    onSuccess: (_data, variables) => {
      notification.success('Reintento de versión iniciado.');
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.detail(variables.documentId),
      });
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.ingestion(variables.documentId),
      });
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.versionIngestion(variables.documentId, variables.versionId),
      });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al reintentar la indexación de la versión.');
    },
  });
}

export function useCancelDocumentIngestion() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ documentId, reason }: { documentId: string; reason?: string }) =>
      knowledgeApi.cancelIngestion(documentId, { reason }),
    onSuccess: (_data, variables) => {
      notification.success('Indexación cancelada correctamente.');
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.detail(variables.documentId),
      });
      void queryClient.invalidateQueries({
        queryKey: knowledgeQueryKeys.ingestion(variables.documentId),
      });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al cancelar la indexación.');
    },
  });
}

export function useUpdateDocumentMetadata() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({
      documentId,
      body,
    }: {
      documentId: string;
      body: UpdateDocumentMetadataRequest;
    }) => knowledgeApi.updateMetadata(documentId, body),
    onSuccess: (updated) => {
      notification.success('Metadatos actualizados correctamente.');
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.detail(updated.id) });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: knowledgeQueryKeys.all });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Error al actualizar los metadatos.');
    },
  });
}
