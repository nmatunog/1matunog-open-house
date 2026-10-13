import type { OhEvent, OhRole } from '../types';

export function readAdminRole(value: unknown): OhRole {
  return String(value ?? '').trim().toLowerCase() === 'admin' ? 'admin' : 'viewer';
}

export function eventsFromSnapshot(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
): OhEvent[] {
  const list = docs.map((d) => {
    const data = d.data();
    const pending = data.pendingDrawNo;
    return {
      ...(data as Omit<OhEvent, 'id'>),
      id: d.id,
      name: typeof data.name === 'string' ? data.name : 'Open House',
      eventDate: typeof data.eventDate === 'string' ? data.eventDate : '',
      booths: Array.isArray(data.booths) ? data.booths : [],
      pendingDrawNo: typeof pending === 'number' ? pending : null,
      lastDrawNo: typeof data.lastDrawNo === 'number' ? data.lastDrawNo : 0,
    } as OhEvent;
  });
  list.sort((a, b) => a.eventDate.localeCompare(b.eventDate) * -1);
  return list;
}
