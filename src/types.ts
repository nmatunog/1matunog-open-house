import type { Timestamp } from 'firebase/firestore';

export type OhRole = 'admin' | 'viewer';
export type EventStatus = 'draft' | 'open' | 'closed' | 'archived';
export type DrawStatus = 'pending' | 'claimed' | 'no_show' | 'void';

export type Booth = {
  id: string;
  name: string;
  codeHash: string;
};

export type RaffleConfig = {
  opensAt: Timestamp;
  closesAt: Timestamp;
  minStamps: number;
  allowRepeatWinners: boolean;
  prizes: string[];
};

export type OhEvent = {
  id: string;
  name: string;
  venue: string;
  eventDate: string;
  checkInOpensAt: Timestamp;
  checkInClosesAt: Timestamp;
  raffle: RaffleConfig;
  booths: Booth[];
  status: EventStatus;
  createdBy: string;
  pendingDrawNo: number | null;
  lastDrawNo: number;
};

export type Checkin = {
  personId: string;
  name: string;
  email: string;
  phone: string;
  invitedBy: string;
  stampsCompleted: number;
  checkedInAt: Timestamp;
  anonUid: string;
  consentVersion: string;
};

export type Draw = {
  id: string;
  personId: string;
  displayName: string;
  invitedBy: string;
  prize: string;
  drawnAt: Timestamp;
  drawnBy: string;
  status: DrawStatus;
  resolvedAt: Timestamp | null;
};

export type WinnerLock = {
  personId: string;
  drawNo: number;
  status: DrawStatus;
};

export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
  eventsAttended: number;
  consent: {
    privacyVersion: string;
    agreedAt: Timestamp | null;
    marketingOptIn: boolean;
  } | null;
  invitedByLast: string;
  legacy?: boolean;
};

export type DuplicateFlag = {
  phone: string;
  personId: string;
  otherPersonId: string;
  email: string;
  otherEmail?: string;
};

export type GuestDetails = {
  name: string;
  email: string;
  phone: string;
  invitedBy: string;
  privacyAgreed: boolean;
  marketingOptIn: boolean;
};

export type PassportSession = {
  eventId: string;
  details: GuestDetails;
  stampedBoothIds: string[];
  submitted: boolean;
  personId?: string;
};

export type DeviceCheckin = {
  eventId: string;
  personId: string;
  name: string;
  anonUid?: string;
};

export type StationStamp = {
  id: string;
  boothId: string;
  personId: string;
  anonUid: string;
  stampKeyId: string;
};

export type PendingStationScan = {
  eventId: string;
  token: string;
};

export type AdminProfile = {
  uid: string;
  email: string;
  role: OhRole;
  active: boolean;
};
