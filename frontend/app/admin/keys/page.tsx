'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, KeyRound, Trash2, Plus, RefreshCw, Info } from 'lucide-react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { cn } from '@/utils/cn';

interface RailRadarKey {
  id: string;
  label: string;
  status: 'active' | 'exhausted' | 'revoked';
  masked: string;
  usedAt: string | null;
  createdAt: string | null;
}

function AdminKeysInner() {
  const [keys, setKeys] = useState<RailRadarKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/railradar-keys', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`);
      setKeys(j.data || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addKey = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/admin/railradar-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim(), label: label.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`);
      setKey('');
      setLabel('');
      setNotice(`Key ${j?.data?.masked || 'added'} saved — live in under 30s.`);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to add key');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Revoke this key? RailRadar data calls will stop using it.')) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/railradar-keys/${id}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || j?.error || `HTTP ${r.status}`);
      setNotice('Key revoked.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to revoke key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-3">
        <KeyRound className="h-7 w-7 text-rail-blue" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          RailRadar API Keys
        </h1>
      </div>
      <p className="mt-2 flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Free RailRadar keys stop working after their request budget. Add a new
        key here anytime — it goes live automatically, no server restart or
        rebuild needed. If multiple keys are active, the app rotates between
        them automatically when one is exhausted.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </div>
      )}

      <div className="glass-panel mt-6 rounded-2xl border border-slate-200/60 p-5 dark:border-slate-800/60">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Add a new key
        </h2>
        <div className="mt-3 space-y-3">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste the new RailRadar API key here"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rail-blue dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            spellCheck={false}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. primary free, backup 2)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rail-blue dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            onClick={addKey}
            disabled={busy || !key.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-rail-blue px-4 py-2 text-sm font-medium text-white shadow-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Test &amp; save key
          </button>
          <p className="text-xs text-slate-400">
            The key is verified against RailRadar before saving.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Active keys
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-rail-blue"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="mt-2 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading keys…
          </div>
        ) : keys.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">
            No keys stored yet. Add your RailRadar key above.
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="glass-panel flex items-center justify-between rounded-xl border border-slate-200/60 px-4 py-3 dark:border-slate-800/60"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-800 dark:text-slate-100">
                    {k.masked}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      k.status === 'active' &&
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      k.status === 'exhausted' &&
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                      k.status === 'revoked' &&
                        'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    )}
                  >
                    {k.status}
                  </span>
                </div>
                {k.label && (
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {k.label}
                  </div>
                )}
              </div>
              {k.status === 'active' && (
                <button
                  onClick={() => revoke(k.id)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminKeysPage() {
  return (
    <RequireAuth>
      <AdminKeysInner />
    </RequireAuth>
  );
}
