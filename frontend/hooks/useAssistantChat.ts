'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiChatMessage,
  AiConversationSummary,
  AiToolEvent,
  deleteAiConversation,
  fetchAiConversation,
  fetchAiConversations,
  streamAiChat,
} from '@/lib/ai-client';

export interface AssistantError {
  code: string;
  message: string;
}

export function useAssistantChat() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [tools, setTools] = useState<AiToolEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<AssistantError | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef(0);

  const refreshConversations = useCallback(async () => {
    try {
      const list = await fetchAiConversations();
      setConversations(list);
    } catch {
      // silent — the sidebar can stay empty
    }
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (rawMessage: string) => {
      const message = rawMessage.trim();
      if (!message || isStreaming) return;

      const userMsg: AiChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };
      const draftId = `draft-${Date.now()}`;
      const draft: AiChatMessage = {
        id: draftId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, draft]);
      setTools([]);
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const turnId = ++activeIdRef.current;

      let usedSources: string[] = [];

      await streamAiChat(
        { conversationId: conversationId || undefined, message },
        {
          onMeta: (meta) => {
            if (turnId !== activeIdRef.current) return;
            setConversationId(meta.conversationId);
          },
          onToolStart: (tool) => {
            if (turnId !== activeIdRef.current) return;
            setTools((prev) => [...prev, { ...tool, ok: undefined }]);
          },
          onToolEnd: (tool) => {
            if (turnId !== activeIdRef.current) return;
            setTools((prev) => prev.map((t) => (t.id === tool.id ? tool : t)));
          },
          onToken: (text) => {
            if (turnId !== activeIdRef.current) return;
            setMessages((prev) =>
              prev.map((m) => (m.id === draftId ? { ...m, content: m.content + text } : m))
            );
          },
          onDone: (done) => {
            if (turnId !== activeIdRef.current) return;
            usedSources = done.sources || [];
            setMessages((prev) =>
              prev.map((m) => (m.id === draftId ? { ...m, id: done.messageId, sources: usedSources } : m))
            );
            setConversationId(done.conversationId);
          },
          onError: (err) => {
            if (turnId !== activeIdRef.current) return;
            setError({ code: err.code, message: err.message });
          },
        },
        controller.signal
      ).catch((err: any) => {
        if (turnId !== activeIdRef.current) return;
        if (err?.code === 'ABORTED') {
          setMessages((prev) =>
            prev.map((m) => (m.id === draftId && !m.content ? { ...m, content: '(stopped)' } : m))
          );
        } else {
          setError({ code: err?.code || 'AI_ERROR', message: err?.message || 'Assistant error' });
        }
      });

      if (turnId === activeIdRef.current) {
        setMessages((prev) => prev.filter((m) => !(m.id === draftId && !m.content.trim())));
        setIsStreaming(false);
        abortRef.current = null;
        refreshConversations();
      }
    },
    [conversationId, isStreaming, refreshConversations]
  );

  const newChat = useCallback(() => {
    activeIdRef.current += 1;
    abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setTools([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    activeIdRef.current += 1;
    abortRef.current?.abort();
    try {
      const detail = await fetchAiConversation(id);
      setConversationId(id);
      setMessages(
        detail.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content || '',
            sources: m.sources || [],
            model: m.model || null,
            createdAt: m.createdAt,
          }))
      );
      setTools([]);
      setError(null);
      setIsStreaming(false);
    } catch (err: any) {
      setError({ code: 'LOAD_FAILED', message: err?.message || 'Could not load conversation' });
    }
  }, []);

  const removeConversation = useCallback(
    async (id: string) => {
      try {
        await deleteAiConversation(id);
        if (conversationId === id) newChat();
        refreshConversations();
      } catch {
        // ignore
      }
    },
    [conversationId, newChat, refreshConversations]
  );

  return {
    conversationId,
    messages,
    tools,
    isStreaming,
    error,
    conversations,
    send,
    stop,
    newChat,
    loadConversation,
    removeConversation,
    refreshConversations,
  };
}
