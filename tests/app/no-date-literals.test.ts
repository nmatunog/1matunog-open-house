import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx|css|html)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe('no hard-coded event date literals in app code', () => {
  it('src has no Mar 20 / 2026-03-20 literals', () => {
    const files = walk(join(process.cwd(), 'src'));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (/Mar 20|2026-03-20/.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  it('station QR URLs are built from window.location.origin, not a hard-coded host', () => {
    const print = readFileSync(join(process.cwd(), 'src/admin/PrintStationCards.tsx'), 'utf8');
    const stations = readFileSync(join(process.cwd(), 'src/lib/stations.ts'), 'utf8');
    expect(print).toContain('window.location.origin');
    expect(print).not.toMatch(/https:\/\/[a-z0-9.-]+/i);
    expect(stations).toContain('origin.replace');
    expect(stations).not.toMatch(/https:\/\/[a-z0-9.-]+/i);
  });
});
