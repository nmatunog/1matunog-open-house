import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { AddStampsPanel } from '../../src/admin/AddStampsPanel';
import { ADMIN_COPY } from '../../src/admin/adminCopy';
import type { Checkin, OhEvent } from '../../src/types';

vi.mock('../../src/firebase/app', () => ({
  getFirebase: () => ({ db: {} }),
}));

const booths = [
  { id: 'booth-1', name: 'Products', codeHash: 'x' },
  { id: 'booth-2', name: 'Vitality', codeHash: 'x' },
  { id: 'booth-3', name: 'Internship', codeHash: 'x' },
];

const event: OhEvent = {
  id: 'evt-1',
  name: 'Open House',
  venue: 'Cebu',
  eventDate: '2026-10-14',
  checkInOpensAt: Timestamp.fromMillis(1),
  checkInClosesAt: Timestamp.fromMillis(9),
  raffle: {
    opensAt: Timestamp.fromMillis(1),
    closesAt: Timestamp.fromMillis(9),
    minStamps: 3,
    allowRepeatWinners: false,
    prizes: [],
  },
  booths,
  status: 'open',
  createdBy: 'nilo@example.com',
  pendingDrawNo: null,
  lastDrawNo: 0,
};

const checkin: Checkin = {
  personId: 'p1',
  name: 'Maria Santos',
  email: 'maria@example.com',
  phone: '+639171234567',
  invitedBy: 'Ana',
  stampsCompleted: 1,
  checkedInAt: Timestamp.fromMillis(1),
  anonUid: 'guest-uid-1',
  consentVersion: 'v1',
};

describe('Add stamps panel', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses plain words and offers mark-all plus per-station ticks', () => {
    render(
      <AddStampsPanel event={event} checkin={checkin} doneBoothIds={['booth-1']} onClose={() => {}} />,
    );
    expect(screen.getByText(ADMIN_COPY.addStampsHint)).toBeInTheDocument();
    expect(screen.getByText(/Add stamps for/)).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ADMIN_COPY.markAllStationsDone })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ADMIN_COPY.saveTheseStamps })).toBeInTheDocument();
    expect(screen.getByLabelText(/Station 1: Products/)).toBeDisabled();
    expect(screen.getByLabelText(/Station 2: Vitality/)).not.toBeDisabled();
    expect(document.body.textContent).not.toMatch(/\bCMA\b/);
    expect(document.body.textContent).not.toMatch(/Firestore|boothId|stampKey/i);
  });

  it('writes every remaining station after the mark-all confirmation', async () => {
    const writeStamps = vi.fn(async () => ({ written: ['booth-2', 'booth-3'], already: [] }));
    const onClose = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <AddStampsPanel
        event={event}
        checkin={checkin}
        doneBoothIds={['booth-1']}
        onClose={onClose}
        writeStamps={writeStamps}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: ADMIN_COPY.markAllStationsDone }));
    await waitFor(() => {
      expect(writeStamps).toHaveBeenCalledWith({
        db: {},
        eventId: 'evt-1',
        personId: 'p1',
        anonUid: 'guest-uid-1',
        boothIds: ['booth-2', 'booth-3'],
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not write when mark-all is cancelled', async () => {
    const writeStamps = vi.fn(async () => ({ written: [], already: [] }));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <AddStampsPanel
        event={event}
        checkin={checkin}
        doneBoothIds={['booth-1']}
        onClose={() => {}}
        writeStamps={writeStamps}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: ADMIN_COPY.markAllStationsDone }));
    expect(writeStamps).not.toHaveBeenCalled();
  });

  it('saves only the stations the admin ticks', async () => {
    const writeStamps = vi.fn(async () => ({ written: ['booth-3'], already: [] }));
    render(
      <AddStampsPanel
        event={event}
        checkin={checkin}
        doneBoothIds={['booth-1']}
        onClose={() => {}}
        writeStamps={writeStamps}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Station 3: Internship/));
    fireEvent.click(screen.getByRole('button', { name: ADMIN_COPY.saveTheseStamps }));
    await waitFor(() => {
      expect(writeStamps).toHaveBeenCalledWith(
        expect.objectContaining({ boothIds: ['booth-3'] }),
      );
    });
  });
});
