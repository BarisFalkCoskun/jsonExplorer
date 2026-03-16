import { useCallback, useEffect, useMemo, useState } from "react";
import useResizeObserver from "hooks/useResizeObserver";

type VirtualRows = {
  bottomOffset: number;
  endIndex: number;
  startIndex: number;
  topOffset: number;
};

const DEFAULT_OVERSCAN = 8;

export const calculateVirtualRows = ({
  enabled,
  itemCount,
  overscan = DEFAULT_OVERSCAN,
  rowHeight,
  scrollTop,
  viewportHeight,
}: {
  enabled: boolean;
  itemCount: number;
  overscan?: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}): VirtualRows => {
  const safeRowHeight = Math.max(1, Math.round(rowHeight) || 1);

  if (!enabled || itemCount === 0) {
    return {
      bottomOffset: 0,
      endIndex: Math.max(0, itemCount - 1),
      startIndex: 0,
      topOffset: 0,
    };
  }

  const visibleCount = Math.max(
    1,
    Math.ceil((viewportHeight || safeRowHeight) / safeRowHeight)
  );
  const firstVisibleIndex = Math.max(0, Math.floor(scrollTop / safeRowHeight));
  const startIndex = Math.max(0, firstVisibleIndex - overscan);
  const endIndex = Math.min(
    itemCount - 1,
    firstVisibleIndex + visibleCount + overscan - 1
  );

  return {
    bottomOffset: Math.max(0, (itemCount - endIndex - 1) * safeRowHeight),
    endIndex,
    startIndex,
    topOffset: startIndex * safeRowHeight,
  };
};

const useVirtualRows = (
  containerRef: React.RefObject<HTMLElement | null>,
  itemCount: number,
  rowHeight: number,
  enabled: boolean,
  overscan = DEFAULT_OVERSCAN
): VirtualRows => {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const safeRowHeight = Math.max(1, Math.round(rowHeight) || 1);

  const updateViewportHeight = useCallback((): void => {
    setViewportHeight(containerRef.current?.clientHeight || 0);
  }, [containerRef]);

  useResizeObserver(
    containerRef.current,
    useCallback<ResizeObserverCallback>(() => {
      updateViewportHeight();
    }, [updateViewportHeight])
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (enabled) {
      const container = containerRef.current;

      if (container) {
        let animationFrame = 0;
        const updateScrollPosition = (): void => {
          animationFrame = 0;
          setScrollTop(container.scrollTop);
        };
        const onScroll = (): void => {
          if (!animationFrame) {
            animationFrame = window.requestAnimationFrame(updateScrollPosition);
          }
        };

        updateViewportHeight();
        setScrollTop(container.scrollTop);
        container.addEventListener("scroll", onScroll, { passive: true });

        cleanup = (): void => {
          if (animationFrame) {
            window.cancelAnimationFrame(animationFrame);
          }
          container.removeEventListener("scroll", onScroll);
        };
      }
    } else {
      setScrollTop(0);
      updateViewportHeight();
    }

    return cleanup;
  }, [containerRef, enabled, updateViewportHeight]);

  return useMemo(
    () =>
      calculateVirtualRows({
      enabled,
      itemCount,
      overscan,
      rowHeight: safeRowHeight,
      scrollTop,
      viewportHeight,
      }),
    [enabled, itemCount, overscan, safeRowHeight, scrollTop, viewportHeight]
  );
};

export default useVirtualRows;
