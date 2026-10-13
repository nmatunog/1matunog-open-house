import { useEffect, useRef, useState } from 'react';
import { buildReelStrip, prefersReducedMotion, reelDurationMs, reelOffsetPx } from '../lib/reel';

export function ProjectorReel({
  names,
  winner,
  durationMs,
  reducedMotion,
  onDone,
}: {
  names: string[];
  winner: string;
  durationMs?: number;
  reducedMotion?: boolean;
  onDone?: () => void;
}) {
  const reduce =
    reducedMotion ??
    prefersReducedMotion(
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null,
    );
  const duration = durationMs ?? reelDurationMs(names.length, reduce);
  const strip = buildReelStrip(names, winner);
  const [offset, setOffset] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    doneRef.current = false;
    setDone(false);
    if (reduce || duration <= 0) {
      setOffset(reelOffsetPx(1, strip.length));
      setDone(true);
      onDoneRef.current?.();
      return;
    }

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      setOffset(reelOffsetPx(progress, strip.length));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (!doneRef.current) {
        doneRef.current = true;
        setDone(true);
        onDoneRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, reduce, strip.length, winner]);

  if (reduce) {
    return (
      <div className="projector-reel projector-reel-fade" data-testid="projector-reel">
        <p
          className={`projector-reel-item font-black tracking-tight ${done ? 'projector-reel-winner-on' : ''}`}
          data-testid="projector-reel-winner"
        >
          {winner}
        </p>
      </div>
    );
  }

  return (
    <div className="projector-reel" data-testid="projector-reel">
      <div className="projector-reel-strip" style={{ transform: `translateY(-${offset}px)` }}>
        {strip.map((name, i) => {
          const isWinner = i === strip.length - 1;
          return (
            <p
              key={`${name}-${i}`}
              className={`projector-reel-item font-black tracking-tight ${
                isWinner && done ? 'projector-reel-winner-on' : ''
              }`}
              data-testid={isWinner ? 'projector-reel-winner' : undefined}
            >
              {name}
            </p>
          );
        })}
      </div>
    </div>
  );
}
