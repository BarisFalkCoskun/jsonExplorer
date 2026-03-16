import { useCallback, useEffect, useMemo, useState } from "react";
import useResizeObserver from "hooks/useResizeObserver";

type VirtualGrid = {
  columnCount: number;
  endIndex: number;
  startIndex: number;
  totalHeight: number;
};

const DEFAULT_OVERSCAN_ROWS = 2;

export const calculateVirtualGrid = ({
  columnGap,
  enabled,
  itemCount,
  itemHeight,
  itemWidth,
  overscanRows = DEFAULT_OVERSCAN_ROWS,
  paddingBottom = 0,
  paddingTop = 0,
  rowGap,
  scrollTop,
  viewportHeight,
  viewportWidth,
}: {
  columnGap: number;
  enabled: boolean;
  itemCount: number;
  itemHeight: number;
  itemWidth: number;
  overscanRows?: number;
  paddingBottom?: number;
  paddingTop?: number;
  rowGap: number;
  scrollTop: number;
  viewportHeight: number;
  viewportWidth: number;
}): VirtualGrid => {
  const safeItemWidth = Math.max(1, Math.round(itemWidth) || 1);
  const safeItemHeight = Math.max(1, Math.round(itemHeight) || 1);
  const safeColumnGap = Math.max(0, Math.round(columnGap) || 0);
  const safeRowGap = Math.max(0, Math.round(rowGap) || 0);

  if (!enabled || itemCount === 0) {
    return {
      columnCount: 1,
      endIndex: Math.max(0, itemCount - 1),
      startIndex: 0,
      totalHeight: 0,
    };
  }

  const columnCount = Math.max(
    1,
    Math.floor((viewportWidth + safeColumnGap) / (safeItemWidth + safeColumnGap))
  );
  const rowSpan = safeItemHeight + safeRowGap;
  const visibleRowCount = Math.max(
    1,
    Math.ceil((viewportHeight || safeItemHeight) / rowSpan)
  );
  const firstVisibleRow = Math.max(
    0,
    Math.floor(Math.max(0, scrollTop - paddingTop) / rowSpan)
  );
  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const totalRows = Math.ceil(itemCount / columnCount);
  const endRow = Math.min(
    Math.max(0, totalRows - 1),
    firstVisibleRow + visibleRowCount + overscanRows - 1
  );

  return {
    columnCount,
    endIndex: Math.min(itemCount - 1, (endRow + 1) * columnCount - 1),
    startIndex: Math.min(itemCount - 1, startRow * columnCount),
    totalHeight:
      paddingTop +
      paddingBottom +
      totalRows * safeItemHeight +
      Math.max(0, totalRows - 1) * safeRowGap,
  };
};

const useVirtualGrid = (
  containerRef: React.RefObject<HTMLElement | null>,
  itemCount: number,
  itemWidth: number,
  itemHeight: number,
  rowGap: number,
  columnGap: number,
  enabled: boolean,
  paddingTop = 0,
  paddingBottom = 0,
  overscanRows = DEFAULT_OVERSCAN_ROWS
): VirtualGrid => {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const safeItemWidth = Math.max(1, Math.round(itemWidth) || 1);
  const safeItemHeight = Math.max(1, Math.round(itemHeight) || 1);
  const safeColumnGap = Math.max(0, Math.round(columnGap) || 0);
  const safeRowGap = Math.max(0, Math.round(rowGap) || 0);

  const updateViewportSize = useCallback((): void => {
    const container = containerRef.current;

    setViewportHeight(container?.clientHeight || 0);
    setViewportWidth(container?.clientWidth || 0);
  }, [containerRef]);

  useResizeObserver(
    containerRef.current,
    useCallback<ResizeObserverCallback>(() => {
      updateViewportSize();
    }, [updateViewportSize])
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

        updateViewportSize();
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
      updateViewportSize();
    }

    return cleanup;
  }, [containerRef, enabled, updateViewportSize]);

  return useMemo(
    () =>
      calculateVirtualGrid({
      columnGap: safeColumnGap,
      enabled,
      itemCount,
      itemHeight: safeItemHeight,
      itemWidth: safeItemWidth,
      overscanRows,
      paddingBottom,
      paddingTop,
      rowGap: safeRowGap,
      scrollTop,
      viewportHeight,
      viewportWidth,
      }),
    [
      enabled,
      itemCount,
      overscanRows,
      paddingBottom,
      paddingTop,
      safeColumnGap,
      safeItemHeight,
      safeItemWidth,
      safeRowGap,
      scrollTop,
      viewportHeight,
      viewportWidth,
    ]
  );
};

export default useVirtualGrid;
