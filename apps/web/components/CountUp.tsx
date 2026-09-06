'use client';

import { useEffect, useState } from 'react';

/**
 * A number that draws in from 0 on first paint, then holds.
 *
 * DESIGN.md §7 allows a chart to draw in on first paint and forbids tickers.
 * This is the former: one run of 400ms, ending on the true value, never
 * looping, never re-triggered by scrolling. The denominator beside every
 * score stays static for the whole run, so the count-up never shows a number
 * without the coverage that qualifies it. prefers-reduced-motion skips
 * straight to the value.
 */
export const DRAW_MS = 400;

export function useCountUp(target: number, duration = DRAW_MS): number {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target) || target === 0) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setShown(Math.round(target * ease(p)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}

/** The moving figure for sighted readers; the true value for everyone else. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const shown = useCountUp(value);
  return (
    <>
      <span aria-hidden="true">
        {shown}
        {suffix}
      </span>
      <span className="visually-hidden">
        {value}
        {suffix}
      </span>
    </>
  );
}
