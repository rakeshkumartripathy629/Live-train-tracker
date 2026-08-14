"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Train,
  ArrowRight,
  Sparkles,
  Clock,
  History,
  MapPin,
  Zap,
  Search,
  Loader2,
  AlertCircle,
  X,
  TrendingUp,
  Ticket,
  Bot,
  ArrowLeftRight,
} from "lucide-react";
import { useTrainSearch } from "@/hooks/useTrainSearch";
import { useJourneySync } from "@/hooks/useJourneySync";
import { useSearchStore } from "@/store/search";
import { SearchResult } from "@/types/train";
import { TrainAvatar } from "@/components/ui/TrainAvatar";
import { cn } from "@/utils/cn";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const QUICK_ACTIONS = [
  {
    href: "/between",
    label: "Trains Between",
    desc: "Station to station",
    icon: ArrowLeftRight,
    iconClass: "bg-emerald-500/10 text-emerald-600",
  },
  {
    href: "/pnr",
    label: "PNR Status",
    desc: "Booking status",
    icon: Ticket,
    iconClass: "bg-rail-blue/10 text-rail-blue",
  },
  {
    href: "/journeys",
    label: "My Journeys",
    desc: "Track your trip",
    icon: TrendingUp,
    iconClass: "bg-amber-500/10 text-amber-600",
  },
  {
    href: "/assistant",
    label: "AI Assistant",
    desc: "Ask about trains",
    icon: Bot,
    iconClass: "bg-violet-500/10 text-violet-500",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { recentSearches, addRecentSearch, clearRecentSearches } =
    useSearchStore();
  const { recordJourney } = useJourneySync();
  const [inputValue, setInputValue] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const debouncedQuery = useDebounce(inputValue, 350);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    data: searchResults,
    isLoading,
    isError,
  } = useTrainSearch(debouncedQuery);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (train: SearchResult) => {
    addRecentSearch(train);
    recordJourney(train);
    setIsSearchOpen(false);
    setInputValue("");
    router.push(`/train/${train.number}`);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      const first = searchResults?.[0];
      if (first) handleSelect(first);
      else router.push(`/train/${inputValue.trim()}`);
    }
    if (e.key === "Escape") {
      setIsSearchOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isSearchOpen && (inputValue || debouncedQuery);

  return (
    <div className="space-y-8 py-3 sm:py-5">
      {/* â”€â”€â”€ Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/15 bg-gradient-to-b from-sky-500/10 via-background to-background p-6 sm:p-10 md:p-14 text-center">
        {/* Decorative train motif */}
        <div className="pointer-events-none absolute -right-10 -top-16 opacity-[0.06] dark:opacity-[0.08] hidden sm:block">
          <Train className="h-72 w-72 rotate-12" strokeWidth={1} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-rail-track opacity-60" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1 text-[11px] sm:text-xs font-semibold text-rail-blue backdrop-blur-md mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Real-time Indian Railways Intelligence Â· RailRadar</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
            Track Any Train in{" "}
            <span className="bg-gradient-to-r from-rail-blue to-sky-500 bg-clip-text text-transparent">
              Real-time.
            </span>
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-lg text-slate-600 dark:text-slate-300">
            Live GPS tracking, delay analytics, route maps, and weather for
            every train across India.
          </p>

          {/* â”€â”€â”€ Search â”€â”€â”€ */}
          <div className="relative mx-auto mt-7 max-w-xl text-left">
            <div
              className={cn(
                "card-surface flex items-center gap-3 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 transition-all duration-300",
                isSearchOpen
                  ? "border-rail-blue/50 shadow-glow ring-1 ring-rail-blue/20"
                  : "",
              )}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rail-gradient text-white">
                {isLoading && inputValue ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </div>

              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                onKeyDown={handleInputKeyDown}
                placeholder="Train number (12951) or name (Rajdhani)..."
                aria-label="Search trains"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-400 outline-none dark:text-white dark:placeholder-slate-500"
              />

              {inputValue && (
                <button
                  onClick={() => {
                    setInputValue("");
                    setIsSearchOpen(false);
                  }}
                  aria-label="Clear search"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <kbd className="hidden sm:inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                âŒ˜ K
              </kbd>
            </div>

            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  ref={dropdownRef}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(360px,60vh)] overflow-y-auto rounded-2xl glass-panel p-2 shadow-lift border border-slate-200 dark:border-slate-800"
                >
                  {isError && (
                    <div className="flex items-center gap-2 py-4 justify-center text-xs text-rose-500">
                      <AlertCircle className="h-4 w-4" />
                      <span>Error loading trains. Please try again.</span>
                    </div>
                  )}

                  {isLoading && !searchResults && (
                    <div className="space-y-2 py-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-14 rounded-xl skeleton-shimmer"
                        />
                      ))}
                    </div>
                  )}

                  {!isLoading &&
                    !isError &&
                    searchResults &&
                    searchResults.length === 0 && (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No trains found. Try a train number like{" "}
                        <strong>12951</strong> or name like{" "}
                        <strong>Rajdhani</strong>.
                      </div>
                    )}

                  {inputValue && /^\d{4,5}$/.test(inputValue.trim()) && (
                    <button
                      onClick={() => router.push(`/train/${inputValue.trim()}`)}
                      className="mb-1.5 flex w-full items-center gap-3 rounded-xl bg-rail-blue/10 px-3 py-2.5 text-xs font-bold text-rail-blue transition-all hover:bg-rail-blue hover:text-white"
                    >
                      <Train className="h-4 w-4" />
                      <span>Track train #{inputValue.trim()} live â†’</span>
                    </button>
                  )}

                  {searchResults && searchResults.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {inputValue ? "Matching Trains" : "Popular Trains"}
                      </p>
                      {searchResults.map((train) => (
                        <button
                          key={train.id}
                          onClick={() => handleSelect(train)}
                          className="group flex w-full items-center justify-between rounded-xl p-2 text-left transition-all duration-150 hover:bg-rail-blue/5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <TrainAvatar number={train.number} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {train.number}
                                </span>
                                <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                  {train.name}
                                </span>
                              </div>
                              {(train.origin.name ||
                                train.destination.name) && (
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                                  <span>
                                    {train.origin.name} ({train.origin.code})
                                  </span>
                                  <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                                  <span>
                                    {train.destination.name} (
                                    {train.destination.code})
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-rail-blue" />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick chips */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="font-medium text-slate-400">Try:</span>
            {["12951", "22436", "12301", "12621"].map((num) => (
              <button
                key={num}
                onClick={() => {
                  setInputValue(num);
                  setIsSearchOpen(true);
                  inputRef.current?.focus();
                }}
                className="rounded-lg bg-slate-200/70 px-2.5 py-1.5 font-mono font-semibold text-slate-700 transition-colors hover:bg-rail-blue hover:text-white dark:bg-slate-800/70 dark:text-slate-300"
              >
                {num}
              </button>
            ))}
          </div>
        </motion.div>
      </section>

      {/* â”€â”€â”€ Quick actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map(
          ({ href, label, desc, icon: Icon, iconClass }, i) => (
            <motion.div
              key={href}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.06 * i }}
            >
              <Link
                href={href}
                className="card-surface card-surface-hover flex items-center gap-3 rounded-2xl p-3.5 sm:p-4"
              >
                <div
                  className={cn(
                    "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl",
                    iconClass,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {label}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">{desc}</p>
                </div>
              </Link>
            </motion.div>
          ),
        )}
      </section>

      {/* â”€â”€â”€ Recent Searches â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {recentSearches.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-lg text-slate-900 dark:text-white">
              <History className="h-5 w-5 text-rail-blue" />
              <span>Recent Searches</span>
            </div>
            <button
              onClick={clearRecentSearches}
              className="text-xs font-semibold text-slate-400 hover:text-rose-500 transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentSearches.map((train) => (
              <Link
                key={train.id}
                href={`/train/${train.number}`}
                className="card-surface card-surface-hover group flex items-center justify-between rounded-2xl p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TrainAvatar number={train.number} size="sm" />
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {train.name}
                    </h4>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 truncate">
                      <span>{train.origin.code}</span>
                      <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{train.destination.code}</span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-rail-blue" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* â”€â”€â”€ Feature Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: <MapPin className="h-6 w-6" />,
            color: "bg-sky-500/10 text-rail-blue",
            title: "Vector Map Tracking",
            desc: "Dark vector tiles with an animated live train marker, route glow, and follow camera.",
          },
          {
            icon: <Zap className="h-6 w-6" />,
            color: "bg-emerald-500/10 text-emerald-600",
            title: "Live 30s Auto-Refresh",
            desc: "TanStack Query polls RailRadar every 30 seconds for position, delay, and ETA updates.",
          },
          {
            icon: <Clock className="h-6 w-6" />,
            color: "bg-amber-500/10 text-amber-600",
            title: "OpenWeather & Terrain",
            desc: "Per-station live weather and SRTM elevation profiles along the route.",
          },
        ].map((f, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 * i }}
            className="card-surface rounded-3xl p-6 space-y-3"
          >
            <div
              className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center",
                f.color,
              )}
            >
              {f.icon}
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {f.title}
            </h3>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {f.desc}
            </p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
