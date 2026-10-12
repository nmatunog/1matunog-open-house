import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectorName } from '../../src/components/ProjectorName';
import { SafeText } from '../../src/components/SafeText';

const xss = '<img src=x onerror=alert(1)>';

describe('XSS name renders as text', () => {
  it('shows a hostile name as text, not an image', () => {
    render(<SafeText as="h2" value={xss} />);
    expect(screen.getByText(xss)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('does not execute markup on the projector', () => {
    render(<ProjectorName displayName={xss} invitedBy={xss} />);
    expect(screen.getByText(xss)).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
