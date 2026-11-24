import React, { useContext, useRef } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { QueryClient, QueryClientProvider, QueryClientContext } from '@tanstack/react-query';
import { IntelligencePageContainer } from '../../components/intelligence-page-container';
import { IntelligencePageHeader } from '../../components/intelligence-page-header';
import { ChatWorkspace } from '../components/chat-workspace';

/**
 * AI Assistant Chat Page.
 *
 * Mounts the conversational workspace inside the shared Intelligence layout.
 * Supports URL-driven conversation switching (/intelligence/chat and /intelligence/chat/:conversationId).
 * Automatically provides fallback query context if rendered standalone in unit tests.
 */
export const ChatPage: React.FC = () => {
  const existingQueryClient = useContext(QueryClientContext);
  const fallbackClientRef = useRef<QueryClient | null>(null);

  if (!existingQueryClient && !fallbackClientRef.current) {
    fallbackClientRef.current = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
  }

  const content = (
    <IntelligencePageContainer testId="intelligence-chat-page">
      <IntelligencePageHeader
        title="Asistente Conversacional Kynergy"
        description="Consulta políticas, manuales clínicos y protocolos kinefisiátricos verificados con atribución de fuentes y síntesis conectada en tiempo real."
        icon={Bot}
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            RAG Verificado
          </span>
        }
      />
      <ChatWorkspace />
    </IntelligencePageContainer>
  );

  if (!existingQueryClient && fallbackClientRef.current) {
    return <QueryClientProvider client={fallbackClientRef.current}>{content}</QueryClientProvider>;
  }

  return content;
};
