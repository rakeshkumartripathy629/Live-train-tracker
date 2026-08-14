// Phase 10 — client helpers for the AI assistant (same-origin /api/ai/* routes).

export interface AiMeta {
  conversationId: string;
  messageId: string;
  flagged?: boolean;
}

export interface AiToolEvent {
  id: string;
  name: string;
  ok?: boolean;
  error?: string;
}

export interface AiDone {
  messageId: string;
  conversationId: string;
  sources: string[];
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  model?: string | null;
  createdAt?: string;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface AiConversationDetail {
  conversation: AiConversationSummary;
  messages: {
    id: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string | null;
    toolArgs?: any;
    sources?: string[];
    model?: string | null;
    createdAt?: string;
  }[];
}

export interface AiStreamHandlers {
  onMeta?: (meta: AiMeta) => void;
  onToolStart?: (tool: AiToolEvent) => void;
  onToolEnd?: (tool: AiToolEvent) => void;
  onAssistantStart?: () => void;
  onToken?: (text: string) => void;
  onDone?: (done: AiDone) => void;
  onError?: (error: { code: string; message: string; retryAfterSeconds?: number }) => void;
}

/**
 * POST a user turn to /api/ai/chat and stream the SSE events. Resolves when
 * the stream finishes or rejects with { code, message, status } for pre-stream
 * JSON errors (401 / 429 / 503 AI_NOT_CONFIGURED ...).
 */
export async function streamAiChat(
  payload: { conversationId?: string; message: string },
  handlers: AiStreamHandlers = {},
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw { code: 'ABORTED', message: 'Stopped', status: 499 };
    throw { code: 'NETWORK', message: 'Network error', status: 502 };
  }

  if (!res.ok) {
    let code = 'AI_ERROR';
    let message = `Assistant request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) message = j.error.message;
      else if (j?.error) message = j.error;
      if (j?.error?.code) code = j.error.code;
      else if (j?.code) code = j.code;
    } catch {
      // non-JSON
    }
    throw { code, message, status: res.status };
  }
  if (!res.body) throw { code: 'EMPTY', message: 'No stream received', status: 502 };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  const dispatch = (event: string, raw: string) => {
    let data: any = {};
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    switch (event) {
      case 'meta':
        handlers.onMeta?.(data as AiMeta);
        break;
      case 'tool_start':
        handlers.onToolStart?.(data as AiToolEvent);
        break;
      case 'tool_end':
        handlers.onToolEnd?.(data as AiToolEvent);
        break;
      case 'assistant_start':
        handlers.onAssistantStart?.();
        break;
      case 'token':
        handlers.onToken?.(data.text);
        break;
      case 'done':
        handlers.onDone?.(data as AiDone);
        break;
      case 'error':
        handlers.onError?.(data as any);
        break;
      default:
        break;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, sep).replace(/\r$/, '');
        buffer = buffer.slice(sep + 1);
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dispatch(currentEvent, line.slice(5).trim());
        } else if (line === '') {
          currentEvent = 'message';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function fetchAiConversations(): Promise<AiConversationSummary[]> {
  const res = await fetch('/api/ai/conversations', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load conversations');
  const json = await res.json();
  return json?.data || [];
}

export async function fetchAiConversation(id: string): Promise<AiConversationDetail> {
  const res = await fetch(`/api/ai/conversations/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load conversation');
  const json = await res.json();
  return json?.data;
}

export async function deleteAiConversation(id: string): Promise<void> {
  const res = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE', cache: 'no-store' });
  if (!res.ok) throw new Error('Could not delete conversation');
}
