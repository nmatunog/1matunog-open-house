import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StationPrintCard } from '../../src/admin/PrintStationCards';
import { stampConfirmCopy } from '../../src/guest/applyStamp';

describe('station print card branding', () => {
  it('shows 1Matunog District, station number, event, and a small backup code', () => {
    render(
      <StationPrintCard
        stationNo={3}
        name="Internship Program"
        eventLabel="Open House · Sat, Nov 14"
        shortCode="K7MP2Q"
        qrDataUrl="data:image/png;base64,xx"
      />,
    );
    expect(screen.getByText('1Matunog District')).toBeInTheDocument();
    expect(screen.getByText('Open House Passport')).toBeInTheDocument();
    expect(screen.getByText('Station 3')).toBeInTheDocument();
    expect(screen.getByText('Internship Program')).toBeInTheDocument();
    expect(screen.getByText('Open House · Sat, Nov 14')).toBeInTheDocument();
    expect(screen.getByText("Can't scan? Code K7MP2Q")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bCMA\b/);
  });
});

describe('guest scan confirmation', () => {
  it('matches the locked friendly copy', () => {
    expect(stampConfirmCopy('stamped', 3, 4, 6).title).toBe('Station 3 stamped!');
    expect(stampConfirmCopy('stamped', 3, 4, 6).subtitle).toBe('4 of 6');
    expect(stampConfirmCopy('already', 3, 4, 6).title).toBe('Already stamped');
  });
});
