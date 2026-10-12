export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm font-medium text-red-600" role="alert">
      {message}
    </p>
  );
}

export function fieldClass(error?: string): string {
  return [
    'w-full rounded-xl border bg-white px-4 py-3 font-medium outline-none transition',
    error
      ? 'border-red-500 ring-2 ring-red-500/20'
      : 'border-gray-200 focus:border-brand focus:ring-2 focus:ring-red-500/20',
  ].join(' ');
}
