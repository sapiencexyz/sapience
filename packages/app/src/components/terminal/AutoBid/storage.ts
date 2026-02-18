import type { Order, AutoBidLogEntry } from './types';
import { AUTO_BID_STORAGE_KEY, AUTO_BID_LOGS_KEY } from './constants';
import { sanitizeOrder, sanitizeLogEntry } from './utils';

export const readOrdersFromStorage = (): Order[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(AUTO_BID_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => sanitizeOrder(entry))
      .filter((order): order is Order => Boolean(order));
  } catch {
    return [];
  }
};

export const writeOrdersToStorage = (orders: Order[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      AUTO_BID_STORAGE_KEY,
      JSON.stringify(orders ?? [])
    );
  } catch {
    // no-op
  }
};

export const readLogsFromStorage = (): AutoBidLogEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(AUTO_BID_LOGS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => sanitizeLogEntry(entry))
      .filter((entry): entry is AutoBidLogEntry => Boolean(entry))
      .slice(0, 200);
  } catch {
    return [];
  }
};

export const writeLogsToStorage = (logs: AutoBidLogEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      AUTO_BID_LOGS_KEY,
      JSON.stringify((logs ?? []).slice(0, 200))
    );
  } catch {
    // no-op
  }
};
