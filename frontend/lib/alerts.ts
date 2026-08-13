// Shared Phase 5 alert/notification types + validation helpers for the
// Next.js API routes and client.

export const ALERT_TYPES = [
  'DELAY_THRESHOLD',
  'DELAY_INCREASE',
  'DELAY_REDUCTION',
  'TRAIN_STARTED',
  'TRAIN_DEPARTED',
  'TRAIN_ARRIVED',
  'DESTINATION_APPROACHING',
  'JOURNEY_COMPLETED',
  'TRAIN_CANCELLED',
  'TRAIN_DIVERTED',
  'LIVE_DATA_STALE',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_CHANNELS = ['PUSH'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export interface AlertDoc {
  id: string;
  journeyId: string;
  trainNumber: string;
  alertType: AlertType;
  targetStationCode?: string | null;
  targetStationName?: string | null;
  threshold?: number | null;
  channel: AlertChannel;
  enabled: boolean;
  lastTriggeredAt?: string | null;
  triggerCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  journeyId?: string | null;
  trainNumber?: string | null;
  trainName?: string | null;
  eventType: string;
  channel: string;
  message: string;
  status: string;
  readAt?: string | null;
  createdAt: string;
}

export const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  TRAIN_STARTED: { label: 'Train started', icon: '🚆' },
  TRAIN_DEPARTED: { label: 'Train departed', icon: '🚆' },
  TRAIN_ARRIVED: { label: 'Train arrived', icon: '🚉' },
  DELAY_STARTED: { label: 'Delay started', icon: '⚠️' },
  DELAY_INCREASED: { label: 'Delay increased', icon: '⚠️' },
  DELAY_REDUCED: { label: 'Delay reduced', icon: '✅' },
  DESTINATION_APPROACHING: { label: 'Approaching destination', icon: '📍' },
  JOURNEY_COMPLETED: { label: 'Journey completed', icon: '✅' },
  TRAIN_CANCELLED: { label: 'Train cancelled', icon: '⛔' },
  TRAIN_DIVERTED: { label: 'Train diverted', icon: '↩️' },
  LIVE_DATA_STALE: { label: 'Live data stale', icon: '📡' },
  LIVE_DATA_RECOVERED: { label: 'Live data recovered', icon: '📡' },
};

export function alertLabel(type: string): string {
  const map: Record<string, string> = {
    DELAY_THRESHOLD: 'Delay threshold (min)',
    DELAY_INCREASE: 'Delay increase (min)',
    DELAY_REDUCTION: 'Delay reduction (min)',
    TRAIN_STARTED: 'Train started',
    TRAIN_DEPARTED: 'Train departed',
    TRAIN_ARRIVED: 'Train arrived',
    DESTINATION_APPROACHING: 'Destination approaching (km)',
    JOURNEY_COMPLETED: 'Journey completed',
    TRAIN_CANCELLED: 'Train cancelled',
    TRAIN_DIVERTED: 'Train diverted',
    LIVE_DATA_STALE: 'Live data stale',
  };
  return map[type] || type;
}

export interface AlertCreateInput {
  journeyId: string;
  alertType: AlertType;
  threshold?: number | null;
  channel?: AlertChannel;
}

/**
 * Validate an alert payload server-side. Returns an error string or null.
 */
export function validateAlertInput(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  const type = String(body.alertType || '').toUpperCase();
  if (!ALERT_TYPES.includes(type as AlertType)) return 'Invalid alertType';
  if (body.journeyId && typeof body.journeyId !== 'string') return 'Invalid journeyId';

  const channel = body.channel ? String(body.channel).toUpperCase() : 'PUSH';
  if (!ALERT_CHANNELS.includes(channel as AlertChannel)) {
    return `Channel ${channel} is not configured`;
  }

  const t = body.threshold;
  if (t === undefined || t === null || t === '') {
    if (type === 'DELAY_THRESHOLD' || type === 'DESTINATION_APPROACHING') {
      return `threshold is required for ${type}`;
    }
    return null; // threshold optional for the rest
  }
  const num = Number(t);
  if (!Number.isFinite(num)) return 'threshold must be a number';

  if (type === 'DELAY_THRESHOLD') {
    if (num < 1 || num > 1440) return 'delay threshold must be between 1 and 1440 minutes';
  } else if (type === 'DELAY_INCREASE' || type === 'DELAY_REDUCTION') {
    if (num < 0 || num > 1440) return 'delay change threshold must be between 0 and 1440 minutes';
  } else if (type === 'DESTINATION_APPROACHING') {
    if (num < 1 || num > 1000) return 'destination threshold must be between 1 and 1000 km';
  }
  return null;
}

export function mapAlertDoc(doc: any): AlertDoc {
  return {
    id: doc._id.toString(),
    journeyId: doc.journeyId,
    trainNumber: doc.trainNumber,
    alertType: doc.alertType,
    targetStationCode: doc.targetStationCode || null,
    targetStationName: doc.targetStationName || null,
    threshold: doc.threshold ?? null,
    channel: doc.channel || 'PUSH',
    enabled: doc.enabled !== false,
    lastTriggeredAt: doc.lastTriggeredAt ? new Date(doc.lastTriggeredAt).toISOString() : null,
    triggerCount: doc.triggerCount || 0,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function mapNotificationDoc(doc: any): NotificationItem {
  return {
    id: doc._id.toString(),
    journeyId: doc.journeyId || null,
    trainNumber: doc.trainNumber || null,
    trainName: doc.trainName || null,
    eventType: doc.eventType,
    channel: doc.channel || 'PUSH',
    message: doc.message || '',
    status: doc.status || 'QUEUED',
    readAt: doc.readAt ? new Date(doc.readAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
  };
}
