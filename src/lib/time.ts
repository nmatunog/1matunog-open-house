const MANILA = 'Asia/Manila';

/** Asia/Manila is UTC+8 year-round (no DST). */
export function manilaDateTimeToDate(dateYmd: string, timeHm: string): Date {
  const dateParts = dateYmd.split('-').map(Number);
  const timeParts = timeHm.split(':').map(Number);
  const y = dateParts[0] ?? 0;
  const m = dateParts[1] ?? 1;
  const d = dateParts[2] ?? 1;
  const hh = timeParts[0] ?? 0;
  const mm = timeParts[1] ?? 0;
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm, 0));
}

export function formatManilaDate(dateYmd: string, weekday = true): string {
  const dt = manilaDateTimeToDate(dateYmd, '12:00');
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA,
    weekday: weekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

export function formatManilaTime(value: Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}

/** 24-hour `HH:mm` in Manila, for time inputs. */
export function formatManilaHm(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export function todayYmdManila(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function toDate(value: { toDate?: () => Date } | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return null;
}
