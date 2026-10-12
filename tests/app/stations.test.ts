import { describe, expect, it } from 'vitest';
import {
  buildStationMaterials,
  isUnsafeQrOrigin,
  parseStationPath,
  printedStationOrigin,
  printedStationQrUrl,
  PRODUCTION_SITE_ORIGIN,
  randomStationToken,
  stampDocId,
  stampKeyId,
  stationQrUrl,
  tokenBitLength,
} from '../../src/lib/stations';

describe('station QR tokens', () => {
  it('issues an unguessable token of at least 128 bits', () => {
    const token = randomStationToken();
    expect(tokenBitLength(token)).toBeGreaterThanOrEqual(128);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('printed cards encode the live Netlify guest URL, never localhost or Firebase', () => {
    expect(PRODUCTION_SITE_ORIGIN).toBe('https://aia-openhouse.netlify.app');
    expect(printedStationQrUrl('evt-1', 'deadbeef')).toBe(
      'https://aia-openhouse.netlify.app/s/evt-1/deadbeef',
    );
    expect(isUnsafeQrOrigin('https://aia-openhouse.netlify.app')).toBe(false);
    expect(isUnsafeQrOrigin('http://localhost:5173')).toBe(true);
    expect(isUnsafeQrOrigin('https://cma-dashboard-01.web.app')).toBe(true);
    expect(isUnsafeQrOrigin('https://deploy-preview-2--aia-openhouse.netlify.app')).toBe(true);
    expect(printedStationOrigin('http://localhost:5173')).toBe(PRODUCTION_SITE_ORIGIN);
    expect(stationQrUrl(PRODUCTION_SITE_ORIGIN, 'evt-1', 'aa')).toBe(
      'https://aia-openhouse.netlify.app/s/evt-1/aa',
    );
  });

  it('parses a scan path', () => {
    expect(parseStationPath('/s/evt-1/deadbeef')).toEqual({ eventId: 'evt-1', token: 'deadbeef' });
    expect(parseStationPath('/admin')).toBeNull();
  });

  it('never puts the plain token on the public event booth list', async () => {
    const materials = await buildStationMaterials('evt-1', [
      { id: 'booth-1', name: 'Products Solutions', code: 'ABC234' },
    ]);
    const token = materials.secrets[0]?.token ?? '';
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(materials.booths)).not.toContain(token);
    expect(materials.booths[0]).not.toHaveProperty('token');
    expect(materials.stampKeys).toHaveLength(2);
    expect(materials.stampKeys[0]?.id).toBe(await stampKeyId('evt-1', token));
    expect(materials.stampKeys[1]?.id).toBe(await stampKeyId('evt-1', 'ABC234'));
    expect(materials.stampKeys[0]?.boothId).toBe(materials.stampKeys[1]?.boothId);
    expect(materials.secrets[0]?.shortCode).toBe('ABC234');
    expect(materials.secrets[0]?.shortCode).toHaveLength(6);
  });

  it('uses anon uid + station id as the stamp document id', () => {
    expect(stampDocId('anon1', 'booth-3')).toBe('anon1_booth-3');
  });
});
