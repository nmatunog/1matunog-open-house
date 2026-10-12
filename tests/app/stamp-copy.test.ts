import { describe, expect, it } from 'vitest';
import { stampConfirmCopy } from '../../src/guest/applyStamp';

describe('guest stamp confirmation copy', () => {
  it('says Station N stamped with progress', () => {
    expect(stampConfirmCopy('stamped', 3, 4, 6)).toEqual({
      title: 'Station 3 stamped!',
      subtitle: '4 of 6',
    });
  });

  it('duplicate scans say Already stamped and do not look like an error', () => {
    expect(stampConfirmCopy('already', 3, 4, 6)).toEqual({
      title: 'Already stamped',
      subtitle: 'Station 3 · 4 of 6',
    });
  });
});
