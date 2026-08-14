'use client';

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Send,
  Square,
  Plus,
  Loader2,
  CheckCircle2,
  Wrench,
  Trash2,
  Sparkles,
  MessageSquareText,
  AlertTriangle,
} from 'lucide-react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AiChatMessage, AiToolEvent } from '@/lib/ai-client';
import { useAssistantChat } from '@/hooks/useAssistantChat';
import { cn } from '@/utils/cn';

const QUICK_ACTIONS = [
  { label: 'Live status 12801', prompt: 'What is the current live status of train 12801?' },
  { label: 'BBS to BAM today', prompt: 'Show me trains between Bhubaneswar (BBS) and Brahmapur (BAM) today.' },
  { label: 'Delays near me', prompt: 'How delayed are trains at Brahmapur station (BAM) right now? Show the live board.' },
  { label: 'My journeys', prompt: 'What are my saved journeys and their statuses?' },
  { label: 'My favorites', prompt: 'Which trains do I follow? Show my favorites with live status.' },
  { label: 'My alerts', prompt: 'What alerts have I set up?' },
];

const TOOL_LABELS: Record<string, string> = {
  searchStations: 'Find station',
  searchTrains: 'Find train',
  getTrainLiveStatus: 'Live status',
  getTrainRoute: 'Route & schedule',
  getTrainsBetweenStations: 'Trains between',
  getStationLiveBoard: 'Station live board',
  getStationPerformance: 'Station performance',
  getTrainAnalytics: 'Train analytics',
  getTrainRouteIntelligence: 'Route intelligence',
  getWeatherAtStation: 'Weather',
  getUserJourneys: 'Your journeys',
  getUserFavorites: 'Your favorites',
  getUserAlerts: 'Your alerts',
};

function MessageBubble({ message }: { message: AiChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-rail-blue text-white shadow-glow'
            : 'glass-panel border border-slate-200/60 dark:border-slate-800/60 text-slate-800 dark:text-slate-100'
        )}
      >
        {message.content || (
          <span className="inline-flex items-center gap-2 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            thinking…
          </span>
        )}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200/60 pt-2 dark:border-slate-800/60">
            {message.sources.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-full bg-rail-blue/10 px-2 py-0.5 font-mono text-[10px] font-bold text-rail-blue"
              >
                <CheckCircle2 className="h-3 w-3" />
                {TOOL_LABELS[s] || s}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ToolChips({ tools }: { tools: AiToolEvent[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {tools.map((t) => {
        const pending = t.ok === undefined;
        return (
          <div
            key={t.id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              pending
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                : t.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
            )}
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : t.ok ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            {TOOL_LABELS[t.name] || t.name}
          </div>
        );
      })}
    </div>
  );
}

function AssistantChat() {
  const {
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
  } = useAssistantChat();

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || isStreaming) return;
    send(value);
    setInput('');
    inputRef.current?.focus();
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 py-2 md:py-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">AI Assistant</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real data hi — koi fake answer nahi. Har answer live tools se aata hai.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversations.length > 0 && (
            <select
              value={messages.length > 0 ? '' : ''}
              onChange={(e) => e.target.value && loadConversation(e.target.value)}
              className="hidden sm:block rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="">History</option>
              {conversations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={newChat}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex min-h-[50vh] flex-col gap-3 overflow-y-auto rounded-3xl border border-slate-200/60 bg-white/60 p-4 dark:border-slate-800/60 dark:bg-slate-900/40"
      >
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 text-violet-500">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                RailGaadi Assistant se poocho
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live status · routes · trains between · station boards · analytics · weather · aapke journeys
              </p>
            </div>
            <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.prompt}
                  onClick={() => submit(qa.prompt)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rail-blue/40 hover:text-rail-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-500/40"
                >
                  <span className="mr-1.5 text-sky-500">✦</span>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            <ToolChips tools={tools} />
          </>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-bold">{error.message}</p>
              {error.code === 'AI_NOT_CONFIGURED' && (
                <p className="mt-1 text-rose-600/80 dark:text-rose-400/80">
                  Assistant abhi server par enable nahi hai. Owner ko AI_API_KEY configure karne ko bolo.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="glass-panel flex items-center gap-2 rounded-2xl p-2">
        <MessageSquareText className="ml-2 h-4 w-4 flex-shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. How delayed is 12801 right now?"
          disabled={isStreaming}
          className="w-full bg-transparent px-1 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white"
        />
        {isStreaming ? (
          <button
            onClick={stop}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-bold text-white dark:bg-white dark:text-slate-900"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </button>
        ) : (
          <button
            onClick={() => submit()}
            disabled={!input.trim()}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-rail-blue px-3.5 py-2.5 text-xs font-bold text-white shadow-glow transition-colors hover:bg-sky-600 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            Ask
          </button>
        )}
      </div>

      {/* Mobile history */}
      {conversations.length > 0 && (
        <div className="sm:hidden">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">History</p>
          <div className="flex flex-col gap-1">
            {conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"
              >
                <button
                  onClick={() => loadConversation(c.id)}
                  className="min-w-0 flex-1 text-left text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  <span className="block truncate">{c.title}</span>
                </button>
                <button
                  onClick={() => removeConversation(c.id)}
                  className="ml-2 text-slate-400 hover:text-rose-500"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-center text-[11px] text-slate-400">
        <Wrench className="h-3 w-3" />
        Answers stream live from RailRadar + aapke account ki real data — assistant kabhi invent nahi karta.
      </p>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <RequireAuth>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <AssistantChat />
        </motion.div>
      </AnimatePresence>
    </RequireAuth>
  );
}
