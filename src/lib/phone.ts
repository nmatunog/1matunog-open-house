/** Normalize Philippine mobile numbers to +639XXXXXXXXX. */
export function normalizePhPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let local: string | null = null;
  if (digits.startsWith('63') && digits.length === 12) {
    local = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    local = digits.slice(1);
  } else if (digits.length === 10) {
    local = digits;
  }
  if (!local || !/^9[0-9]{9}$/.test(local)) return null;
  return `+63${local}`;
}

export function isValidPhPhone(input: string): boolean {
  return normalizePhPhone(input) !== null;
}

/** Format as 09XX XXX XXXX while typing. */
export function formatPhoneInput(input: string): string {
  const digits = input.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('63')) local = '0' + local.slice(2);
  if (!local.startsWith('0') && local.startsWith('9')) local = '0' + local;
  local = local.slice(0, 11);
  const a = local.slice(0, 4);
  const b = local.slice(4, 7);
  const c = local.slice(7, 11);
  return [a, b, c].filter(Boolean).join(' ');
}
