import type { Checkin, Draw, Person } from '../types';
import { toDate } from './time';

function csvEscape(value: string | number | boolean | null | undefined): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

function iso(value: { toDate?: () => Date } | Date | null | undefined): string {
  const d = toDate(value ?? null);
  return d ? d.toISOString() : '';
}

export function checkinsCsv(eventId: string, checkins: Checkin[]): string {
  return toCsv(
    ['eventId', 'personId', 'name', 'email', 'phone', 'invitedBy', 'stampsCompleted', 'checkedInAt', 'consentVersion'],
    checkins.map((c) => [
      eventId,
      c.personId,
      c.name,
      c.email,
      c.phone,
      c.invitedBy,
      c.stampsCompleted,
      iso(c.checkedInAt),
      c.consentVersion,
    ]),
  );
}

export function winnersCsv(eventId: string, draws: Draw[]): string {
  return toCsv(
    ['eventId', 'drawNo', 'personId', 'displayName', 'invitedBy', 'prize', 'status', 'drawnAt', 'resolvedAt'],
    draws.map((d) => [
      eventId,
      d.id,
      d.personId,
      d.displayName,
      d.invitedBy,
      d.prize,
      d.status,
      iso(d.drawnAt),
      iso(d.resolvedAt),
    ]),
  );
}

export function peopleCsv(people: Person[]): string {
  return toCsv(
    ['personId', 'name', 'email', 'phone', 'invitedByLast', 'eventsAttended', 'marketingOptIn', 'privacyVersion', 'firstSeenAt', 'lastSeenAt'],
    people.map((p) => [
      p.id,
      p.name,
      p.email,
      p.phone,
      p.invitedByLast,
      p.eventsAttended,
      p.consent?.marketingOptIn ?? '',
      p.consent?.privacyVersion ?? '',
      iso(p.firstSeenAt),
      iso(p.lastSeenAt),
    ]),
  );
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
