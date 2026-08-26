import { useEffect, useRef, useState } from "react";

/**
 * Lazy-mount helper for Player-in-list (S4-08 note): a card only mounts its
 * <Player> once it has been scrolled near the viewport — keeps ~10 cards
 * from holding 10 Remotion bundles at once.
 */
export function useInView<T extends HTMLElement>(rootMargin = "200px"): {
  ref: React.RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true); // test/jsdom fallback
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return { ref, inView };
}
