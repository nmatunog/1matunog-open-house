export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function normalizeBoothCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function hashBoothCode(code: string): Promise<string> {
  return sha256Hex(normalizeBoothCode(code));
}
