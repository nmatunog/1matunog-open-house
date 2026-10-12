import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectorName } from '../../src/components/ProjectorName';
import { projectorName } from '../../src/lib/displayName';

describe('projector hides phone and email', () => {
  it('shows first name + last initial and agent only', () => {
    render(
      <ProjectorName
        displayName={projectorName('Juan Dela Cruz')}
        invitedBy="Ana Reyes"
      />,
    );
    expect(screen.getByText('JUAN C.')).toBeInTheDocument();
    expect(screen.getByText('Invited by Ana Reyes')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('@');
    expect(document.body.textContent).not.toMatch(/09\d{9}/);
    expect(document.body.textContent).not.toContain('+63');
  });

  it('has no phone or email props on the projector component type surface', () => {
    const el = (
      <ProjectorName displayName="MARIA S." invitedBy="Leo" />
    );
    render(el);
    expect(screen.queryByText('maria@example.com')).toBeNull();
    expect(screen.queryByText('+639171234567')).toBeNull();
  });
});
