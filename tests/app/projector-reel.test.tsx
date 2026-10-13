import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectorReel } from '../../src/admin/ProjectorReel';
import { DRAW_HINT, buildReelStrip } from '../../src/lib/reel';
import { projectorName } from '../../src/lib/displayName';
import { ProjectorName } from '../../src/components/ProjectorName';

describe('projector draw reel', () => {
  it('ends the strip on the already-chosen winner', () => {
    const names = ['JUAN D.', 'MARIA S.', 'TEST S.'];
    const strip = buildReelStrip(names, 'TEST S.');
    expect(strip[strip.length - 1]).toBe('TEST S.');
    expect(projectorName('Test Student')).toBe('TEST S.');
  });

  it('shows the drawn winner as the final displayed name', async () => {
    const onDone = vi.fn();
    render(
      <ProjectorReel
        names={['JUAN D.', 'MARIA S.', 'TEST S.']}
        winner="TEST S."
        durationMs={0}
        reducedMotion={false}
        onDone={onDone}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('projector-reel-winner')).toHaveTextContent('TEST S.');
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('still shows the winner after a short spin when only one name is eligible', async () => {
    render(<ProjectorReel names={['TEST S.']} winner="TEST S." durationMs={0} reducedMotion={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('projector-reel-winner')).toHaveTextContent('TEST S.');
    });
  });

  it('uses a fade when reduced motion is on, still ending on the winner', async () => {
    render(
      <ProjectorReel names={['JUAN D.', 'TEST S.']} winner="TEST S." reducedMotion durationMs={0} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('projector-reel-winner')).toHaveTextContent('TEST S.');
    });
  });
});

describe('projector idle hint', () => {
  it('shows Press DRAW or the space bar without Invited by', () => {
    render(
      <>
        <ProjectorName displayName="READY?" large />
        <p>{DRAW_HINT}</p>
      </>,
    );
    expect(screen.getByText('Press DRAW or the space bar')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Invited by Press/);
    expect(document.body.textContent).not.toMatch(/\bCMA\b/);
  });
});
