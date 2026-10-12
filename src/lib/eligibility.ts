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

export function isEligibleToWin(
  checkin: Checkin,
  event: OhEvent,
  winner: WinnerLock | undefined,
): boolean {
  const checkedInAt = toDate(checkin.checkedInAt);
  if (!checkedInAt) return false;
  if (!isInWindow(checkedInAt, toDate(event.raffle.opensAt), toDate(event.raffle.closesAt))) {
    return false;
  }
  if (checkin.stampsCompleted < event.raffle.minStamps) return false;
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
): Checkin[] {
  return checkins.filter((c) => isEligibleToWin(c, event, winners.get(c.personId)));
}

export function statusLabel(status: DrawStatus): string {
  if (status === 'claimed') return 'Claimed';
  if (status === 'no_show') return 'No-show';
  if (status === 'pending') return 'Waiting';
  return 'Void';
}
