import React, { Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { SuspenseFallback, lazyWithRetry } from '../../../app/routes/lazy-loading';
import { IntelligenceLayout } from '../components/intelligence-layout';
import { IntelligenceKnowledgeGuard } from './intelligence-knowledge-guard';
import { registerIntelligenceNavigation } from '../navigation/intelligence-navigation.config';

// Lazy-loaded route components with transient network failure retry
const ChatPage = lazyWithRetry(() =>
  import('../assistant/routes/chat-page').then((m) => ({ default: m.ChatPage })),
);
const KnowledgePage = lazyWithRetry(() =>
  import('../knowledge/routes/knowledge-page').then((m) => ({ default: m.KnowledgePage })),
);
const DocumentDetailPage = lazyWithRetry(() =>
  import('../knowledge/routes/document-detail-page').then((m) => ({
    default: m.DocumentDetailPage,
  })),
);

/**
 * Intelligence Feature Module SubRouter.
 *
 * Route Hierarchy:
 * - /intelligence -> Redirects to /intelligence/chat
 * - /intelligence/chat -> AI Assistant workspace (all authenticated roles)
 * - /intelligence/chat/:conversationId -> AI Assistant with active thread
 * - /intelligence/knowledge -> Knowledge Center (guarded by IntelligenceKnowledgeGuard)
 * - /intelligence/knowledge/documents/:documentId -> Document version details (guarded)
 * - /intelligence/* -> NotFoundView (404)
 */
export const IntelligenceSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Cargando Kynergy Intelligence..." />}>
    <Routes>
      <Route element={<IntelligenceLayout />}>
        {/* Default route redirect to Assistant */}
        <Route index element={<Navigate to="chat" replace />} />

        {/* AI Assistant Routes (Available to all authenticated staff) */}
        <Route path="chat" element={<ChatPage />} />
        <Route path="chat/:conversationId" element={<ChatPage />} />

        {/* Knowledge Center Routes (Role-guarded: Admin, SuperAdmin, Owner, EnergyManager) */}
        <Route element={<IntelligenceKnowledgeGuard />}>
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="knowledge/documents/:documentId" element={<DocumentDetailPage />} />
        </Route>

        {/* Fallback for unknown sub-routes */}
        <Route path="*" element={<NotFoundView message="Vista de Inteligencia no encontrada." />} />
      </Route>
    </Routes>
  </Suspense>
);

// Register navigation items with central navigationRegistry
registerIntelligenceNavigation();

/**
 * Registers the Intelligence module's routing contract with the central moduleRegistry.
 */
moduleRegistry.register({
  id: 'intelligence',
  prefix: '/intelligence',
  title: 'Kynergy Intelligence',
  isProtected: true,
  component: IntelligenceSubRouter,
});
