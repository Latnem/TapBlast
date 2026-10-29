import { useLayoutEffect, type DependencyList, type RefObject } from 'react';
import gsap from 'gsap';

/* Small GSAP helpers. Animations are skipped for people who ask their device
   to reduce motion. */

export const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs `build` inside a gsap.context scoped to `scope`, re-running when `deps`
 * change, and reverts the animations on cleanup (safe with React StrictMode).
 */
export function useGsap(scope: RefObject<HTMLElement>, build: (q: (selector: string) => Element[]) => void, deps: DependencyList) {
  useLayoutEffect(() => {
    if (!scope.current || reducedMotion()) return;
    const ctx = gsap.context(() => build(gsap.utils.selector(scope.current) as (s: string) => Element[]), scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Counts a number up inside `el` from `from` to `to`. */
export function countUp(el: Element | null, from: number, to: number, duration = 0.9) {
  if (!el || from === to || reducedMotion()) return;
  const obj = { v: from };
  return gsap.to(obj, {
    v: to,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = String(Math.round(obj.v));
    },
  });
}

export { gsap };
