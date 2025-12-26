import { useState, useEffect } from "react";
import { DEFAULT_INTERSECTION_OPTIONS } from "utils/constants";

// Shared observer per root element - prevents creating 100s of observers
type ObserverData = {
  observer: IntersectionObserver;
  callbacks: Map<Element, (isVisible: boolean) => void>;
};

const observerMap = new Map<Element | null, ObserverData>();

const getOrCreateObserver = (root: Element | null): ObserverData => {
  const existing = observerMap.get(root);
  if (existing) return existing;

  const callbacks = new Map<Element, (isVisible: boolean) => void>();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const callback = callbacks.get(entry.target);
        callback?.(entry.isIntersecting);
      });
    },
    { root, ...DEFAULT_INTERSECTION_OPTIONS }
  );

  const data = { observer, callbacks };
  observerMap.set(root, data);
  return data;
};

export const useIsVisible = (
  elementRef: React.RefObject<HTMLElement | null>,
  parentSelector?: string | React.RefObject<HTMLElement | null>,
  alwaysVisible = false
): boolean => {
  const [isVisible, setIsVisible] = useState(alwaysVisible);

  useEffect(() => {
    if (alwaysVisible || !elementRef.current) return;

    const element = elementRef.current;
    const root =
      (typeof parentSelector === "object" && parentSelector.current) ||
      (typeof parentSelector === "string" &&
        element.closest(parentSelector)) ||
      element.parentElement;

    const { observer, callbacks } = getOrCreateObserver(root);
    callbacks.set(element, setIsVisible);
    observer.observe(element);

    return () => {
      callbacks.delete(element);
      observer.unobserve(element);

      // Clean up observer if no more elements are being watched
      if (callbacks.size === 0) {
        observer.disconnect();
        observerMap.delete(root);
      }
    };
  }, [alwaysVisible, elementRef, parentSelector]);

  return isVisible;
};
