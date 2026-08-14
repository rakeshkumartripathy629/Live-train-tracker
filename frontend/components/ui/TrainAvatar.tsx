import React from 'react';
import { Train, TrainFront, FastForward } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * Consistent railway icon language for train entities.
 * Maps real train types (from backend data) to a subtle visual tone.
 * Falls back to a generic train icon when the type is unknown.
 */

export type TrainTone = 'premium' | 'superfast' | 'express' | 'local' | 'default';

const TYPE_KEYWORDS: { tone: TrainTone; keywords: string[] }[] = [
  {
    tone: 'premium',
    keywords: ['rajdhani', 'shatabdi', 'vande bharat', 'vande', 'duronto', 'humsafar', 'tejas', 'garib rath', 'premium', 'gatimaan', 'double decker', 'jan shatabdi'],
  },
  { tone: 'superfast', keywords: ['superfast', 'super fast', 'super fast', 'sf', 'garib'] },
  { tone: 'express', keywords: ['express', 'mail', 'fast'] },
  { tone: 'local', keywords: ['memu', 'demu', 'passenger', 'local', 'suburban', 'emu'] },
];

export function trainTone(type?: string | null): TrainTone {
  const t = (type || '').toLowerCase().trim();
  if (!t) return 'default';
  for (const group of TYPE_KEYWORDS) {
    if (group.keywords.some((k) => t.includes(k))) return group.tone;
  }
  return 'default';
}

export const TRAIN_TONE_STYLE: Record<TrainTone, { tile: string; text: string; icon: string; ring: string }> = {
  premium: {
    tile: 'bg-gradient-to-br from-violet-500 to-sky-600',
    text: 'text-violet-600 dark:text-violet-400',
    icon: 'text-white',
    ring: 'ring-violet-500/30',
  },
  superfast: {
    tile: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    text: 'text-emerald-600 dark:text-emerald-400',
    icon: 'text-white',
    ring: 'ring-emerald-500/30',
  },
  express: {
    tile: 'bg-gradient-to-br from-sky-500 to-rail-blue',
    text: 'text-rail-blue dark:text-sky-400',
    icon: 'text-white',
    ring: 'ring-sky-500/30',
  },
  local: {
    tile: 'bg-gradient-to-br from-slate-500 to-slate-700',
    text: 'text-slate-600 dark:text-slate-400',
    icon: 'text-white',
    ring: 'ring-slate-500/30',
  },
  default: {
    tile: 'bg-gradient-to-br from-rail-blue to-sky-600',
    text: 'text-rail-blue dark:text-sky-400',
    icon: 'text-white',
    ring: 'ring-sky-500/30',
  },
};

export function TrainIconForTone({ tone, className }: { tone: TrainTone; className?: string }) {
  if (tone === 'premium') return <FastForward className={cn('text-white', className)} />;
  if (tone === 'superfast') return <TrainFront className={cn('text-white', className)} />;
  if (tone === 'local') return <Train className={cn('text-white', className)} />;
  return <TrainFront className={cn('text-white', className)} />;
}

interface TrainAvatarProps {
  type?: string | null;
  number?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showIcon?: boolean;
  label?: string;
}

const SIZE_MAP = {
  xs: 'h-8 w-8 rounded-lg',
  sm: 'h-10 w-10 rounded-xl',
  md: 'h-12 w-12 rounded-xl',
  lg: 'h-16 w-16 rounded-2xl',
  xl: 'h-20 w-20 rounded-3xl',
};

const ICON_MAP = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
};

const NUM_MAP = {
  xs: 'text-[9px]',
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
};

/**
 * Train avatar tile used everywhere a train entity appears.
 * The tile is category artwork (Express / Superfast / Premium / Local),
 * NOT a photograph of the actual train.
 */
export function TrainAvatar({
  type,
  number,
  size = 'md',
  className,
  showIcon = true,
  label,
}: TrainAvatarProps) {
  const tone = trainTone(type);
  const style = TRAIN_TONE_STYLE[tone];

  return (
    <div
      role="img"
      aria-label={label || (type ? `${type} train` : 'Train')}
      className={cn(
        'relative flex flex-shrink-0 items-center justify-center overflow-hidden shadow-soft ring-1 ring-white/20 dark:ring-white/10',
        style.tile,
        SIZE_MAP[size],
        className
      )}
    >
      {showIcon && <TrainIconForTone tone={tone} className={ICON_MAP[size]} />}
      {number && (
        <span
          className={cn(
            'pointer-events-none absolute bottom-0.5 right-1 font-mono font-black text-white/80',
            NUM_MAP[size]
          )}
        >
          {number}
        </span>
      )}
      {/* subtle track motif */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-white/15" />
    </div>
  );
}

/** Tone-specific icon + label color helper (for non-tile usage). */
export function TrainToneText({ type, className }: { type?: string | null; className?: string }) {
  const tone = trainTone(type);
  return <span className={cn(TRAIN_TONE_STYLE[tone].text, className)}>{type || 'Train'}</span>;
}
