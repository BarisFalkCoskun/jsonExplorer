import { useCallback, useEffect, useRef, useState } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";

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

export const useMongoDBIcon = (path: string) => {
  const [state, setState] = useState<MongoDBIconState>(INITIAL_STATE);
  const { rootFs } = useFileSystem();
  const loadingRef = useRef<AbortController | null>(null);
  const imageCache = useRef<Map<string, string>>(new Map());

  // Check if this is a MongoDB document
  const isMongoDocument = useCallback(() => {
    if (!rootFs) return false;

    // Check if the path is within a MongoDB mount
    const pathParts = path.split("/");
    if (pathParts.length < 2) return false;

    // Find the mount point for this path
    let currentPath = "/";
    for (let i = 1; i < pathParts.length; i++) {
      currentPath = `${currentPath}${pathParts[i]}/`.replace(/\/+/g, "/");
      const mountPoint = currentPath.slice(0, -1);

      if (rootFs.mntMap && rootFs.mntMap[mountPoint]) {
        const fs = rootFs.mntMap[mountPoint];
        if (fs instanceof MongoDBFileSystem) {
          return fs.isMongoDBDocument(path.replace(mountPoint, ""));
        }
      }
    }

    return false;
  }, [path, rootFs]);

  // Load images from MongoDB document
  const loadImages = useCallback(async () => {
    if (!isMongoDocument() || !rootFs) return;

    // Abort any existing loading
    if (loadingRef.current) {
      loadingRef.current.abort();
    }

    const abortController = new AbortController();
    loadingRef.current = abortController;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Find the MongoDB filesystem instance for this path
      let mongoFS: MongoDBFileSystem | null = null;
      let relativePath = path;

      const pathParts = path.split("/");
      let currentPath = "/";

      for (let i = 1; i < pathParts.length; i++) {
        currentPath = `${currentPath}${pathParts[i]}/`.replace(/\/+/g, "/");
        const mountPoint = currentPath.slice(0, -1);

        if (rootFs.mntMap && rootFs.mntMap[mountPoint]) {
          const fs = rootFs.mntMap[mountPoint];
          if (fs instanceof MongoDBFileSystem) {
            mongoFS = fs;
            relativePath = path.replace(mountPoint, "");
            break;
          }
        }
      }

      if (!mongoFS) {
        setState(prev => ({ ...prev, isLoading: false, error: "MongoDB filesystem not found" }));
        return;
      }

      // Get images for the document
      const images = await mongoFS.getDocumentImages(relativePath);

      if (abortController.signal.aborted) return;

      setState(prev => ({
        ...prev,
        images,
        isLoading: false,
        hasNavigationArrows: images.length > 1,
        currentImageIndex: 0,
      }));

      // Preload the first few images
      if (images.length > 0) {
        preloadImages(images.slice(0, Math.min(3, images.length)));
      }
    } catch (error) {
      if (abortController.signal.aborted) return;

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [isMongoDocument, path, rootFs]);

  // Preload images for better performance
  const preloadImages = useCallback((imageUrls: string[]) => {
    imageUrls.forEach(url => {
      if (!imageCache.current.has(url)) {
        const img = new Image();
        img.onload = () => {
          imageCache.current.set(url, url);
        };
        img.onerror = () => {
          console.warn(`Failed to preload image: ${url}`);
        };
        img.src = url;
      }
    });
  }, []);

  // Navigate to previous image
  const goToPreviousImage = useCallback(() => {
    setState(prev => {
      if (prev.images.length <= 1 || prev.currentImageIndex <= 0) return prev;

      const newIndex = prev.currentImageIndex - 1;

      // Preload previous image if available
      if (newIndex > 0 && prev.images[newIndex - 1]) {
        preloadImages([prev.images[newIndex - 1]]);
      }

      return {
        ...prev,
        currentImageIndex: newIndex,
      };
    });
  }, [preloadImages]);

  // Navigate to next image
  const goToNextImage = useCallback(() => {
    setState(prev => {
      if (prev.images.length <= 1 || prev.currentImageIndex >= prev.images.length - 1) return prev;

      const newIndex = prev.currentImageIndex + 1;

      // Preload next image if available
      if (newIndex < prev.images.length - 1 && prev.images[newIndex + 1]) {
        preloadImages([prev.images[newIndex + 1]]);
      }

      return {
        ...prev,
        currentImageIndex: newIndex,
      };
    });
  }, [preloadImages]);

  // Get current image URL
  const getCurrentImageUrl = useCallback(() => {
    if (state.images.length === 0) return null;
    return state.images[state.currentImageIndex] || null;
  }, [state.images, state.currentImageIndex]);

  // Check if can navigate in direction
  const canGoToPrevious = state.currentImageIndex > 0;
  const canGoToNext = state.currentImageIndex < state.images.length - 1;

  // Load images when path changes or component mounts
  useEffect(() => {
    loadImages();

    // Cleanup on unmount or path change
    return () => {
      if (loadingRef.current) {
        loadingRef.current.abort();
      }
    };
  }, [loadImages]);

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