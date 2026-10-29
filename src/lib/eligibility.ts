import type { Checkin, DrawStatus, OhEvent, WinnerLock } from '../types';
import { toDate } from './time';

export function isInWindow(now: Date, opensAt: Date | null, closesAt: Date | null): boolean {
  if (!opensAt || !closesAt) return false;
  return now.getTime() >= opensAt.getTime() && now.getTime() <= closesAt.getTime();
}

export function eventCheckInOpen(event: OhEvent, now = new Date()): boolean {
  return (
    event.status === 'open' &&
    isInWindow(now, toDate(event.checkInOpensAt), toDate(event.checkInClosesAt))
  );
}

export function raffleWindowOpen(event: OhEvent, now = new Date()): boolean {
  return isInWindow(now, toDate(event.raffle.opensAt), toDate(event.raffle.closesAt));
}

/** Every station on this event. Stamp documents, unique by station, must reach this. */
export function stationsNeeded(event: { booths: { id: string }[] }): number {
  return event.booths.length;
}

export function guestListStatus(uniqueStations: number, needed: number): 'Complete' | 'Open' {
  return needed > 0 && uniqueStations >= needed ? 'Complete' : 'Open';
}

export function isEligibleToWin(
  checkin: Checkin,
  event: OhEvent,
  winner: WinnerLock | undefined,
  uniqueStations: number,
): boolean {
  if (!checkin.personId) return false;
  // A persisted check-in is mandatory in both modes. Only station completion is bypassed.
  if (!checkin.checkedInAt) return false;
  if (event.boothScanRequirementSuspended !== true) {
    const needed = stationsNeeded(event);
    if (needed <= 0) return false;
    // Use unique station stamp documents, never the cached stampsCompleted counter.
    if (uniqueStations < needed) return false;
  }
  if (!winner) return true;
  if (winner.status === 'no_show' || winner.status === 'pending' || winner.status === 'void') {
    return false;
  }
  if (winner.status === 'claimed') return event.raffle.allowRepeatWinners === true;
  return false;
}

export function eligiblePool(
  checkins: Checkin[],
  event: OhEvent,
  winners: Map<string, WinnerLock>,
  uniqueStationsByPerson: Map<string, number>,
): Checkin[] {
  return checkins.filter((c) =>
    isEligibleToWin(c, event, winners.get(c.personId), uniqueStationsByPerson.get(c.personId) ?? 0),
  );
}

export function statusLabel(status: DrawStatus): string {
  if (status === 'claimed') return 'Claimed';
  if (status === 'no_show') return 'No-show';
  if (status === 'pending') return 'Waiting';
  return 'Void';
}
