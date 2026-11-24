import { useEffect, useRef } from 'react';

/** Keep a fixed mobile nav against the visible viewport in iOS standalone mode. */
export function useBottomNavAnchor(enabled = true) {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!enabled || !nav) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const visualViewport = window.visualViewport;
      const visualBottom = visualViewport
        ? visualViewport.offsetTop + visualViewport.height
        : window.innerHeight;
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      // WebKit can exclude the home-indicator area from visualViewport in an installed app.
      const visibleBottom = standalone ? Math.max(visualBottom, window.innerHeight) : visualBottom;
      const transform = window.getComputedStyle(nav).transform;
      const translatedY = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
      const restingBottom = nav.getBoundingClientRect().bottom - translatedY;
      const gap = Math.round(visibleBottom - restingBottom);
      // A large gap is usually the software keyboard, not the PWA viewport offset.
      const offset = gap > 0 && gap < 160 ? gap : 0;
      nav.style.setProperty('--mobile-nav-viewport-offset', `${offset}px`);
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    window.visualViewport?.addEventListener('resize', schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      nav.style.removeProperty('--mobile-nav-viewport-offset');
    };
  }, [enabled]);

  return navRef;
}
