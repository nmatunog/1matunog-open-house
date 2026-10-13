import { Timestamp } from 'firebase/firestore';

export type OpenCheckInNowPatch = {
  status: 'open';
  checkInOpensAt: Timestamp;
  checkInClosesAt?: Timestamp;
};

/**
 * Admin override for “open check-in now”. Writes the event window so the
 * published guest rules still hold — they require status == open and
 * now inside checkInOpensAt…checkInClosesAt (see firestore.rules checkins
 * create, and the same window on stamps create). No rule change.
 */
export function openCheckInNowPatch(now: Date, currentClosesAt: Date | null): OpenCheckInNowPatch {
  const patch: OpenCheckInNowPatch = {
    status: 'open',
    checkInOpensAt: Timestamp.fromDate(now),
  };
  if (!currentClosesAt || currentClosesAt.getTime() <= now.getTime()) {
    patch.checkInClosesAt = Timestamp.fromDate(new Date(now.getTime() + 8 * 60 * 60 * 1000));
  }
  return patch;
}
