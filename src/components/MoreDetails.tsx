import { useState, type ReactNode } from 'react';

export function MoreDetails({ title = 'More details', children }: { title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-gray-600 underline underline-offset-2"
      >
        {title} {open ? '▴' : '▸'}
      </button>
      {open ? <div className="mt-3 text-sm text-gray-700 space-y-2">{children}</div> : null}
    </div>
  );
}
