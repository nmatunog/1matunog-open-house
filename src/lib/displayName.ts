/** Projector-safe name: first name + last initial, e.g. "Juan Dela Cruz" → "JUAN D." */
export function projectorName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GUEST';
  const first = (parts[0] ?? 'GUEST').toUpperCase();
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1] ?? '';
  const initial = last.charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}

export function containsContactFields(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('@')) return true;
  if (/\+63\d{10}/.test(text.replace(/\s/g, ''))) return true;
  if (/09\d{9}/.test(text.replace(/\s|\D/g, ''))) return true;
  return false;
}
