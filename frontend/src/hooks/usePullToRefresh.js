import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 72;

export function usePullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const distanceRef = useRef(0);

  useEffect(() => {
    function onTouchStart(e) {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    }

    function onTouchMove(e) {
      if (!pulling.current) return;
      const distance = e.touches[0].clientY - startY.current;
      if (distance > 0) {
        const clamped = Math.min(distance, THRESHOLD * 1.5);
        distanceRef.current = clamped;
        setPullDistance(clamped);
        e.preventDefault();
      } else {
        pulling.current = false;
        distanceRef.current = 0;
        setPullDistance(0);
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      if (distanceRef.current >= THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        distanceRef.current = 0;
        setPullDistance(0);
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return { pullDistance, refreshing, threshold: THRESHOLD };
}
