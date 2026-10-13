import { Timestamp } from 'firebase/firestore';
import type { OhEvent } from '../types';
import { formatManilaHm, manilaDateTimeToDate, toDate } from './time';

export type EventDetailsInput = {
  name: string;
  venue: string;
  eventDate: string;
  openT: string;
  closeT: string;
  raffleOpen: string;
  raffleClose: string;
};

/** Fields an admin may change after create. Never booths, tokens, or stamp keys. */
export type EventDetailsUpdate = {
  name: string;
  venue: string;
  eventDate: string;
  checkInOpensAt: Timestamp;
  checkInClosesAt: Timestamp;
  'raffle.opensAt': Timestamp;
  'raffle.closesAt': Timestamp;
};

export function detailsFromEvent(event: OhEvent): EventDetailsInput {
  return {
    name: event.name,
    venue: event.venue || '',
    eventDate: event.eventDate,
    openT: formatManilaHm(toDate(event.checkInOpensAt) ?? new Date()),
    closeT: formatManilaHm(toDate(event.checkInClosesAt) ?? new Date()),
    raffleOpen: formatManilaHm(toDate(event.raffle.opensAt) ?? new Date()),
    raffleClose: formatManilaHm(toDate(event.raffle.closesAt) ?? new Date()),
  };
}

export function eventDetailsUpdate(input: EventDetailsInput): EventDetailsUpdate {
  return {
    name: input.name.trim(),
    venue: input.venue.trim(),
    eventDate: input.eventDate,
    checkInOpensAt: Timestamp.fromDate(manilaDateTimeToDate(input.eventDate, input.openT)),
    checkInClosesAt: Timestamp.fromDate(manilaDateTimeToDate(input.eventDate, input.closeT)),
    'raffle.opensAt': Timestamp.fromDate(manilaDateTimeToDate(input.eventDate, input.raffleOpen)),
    'raffle.closesAt': Timestamp.fromDate(manilaDateTimeToDate(input.eventDate, input.raffleClose)),
  };
}

export function eventDetailsTouchesStations(payload: object): boolean {
  const keys = Object.keys(payload);
  return keys.some((k) => k === 'booths' || k.startsWith('booths.') || k === 'stationSecrets' || k === 'stampKeys');
}

export function stationFingerprint(event: { id: string; booths: { id: string; codeHash?: string }[] }): string {
  return JSON.stringify({
    id: event.id,
    booths: event.booths.map((b) => ({ id: b.id, codeHash: b.codeHash ?? '' })),
  });
}
