import { useState, useEffect, useRef, type RefObject } from 'react';

/**
 * Hook to detect scroll direction on mobile / window.
 * Returns true if the user is scrolling up or near the top of the page.
 * Returns false if the user is scrolling down.
 */
export function useScrollDirection(threshold: number = 8, scrollContainer?: RefObject<HTMLElement | null> | null): boolean {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const container = scrollContainer?.current ?? null;
    const scrollTarget = container ?? window;
    const readScrollY = () => container ? container.scrollTop : window.scrollY;
    lastScrollY.current = readScrollY();

    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = readScrollY();
          const delta = currentScrollY - lastScrollY.current;

          // Always visible near top of page
          if (currentScrollY <= 24) {
            setIsVisible(true);
          } else if (delta > threshold) {
            // Scrolling down -> hide tab bar
            setIsVisible(false);
          } else if (delta < -threshold) {
            // Scrolling up -> show tab bar
            setIsVisible(true);
          }

          lastScrollY.current = Math.max(0, currentScrollY);
          ticking.current = false;
        });
        ticking.current = true;
      }
    };

    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollTarget.removeEventListener('scroll', handleScroll);
  }, [threshold, scrollContainer]);

  return isVisible;
}
