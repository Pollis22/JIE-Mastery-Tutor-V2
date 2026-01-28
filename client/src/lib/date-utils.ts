const CHICAGO_TIMEZONE = 'America/Chicago';

type DateInput = string | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (!input) return null;
  const date = input instanceof Date ? input : new Date(input);
  return isNaN(date.getTime()) ? null : date;
}

export function formatChicagoDateTime(input: DateInput): string {
  const date = toDate(input);
  if (!date) return input === null || input === undefined ? 'Never' : 'Invalid date';
  
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CHICAGO_TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return 'Invalid date';
  }
}

export function formatChicagoDate(input: DateInput): string {
  const date = toDate(input);
  if (!date) return input === null || input === undefined ? 'N/A' : 'Invalid date';
  
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CHICAGO_TIMEZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  } catch {
    return 'Invalid date';
  }
}

export function formatChicagoTime(input: DateInput): string {
  const date = toDate(input);
  if (!date) return input === null || input === undefined ? 'N/A' : 'Invalid date';
  
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: CHICAGO_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return 'Invalid date';
  }
}

export function formatChicagoRelative(input: DateInput): string {
  const date = toDate(input);
  if (!date) return input === null || input === undefined ? 'Never' : 'Invalid date';
  
  try {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return formatChicagoDateTime(date);
  } catch {
    return 'Invalid date';
  }
}

if (import.meta.env.DEV) {
  const testIso = '2026-01-28T22:14:00.000Z';
  const formatted = formatChicagoDateTime(testIso);
  console.log(`[DateUtils] Sanity check: UTC ${testIso} → Chicago: ${formatted}`);
}
