import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";
import { type RootFileSystem } from "contexts/fileSystem/useAsyncFs";
import {
  getProductImagePathExtension,
  isLikelyNonImageProductAsset,
} from "utils/mongoApi";
import {
  getPerfDuration,
  getPerfNow,
  isPerfDiagnosticsEnabled,
  logPerf,
} from "utils/perfDiagnostics";

interface MongoDBIconState {
  currentImageIndex: number;
  error: string | undefined;
  hasNavigationArrows: boolean;
  images: string[];
  isLoading: boolean;
  totalImageCount: number;
}

const INITIAL_STATE: MongoDBIconState = {
  currentImageIndex: 0,
  error: undefined,
  hasNavigationArrows: false,
  images: [],
  isLoading: false,
  totalImageCount: 0,
};

type ThumbnailDiagnostics = {
  cacheHits: number;
  cacheMisses: number;
  count: number;
  imageCountTotal: number;
  totalMs: number;
};

let thumbnailDiagnostics: ThumbnailDiagnostics = {
  cacheHits: 0,
  cacheMisses: 0,
  count: 0,
  imageCountTotal: 0,
  totalMs: 0,
};
let thumbnailDiagnosticsTimer = 0;

const recordThumbnailDiagnostics = ({
  cacheHit,
  durationMs,
  imageCount,
}: {
  cacheHit: boolean;
  durationMs: number;
  imageCount: number;
}): void => {
  if (!isPerfDiagnosticsEnabled() || typeof window === "undefined") return;

  thumbnailDiagnostics.count += 1;
  thumbnailDiagnostics.imageCountTotal += imageCount;
  thumbnailDiagnostics.totalMs += durationMs;

  if (cacheHit) {
    thumbnailDiagnostics.cacheHits += 1;
  } else {
    thumbnailDiagnostics.cacheMisses += 1;
  }

  if (thumbnailDiagnosticsTimer) return;

  thumbnailDiagnosticsTimer = window.setTimeout(() => {
    logPerf("mongo-thumbnail-cache", {
      avgMs: Number(
        (thumbnailDiagnostics.totalMs / thumbnailDiagnostics.count).toFixed(3)
      ),
      cacheHits: thumbnailDiagnostics.cacheHits,
      cacheMisses: thumbnailDiagnostics.cacheMisses,
      count: thumbnailDiagnostics.count,
      imageCountTotal: thumbnailDiagnostics.imageCountTotal,
    });

    thumbnailDiagnostics = {
      cacheHits: 0,
      cacheMisses: 0,
      count: 0,
      imageCountTotal: 0,
      totalMs: 0,
    };
    thumbnailDiagnosticsTimer = 0;
  }, 500);
};

/**
 * Find the MongoDB filesystem instance for a given path
 * @returns Object with mongoFS, mountPoint, and relativePath, or null if not found
 */
const findMongoDBFileSystem = (
  path: string,
  rootFs: RootFileSystem | null | undefined
):
  | {
      mongoFS: MongoDBFileSystem;
      mountPoint: string;
      relativePath: string;
    }
  | undefined => {
  if (!rootFs?.mntMap) return undefined;

  // Fast path: check if path starts with any known MongoDB mount point
  for (const [mountPoint, fs] of Object.entries(rootFs.mntMap)) {
    if (
      fs instanceof MongoDBFileSystem &&
      (path === mountPoint || path.startsWith(`${mountPoint}/`))
    ) {
      return {
        mongoFS: fs,
        mountPoint,
        relativePath: path.slice(mountPoint.length),
      };
    }
  }

  return undefined;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types -- hook return type is inferred
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

    const startedAt = getPerfNow();
    const { thumbnail, imageCount } = mongoData.mongoFS.getDocumentThumbnail(
      mongoData.relativePath
    );
    recordThumbnailDiagnostics({
      cacheHit: Boolean(thumbnail || imageCount > 0),
      durationMs: getPerfNow() - startedAt,
      imageCount,
    });
    if (thumbnail && isLikelyNonImageProductAsset(thumbnail)) {
      logPerf("mongo-thumbnail-non-image", {
        extension: getProductImagePathExtension(thumbnail),
        imageCount,
        path: mongoData.relativePath,
        thumbnail,
      });
    }

    // Only mark as loaded if cache had data; otherwise allow retry
    if (thumbnail || imageCount > 0) {
      hasLoadedRef.current = true;
    }

    setState((prev) => ({
      ...prev,
      currentImageIndex: 0,
      hasNavigationArrows: imageCount > 1,
      images: thumbnail ? [thumbnail] : [],
      totalImageCount: imageCount,
    }));
  }, [isMongoDocument, mongoData]);

  // Load full image array from network (called on arrow click)
  const loadImages = useCallback(async () => {
    if (!mongoData || !isMongoDocument() || isLoadingRef.current) return;

    const abortController = new AbortController();
    const startedAt = getPerfNow();
    loadingRef.current = abortController;
    isLoadingRef.current = true;

    setState((prev) => ({ ...prev, error: undefined, isLoading: true }));

    try {
      const images = await mongoData.mongoFS.getDocumentImages(
        mongoData.relativePath
      );

      if (abortController.signal.aborted) return;

      logPerf("mongo-images-load", {
        count: images.length,
        durationMs: getPerfDuration(startedAt),
        path: mongoData.relativePath,
      });
      const nonImageImages = images.filter((image) =>
        isLikelyNonImageProductAsset(image)
      );

      if (nonImageImages.length > 0) {
        logPerf("mongo-images-non-image", {
          count: nonImageImages.length,
          extensions: [
            ...new Set(
              nonImageImages
                .map((image) => getProductImagePathExtension(image))
                .filter(Boolean)
            ),
          ],
          path: mongoData.relativePath,
          samples: nonImageImages.slice(0, 5),
        });
      }

      hasFullImagesRef.current = true;
      isLoadingRef.current = false;

      setState((prev) => ({
        ...prev,
        currentImageIndex: 0,
        hasNavigationArrows: images.length > 1,
        images,
        isLoading: false,
        totalImageCount: images.length,
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
  const getCurrentImageUrl = useCallback((): string | undefined => {
    if (state.images.length === 0) return undefined;
    return state.images[state.currentImageIndex] || undefined;
  }, [state.images, state.currentImageIndex]);

  // Check if can navigate in direction
  const canGoToPrevious = state.currentImageIndex > 0;
  const canGoToNext =
    state.currentImageIndex <
    Math.max(state.totalImageCount, state.images.length) - 1;

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
  }, [path]); // eslint-disable-line react-hooks-addons/no-unused-deps -- path reset is intentional

  // Abort on unmount
  useEffect(
    () => () => {
      if (loadingRef.current) {
        loadingRef.current.abort();
      }
    },
    []
  );

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
