import { useEffect, useRef, useState } from "react";

/** Live-updating `(prefers-reduced-motion: reduce)` flag. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

/**
 * Eases a displayed number toward `target` so a readout settles like a meter
 * instead of snapping between samples. A `null` target means "nothing to show"
 * and is passed straight through. Interrupted mid-tween, it continues from the
 * value currently on screen rather than jumping. Honors reduced motion by
 * snapping to the target with no animation.
 */
export function useCountUp(target: number | null, durationMs = 450): number | null {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState<number | null>(target);
  const valueRef = useRef<number>(target ?? 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const cancel = (): void => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    if (target === null) {
      cancel();
      valueRef.current = 0;
      setValue(null);
      return;
    }
    if (reduced) {
      cancel();
      valueRef.current = target;
      setValue(target);
      return;
    }

    const from = valueRef.current;
    const delta = target - from;
    if (delta === 0) {
      setValue(target);
      return;
    }

    cancel();
    let start = 0;
    const step = (timestamp: number): void => {
      if (start === 0) {
        start = timestamp;
      }
      const progress = Math.min(1, (timestamp - start) / durationMs);
      const next = from + delta * easeOutQuint(progress);
      valueRef.current = next;
      setValue(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        valueRef.current = target;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return cancel;
  }, [target, reduced, durationMs]);

  return value;
}
