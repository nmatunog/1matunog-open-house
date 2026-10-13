import { projectorName } from './displayName';
import type { Checkin } from '../types';

export const REEL_DURATION_MS = 4500;
export const REEL_SHORT_DURATION_MS = 1600;
export const REEL_REDUCED_MS = 280;
export const REEL_ROW_PX = 104;
export const DRAW_HINT = 'Press DRAW or the space bar';

export function prefersReducedMotion(media: { matches: boolean } | null | undefined): boolean {
  return Boolean(media?.matches);
}

export function reelDurationMs(nameCount: number, reducedMotion: boolean): number {
  if (reducedMotion) return REEL_REDUCED_MS;
  return nameCount <= 1 ? REEL_SHORT_DURATION_MS : REEL_DURATION_MS;
}

export function reelNamesFromPool(pool: Checkin[]): string[] {
  return pool.map((c) => projectorName(c.name));
}

/** Strip of names for the slot. Last row is always the already-chosen winner. */
export function buildReelStrip(names: string[], winner: string, minRows = 24): string[] {
  const pool = names.length > 0 ? names : [winner];
  const strip: string[] = [];
  while (strip.length < minRows) {
    for (const name of pool) {
      strip.push(name);
      if (strip.length >= minRows) break;
    }
  }
  strip.push(winner);
  return strip;
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

export function reelOffsetPx(progress01: number, rowCount: number, rowHeight = REEL_ROW_PX): number {
  const lastIndex = Math.max(0, rowCount - 1);
  return easeOutCubic(progress01) * lastIndex * rowHeight;
}

export function reelFinalName(strip: string[], winner: string): string {
  return strip[strip.length - 1] === winner ? winner : winner;
}
