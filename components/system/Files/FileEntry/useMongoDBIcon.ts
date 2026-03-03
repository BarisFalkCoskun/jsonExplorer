import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";
import { type RootFileSystem } from "contexts/fileSystem/useAsyncFs";

interface MongoDBIconState {
  currentImageIndex: number;
  error: string | null;
  hasNavigationArrows: boolean;
  images: string[];
  isLoading: boolean;
}

const INITIAL_STATE: MongoDBIconState = {
  currentImageIndex: 0,
  error: null,
  hasNavigationArrows: false,
  images: [],
  isLoading: false,
};

/**
 * Find the MongoDB filesystem instance for a given path
 * @returns Object with mongoFS, mountPoint, and relativePath, or null if not found
 */
const findMongoDBFileSystem = (
  path: string,
  rootFs: RootFileSystem | null | undefined
): {
  mongoFS: MongoDBFileSystem;
  mountPoint: string;
  relativePath: string;
} | null => {
  if (!rootFs?.mntMap) return null;

  // Fast path: check if path starts with any known MongoDB mount point
  for (const [mountPoint, fs] of Object.entries(rootFs.mntMap)) {
    if (fs instanceof MongoDBFileSystem &&
        (path === mountPoint || path.startsWith(`${mountPoint  }/`))) {
      return {
        mongoFS: fs,
        mountPoint,
        relativePath: path.slice(mountPoint.length),
      };
    }
  }

  return null;
};

export const useMongoDBIcon = (path: string, visible = false) => {
  const [state, setState] = useState<MongoDBIconState>(INITIAL_STATE);
  const { rootFs } = useFileSystem();
  const loadingRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const hasFullImagesRef = useRef(false);

  const mongoData = useMemo(
    () => findMongoDBFileSystem(path, rootFs),
    [path, rootFs]
  );

  // Check if this is a MongoDB document
  const isMongoDocument = useCallback(() => {
    if (!mongoData) return false;

    return mongoData.mongoFS.isMongoDBDocument(mongoData.relativePath);
  }, [mongoData]);

  // Load thumbnail from cache (synchronous, zero network)
  const loadThumbnail = useCallback(() => {
    if (!mongoData || !isMongoDocument() || hasLoadedRef.current) return;

    const { thumbnail, imageCount } = mongoData.mongoFS.getDocumentThumbnail(
      mongoData.relativePath
    );

    // Only mark as loaded if cache had data; otherwise allow retry
    if (thumbnail || imageCount > 0) {
      hasLoadedRef.current = true;
    }

    setState((prev) => ({
      ...prev,
      currentImageIndex: 0,
      hasNavigationArrows: imageCount > 1,
      images: thumbnail ? [thumbnail] : [],
    }));
  }, [isMongoDocument, mongoData]);

  // Load full image array from network (called on arrow click)
  const loadImages = useCallback(async () => {
    if (!mongoData || !isMongoDocument() || isLoadingRef.current) return;

    const abortController = new AbortController();
    loadingRef.current = abortController;
    isLoadingRef.current = true;

    setState((prev) => ({ ...prev, error: null, isLoading: true }));

    try {
      const images = await mongoData.mongoFS.getDocumentImages(
        mongoData.relativePath
      );

      if (abortController.signal.aborted) return;

      hasFullImagesRef.current = true;
      isLoadingRef.current = false;

      setState((prev) => ({
        ...prev,
        currentImageIndex: 0,
        hasNavigationArrows: images.length > 1,
        images,
        isLoading: false,
      }));
    } catch (error) {
      if (abortController.signal.aborted) return;

      isLoadingRef.current = false;
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        isLoading: false,
      }));
    }
  }, [isMongoDocument, mongoData]);

  // Navigate to previous image — fetch full images first if needed
  const goToPreviousImage = useCallback(() => {
    if (!hasFullImagesRef.current) {
      loadImages();
      return;
    }

    setState((prev) => {
      if (prev.images.length <= 1 || prev.currentImageIndex <= 0) return prev;

      return {
        ...prev,
        currentImageIndex: prev.currentImageIndex - 1,
      };
    });
  }, [loadImages]);

  // Navigate to next image — fetch full images first if needed
  const goToNextImage = useCallback(() => {
    if (!hasFullImagesRef.current) {
      loadImages();
      return;
    }

    setState((prev) => {
      if (
        prev.images.length <= 1 ||
        prev.currentImageIndex >= prev.images.length - 1
      ) {
        return prev;
      }

      return {
        ...prev,
        currentImageIndex: prev.currentImageIndex + 1,
      };
    });
  }, [loadImages]);

  // Get current image URL
  const getCurrentImageUrl = useCallback(() => {
    if (state.images.length === 0) return null;
    return state.images[state.currentImageIndex] || null;
  }, [state.images, state.currentImageIndex]);

  // Check if can navigate in direction
  const canGoToPrevious = state.currentImageIndex > 0;
  const canGoToNext = state.currentImageIndex < state.images.length - 1;

  // Reset when path changes — MUST be declared before visibility effect
  // so React runs it first when path changes
  useEffect(() => {
    if (loadingRef.current) {
      loadingRef.current.abort();
    }
    hasLoadedRef.current = false;
    isLoadingRef.current = false;
    hasFullImagesRef.current = false;
    setState(INITIAL_STATE);
  }, [path]);

  // Abort on unmount
  useEffect(() => () => {
      if (loadingRef.current) {
        loadingRef.current.abort();
      }
    }, []);

  // Load thumbnail from cache when visible (zero network)
  useEffect(() => {
    if (visible && !hasLoadedRef.current) {
      loadThumbnail();
    }
  }, [visible, loadThumbnail]);

  return {
    ...state,
    canGoToNext,
    canGoToPrevious,
    getCurrentImageUrl,
    goToNextImage,
    goToPreviousImage,
    isMongoDocument: isMongoDocument(),
    loadImages,
  };
};
