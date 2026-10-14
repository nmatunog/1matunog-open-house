import { useMemo, useState } from 'react';
import { SafeText } from '../components/SafeText';
import { getFirebase } from '../firebase/app';
import { stationsStillOpen, writeAdminStationStamps } from '../lib/adminStamps';
import type { Checkin, OhEvent } from '../types';
import { ADMIN_COPY } from './adminCopy';

export function AddStampsPanel({
  event,
  checkin,
  doneBoothIds,
  onClose,
  writeStamps = writeAdminStationStamps,
}: {
  event: OhEvent;
  checkin: Checkin;
  doneBoothIds: string[];
  onClose: () => void;
  writeStamps?: typeof writeAdminStationStamps;
}) {
  const remaining = useMemo(
    () => stationsStillOpen(event.booths.map((b) => b.id), doneBoothIds),
    [event.booths, doneBoothIds],
  );
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const doneSet = new Set(doneBoothIds);

  async function save(boothIds: string[]) {
    if (boothIds.length === 0) {
      setError(ADMIN_COPY.addStampsNone);
      return;
    }
    setBusy(true);
    setError('');
    setNote('');
    try {
      await writeStamps({
        db: getFirebase().db,
        eventId: event.id,
        personId: checkin.personId,
        anonUid: checkin.anonUid,
        boothIds,
      });
      setNote(ADMIN_COPY.addStampsSaved);
      onClose();
    } catch (err) {
      console.error(err);
      setError(ADMIN_COPY.addStampsError);
    } finally {
      setBusy(false);
    }
  }

  function onMarkAll() {
    if (!confirm(ADMIN_COPY.addStampsConfirmAll)) return;
    void save(remaining);
  }

  return (
    <div className="space-y-3 border-t bg-rose-50/60 px-4 py-3">
      <p className="text-sm font-semibold">
        {ADMIN_COPY.addStamps} for <SafeText as="span" value={checkin.name} />
      </p>
      <p className="text-sm text-gray-700">{ADMIN_COPY.addStampsHint}</p>
      <ul className="space-y-2">
        {event.booths.map((b, i) => {
          const already = doneSet.has(b.id);
          const checked = already || picked.includes(b.id);
          return (
            <li key={b.id}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={already || busy}
                  onChange={(e) => {
                    setPicked((prev) =>
                      e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                    );
                  }}
                />
                <span>
                  Station {i + 1}: <SafeText as="span" value={b.name} />
                  {already ? ' — already done' : ''}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {note ? <p className="text-sm text-green-700">{note}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-brand px-4 py-3 font-bold text-white disabled:bg-gray-200 disabled:text-gray-400"
          disabled={busy || remaining.length === 0}
          onClick={onMarkAll}
        >
          {ADMIN_COPY.markAllStationsDone}
        </button>
        <button
          type="button"
          className="rounded-xl bg-gray-900 px-4 py-3 font-semibold text-white disabled:bg-gray-200 disabled:text-gray-400"
          disabled={busy}
          onClick={() => void save(picked)}
        >
          {busy ? 'Saving…' : ADMIN_COPY.saveTheseStamps}
        </button>
        <button type="button" className="rounded-xl bg-white px-4 py-3 font-semibold shadow" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
