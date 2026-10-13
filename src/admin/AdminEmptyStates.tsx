import { ADMIN_COPY } from './adminCopy';

export function AdminLoading() {
  return <p className="p-2 text-gray-700">{ADMIN_COPY.loading}</p>;
}

export function AdminLoadError({ message = ADMIN_COPY.loadError }: { message?: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow space-y-2">
      <h2 className="text-xl font-bold">{ADMIN_COPY.loadErrorTitle}</h2>
      <p>{message}</p>
    </div>
  );
}

export function NoEventToday({ isAdmin, onCreate }: { isAdmin: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow space-y-4">
      <h2 className="text-2xl font-black">{ADMIN_COPY.todayEmptyTitle}</h2>
      <p>{ADMIN_COPY.todayEmptyBody}</p>
      {isAdmin ? (
        <button
          type="button"
          className="w-full rounded-3xl bg-brand py-6 text-xl font-black text-white"
          onClick={onCreate}
        >
          {ADMIN_COPY.createEvent}
        </button>
      ) : (
        <p>{ADMIN_COPY.todayEmptyViewer}</p>
      )}
    </div>
  );
}

export function GuestListEmpty({ hasEvent }: { hasEvent: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow space-y-2">
      <h2 className="font-bold">Guest list</h2>
      <p>{hasEvent ? ADMIN_COPY.guestEmptyNoGuests : ADMIN_COPY.guestEmptyNoEvent}</p>
    </div>
  );
}

export function HistoryEmpty({ hasEvent }: { hasEvent: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow space-y-2">
      <h2 className="font-bold">History</h2>
      <p>{hasEvent ? ADMIN_COPY.historyEmptyNoDraws : ADMIN_COPY.historyEmptyNoEvent}</p>
    </div>
  );
}
