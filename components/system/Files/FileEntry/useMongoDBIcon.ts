import { useCallback, useEffect, useRef, useState } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";
import { type RootFileSystem } from "contexts/fileSystem/useAsyncFs";

interface MongoDBIconState {
  images: string[];
  currentImageIndex: number;
  isLoading: boolean;
  error: string | null;
  hasNavigationArrows: boolean;
}

const INITIAL_STATE: MongoDBIconState = {
  images: [],
  currentImageIndex: 0,
  isLoading: false,
  error: null,
  hasNavigationArrows: false,
};

/**
 * Find the MongoDB filesystem instance for a given path
 * @returns Object with mongoFS, mountPoint, and relativePath, or null if not found
 */
const findMongoDBFileSystem = (
  path: string,
  rootFs: RootFileSystem | null | undefined
): { mongoFS: MongoDBFileSystem; mountPoint: string; relativePath: string } | null => {
  if (!rootFs) return null;

  const pathParts = path.split("/");
  let currentPath = "/";

  for (let i = 1; i < pathParts.length; i++) {
    currentPath = `${currentPath}${pathParts[i]}/`.replace(/\/+/g, "/");
    const mountPoint = currentPath.slice(0, -1);

    if (rootFs.mntMap && rootFs.mntMap[mountPoint]) {
      const fs = rootFs.mntMap[mountPoint];
      if (fs instanceof MongoDBFileSystem) {
        return {
          mongoFS: fs,
          mountPoint,
          relativePath: path.replace(mountPoint, ""),
        };
      }
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

  // Check if this is a MongoDB document
  const isMongoDocument = useCallback(() => {
    const mongoData = findMongoDBFileSystem(path, rootFs);
    if (!mongoData) return false;

    return mongoData.mongoFS.isMongoDBDocument(mongoData.relativePath);
  }, [path, rootFs]);

  // Load images from MongoDB document
  const loadImages = useCallback(async () => {
    if (!isMongoDocument() || !rootFs || isLoadingRef.current) return;

    const abortController = new AbortController();
    loadingRef.current = abortController;
    isLoadingRef.current = true;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Find the MongoDB filesystem instance for this path
      const mongoData = findMongoDBFileSystem(path, rootFs);

      if (!mongoData) {
        setState(prev => ({ ...prev, isLoading: false, error: "MongoDB filesystem not found" }));
        isLoadingRef.current = false;
        return;
      }

      // Get images for the document
      const images = await mongoData.mongoFS.getDocumentImages(mongoData.relativePath);

      if (abortController.signal.aborted) return;

      hasLoadedRef.current = true;
      isLoadingRef.current = false;

      setState(prev => ({
        ...prev,
        images,
        isLoading: false,
        hasNavigationArrows: images.length > 1,
        currentImageIndex: 0,
      }));
    } catch (error) {
      if (abortController.signal.aborted) return;

      isLoadingRef.current = false;
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [isMongoDocument, path, rootFs]);

  // Navigate to previous image
  const goToPreviousImage = useCallback(() => {
    setState(prev => {
      if (prev.images.length <= 1 || prev.currentImageIndex <= 0) return prev;

      return {
        ...prev,
        currentImageIndex: prev.currentImageIndex - 1,
      };
    });
  }, []);

  // Navigate to next image
  const goToNextImage = useCallback(() => {
    setState(prev => {
      if (prev.images.length <= 1 || prev.currentImageIndex >= prev.images.length - 1) return prev;

      return {
        ...prev,
        currentImageIndex: prev.currentImageIndex + 1,
      };
    });
  }, []);

  // Get current image URL
  const getCurrentImageUrl = useCallback(() => {
    if (state.images.length === 0) return null;
    return state.images[state.currentImageIndex] || null;
  }, [state.images, state.currentImageIndex]);

  // Check if can navigate in direction
  const canGoToPrevious = state.currentImageIndex > 0;
  const canGoToNext = state.currentImageIndex < state.images.length - 1;

  // Only load images when visible and not already loaded
  useEffect(() => {
    if (visible && !hasLoadedRef.current && !isLoadingRef.current) {
      loadImages();
    }
  }, [visible, loadImages]);

  // Abort on unmount
  useEffect(() => {
    return () => {
      if (loadingRef.current) {
        loadingRef.current.abort();
      }
    };
  }, []);

  // Reset when path changes
  useEffect(() => {
    if (loadingRef.current) {
      loadingRef.current.abort();
    }
    hasLoadedRef.current = false;
    isLoadingRef.current = false;
    setState(INITIAL_STATE);
  }, [path]);

  return {
    ...state,
    isMongoDocument: isMongoDocument(),
    getCurrentImageUrl,
    goToPreviousImage,
    goToNextImage,
    canGoToPrevious,
    canGoToNext,
    loadImages,
  };
};
