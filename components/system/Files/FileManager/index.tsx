import { basename, join } from "path";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "styled-components";
import StyledLoading from "components/system/Apps/StyledLoading";
import StatusBar from "components/system/Files/FileManager/StatusBar";
import {
  DEFAULT_COLUMNS,
  type Columns as ColumnsObject,
} from "components/system/Files/FileManager/Columns/constants";
import FileEntry from "components/system/Files/FileEntry";
import StyledSelection from "components/system/Files/FileManager/Selection/StyledSelection";
import useSelection from "components/system/Files/FileManager/Selection/useSelection";
import useDraggableEntries from "components/system/Files/FileManager/useDraggableEntries";
import useFileDrop from "components/system/Files/FileManager/useFileDrop";
import useFileKeyboardShortcuts from "components/system/Files/FileManager/useFileKeyboardShortcuts";
import useFocusableEntries from "components/system/Files/FileManager/useFocusableEntries";
import useFolder from "components/system/Files/FileManager/useFolder";
import useFolderContextMenu from "components/system/Files/FileManager/useFolderContextMenu";
import useVirtualGrid from "components/system/Files/FileManager/useVirtualGrid";
import useVirtualRows from "components/system/Files/FileManager/useVirtualRows";
import {
  type FileManagerViewNames,
  FileManagerViews,
} from "components/system/Files/Views";
import { useFileSystem } from "contexts/fileSystem";
import { ICON_ZOOM_LEVELS } from "components/system/Files/FileManager/constants";
import {
  FOCUSABLE_ELEMENT,
  MOUNTABLE_EXTENSIONS,
  PREVENT_SCROLL,
  SHORTCUT_EXTENSION,
} from "utils/constants";
import { getExtension, haltEvent } from "utils/functions";
import Columns from "components/system/Files/FileManager/Columns";
import { useSession } from "contexts/session";
import { getMountUrl } from "contexts/fileSystem/core";
import { MongoDBFileSystem } from "contexts/fileSystem/MongoDBFS";
import { useToast } from "components/system/Toast/useToast";

const QuickLook = dynamic(
  () => import("components/system/Files/FileManager/QuickLook/QuickLook"),
  { ssr: false }
);

const StyledEmpty = dynamic(
  () => import("components/system/Files/FileManager/StyledEmpty")
);

type FileManagerProps = {
  allowMovingDraggableEntries?: boolean;
  hideFolders?: boolean;
  hideLoading?: boolean;
  hideScrolling?: boolean;
  hideShortcutIcons?: boolean;
  id?: string;
  isDesktop?: boolean;
  isStartMenu?: boolean;
  loadIconsImmediately?: boolean;
  readOnly?: boolean;
  showStatusBar?: boolean;
  skipFsWatcher?: boolean;
  skipSorting?: boolean;
  url: string;
};

const DEFAULT_VIEW = "icon";
const ROW_VIRTUALIZATION_THRESHOLD = 150;
const ICON_GRID_VIRTUALIZATION_THRESHOLD = 80;

const FileManager: FC<FileManagerProps> = ({
  allowMovingDraggableEntries,
  hideFolders,
  hideLoading,
  hideScrolling,
  hideShortcutIcons,
  id,
  isDesktop,
  isStartMenu,
  loadIconsImmediately,
  readOnly,
  showStatusBar,
  skipFsWatcher,
  skipSorting,
  url,
}) => {
  const { hideCategorized, hideDismissed, iconZoomLevel, setHideCategorized, setHideDismissed, setIconZoomLevel, views, setViews } = useSession();
  const { showToast } = useToast();
  const view = useMemo(() => {
    if (isDesktop) return "icon";
    if (isStartMenu) return "list";

    return views[url] || DEFAULT_VIEW;
  }, [isDesktop, isStartMenu, url, views]);
  const isDetailsView = useMemo(() => view === "details", [view]);
  const [columns, setColumns] = useState<ColumnsObject | undefined>(() =>
    isDetailsView ? DEFAULT_COLUMNS : undefined
  );
  const [currentUrl, setCurrentUrl] = useState(url);
  const [renaming, setRenaming] = useState("");
  const [mounted, setMounted] = useState<boolean>(false);
  const fileManagerRef = useRef<HTMLOListElement | null>(null);
  const isFileExplorerIconView = useMemo(
    () => !isStartMenu && !isDesktop && !isDetailsView,
    [isDesktop, isDetailsView, isStartMenu]
  );
  const { focusedEntries, focusableEntry, ...focusFunctions } =
    useFocusableEntries(fileManagerRef, isFileExplorerIconView);
  const { fileActions, files, folderActions, hasMore, isLoading, loadMore, setFiles, updateFiles } =
    useFolder(url, setRenaming, focusFunctions, {
      hideFolders,
      hideLoading,
      isDesktop,
      skipFsWatcher,
      skipSorting,
    });
  const allFilesRef = useRef<{ files: NonNullable<typeof files>; key: string } | undefined>(undefined);
  const { lstat, mountFs, rootFs } = useFileSystem();
  const { mountUrl, isMongoFS, mongoFs } = useMemo(() => {
    const mUrl = rootFs?.mntMap ? getMountUrl(url, rootFs.mntMap) : undefined;
    const mFs = mUrl ? rootFs?.mntMap[mUrl] : undefined;
    const isMongo = mFs?.getName() === "MongoDBFS";
    return {
      isMongoFS: isMongo,
      mongoFs: isMongo ? (mFs as MongoDBFileSystem) : undefined,
      mountUrl: mUrl,
    };
  }, [rootFs?.mntMap, url]);
  const mongoCollection = useMemo(() => {
    if (!isMongoFS || !mountUrl) return { collection: "", database: "" };
    const relativePath = url.replace(`${mountUrl}/`, "").replace(mountUrl, "");
    const parts = relativePath.split("/").filter(Boolean);
    return { collection: parts[1] || "", database: parts[0] || "" };
  }, [isMongoFS, mountUrl, url]);
  const mongoIconMount = useMemo(
    () =>
      isMongoFS && mongoFs && mountUrl
        ? { mongoFS: mongoFs, mountPoint: mountUrl }
        : undefined,
    [isMongoFS, mongoFs, mountUrl]
  );
  const handleToggleHideCategorized = useCallback(() => {
    if (!mongoFs) return;

    const newHidden = !hideCategorized;
    setHideCategorized(newHidden);

    if (newHidden) {
      const cachedDocs = mongoFs.getCachedDocumentNames(mongoCollection.database, mongoCollection.collection);

      if (cachedDocs) {
        setFiles((currentFiles) => {
          if (!currentFiles) return currentFiles;

          if (!allFilesRef.current) {
            allFilesRef.current = { files: { ...currentFiles }, key: url };
          }

          const filtered: typeof currentFiles = {};

          for (const [name, stat] of Object.entries(currentFiles)) {
            const docName = name.replace(/\.json$/, "");

            if (!cachedDocs.has(docName)) {
              filtered[name] = stat;
            }
          }

          return filtered;
        });
      } else {
        updateFiles();
      }
    } else if (allFilesRef.current?.key === url) {
      if (hideDismissed) {
        const dismissedNames = mongoFs.getCachedDismissedNames(mongoCollection.database, mongoCollection.collection);

        if (dismissedNames) {
          setFiles(() => {
            const source = allFilesRef.current?.files;

            if (!source) return {};

            const filtered: typeof source = {};

            for (const [name, stat] of Object.entries(source)) {
              const docName = name.replace(/\.json$/, "");

              if (!dismissedNames.has(docName)) {
                filtered[name] = stat;
              }
            }

            return filtered;
          });
        } else {
          allFilesRef.current = undefined;
          updateFiles();
        }
      } else {
        setFiles(allFilesRef.current.files);
        allFilesRef.current = undefined;
      }
    } else {
      allFilesRef.current = undefined;
      updateFiles();
    }
  }, [hideCategorized, hideDismissed, mongoCollection, mongoFs, setFiles, setHideCategorized, updateFiles, url]);
  const handleToggleHideDismissed = useCallback(() => {
    if (!mongoFs) return;

    const newHidden = !hideDismissed;
    setHideDismissed(newHidden);

    if (newHidden) {
      const cachedDocs = mongoFs.getCachedDismissedNames(mongoCollection.database, mongoCollection.collection);

      if (cachedDocs) {
        setFiles((currentFiles) => {
          if (!currentFiles) return currentFiles;

          if (!allFilesRef.current) {
            allFilesRef.current = { files: { ...currentFiles }, key: url };
          }

          const filtered: typeof currentFiles = {};

          for (const [name, stat] of Object.entries(currentFiles)) {
            const docName = name.replace(/\.json$/, "");

            if (!cachedDocs.has(docName)) {
              filtered[name] = stat;
            }
          }

          return filtered;
        });
      } else {
        updateFiles();
      }
    } else if (allFilesRef.current?.key === url) {
      if (hideCategorized) {
        const categorizedNames = mongoFs.getCachedDocumentNames(mongoCollection.database, mongoCollection.collection);

        if (categorizedNames) {
          setFiles(() => {
            const source = allFilesRef.current?.files;

            if (!source) return {};

            const filtered: typeof source = {};

            for (const [name, stat] of Object.entries(source)) {
              const docName = name.replace(/\.json$/, "");

              if (!categorizedNames.has(docName)) {
                filtered[name] = stat;
              }
            }

            return filtered;
          });
        } else {
          allFilesRef.current = undefined;
          updateFiles();
        }
      } else {
        setFiles(allFilesRef.current.files);
        allFilesRef.current = undefined;
      }
    } else {
      allFilesRef.current = undefined;
      updateFiles();
    }
  }, [hideCategorized, hideDismissed, mongoCollection, mongoFs, setFiles, setHideDismissed, updateFiles, url]);
  const handleDismiss = useCallback(
    async (entries: string[]) => {
      if (!mongoFs) return;

      const documentNames = entries.map((entry) => entry.replace(/\.json$/, ""));
      const { succeeded, failed } = await mongoFs
        .patchDocuments(
          mongoCollection.database,
          mongoCollection.collection,
          documentNames,
          { dismissed: true }
        )
        .then((result) => ({
          failed: Math.max(0, entries.length - result.matchedCount),
          succeeded: result.matchedCount,
        }))
        .catch(() => ({ failed: entries.length, succeeded: 0 }));

      if (failed > 0) {
        showToast(`${failed} of ${entries.length} items failed to dismiss.`, "error");
      } else if (succeeded > 0) {
        showToast(`${succeeded} item(s) dismissed.`, "success");
      }

      if (hideDismissed && failed === 0) {
        setFiles((currentFiles) => {
          if (!currentFiles) return currentFiles;

          const filtered: typeof currentFiles = {};

          for (const [name, stat] of Object.entries(currentFiles)) {
            if (!entries.includes(name)) {
              filtered[name] = stat;
            }
          }

          return filtered;
        });
      }
    },
    [hideDismissed, mongoCollection.collection, mongoCollection.database, mongoFs, setFiles, showToast]
  );
  const handleSetCategory = useCallback(
    async (entries: string[]) => {
      if (!mongoFs) return;

      const { database, collection } = mongoCollection;

      // Pre-fill only when ALL selected entries share the same category
      const categories = entries.map((e) =>
        mongoFs.getCachedDocumentCategory(e.replace(/\.json$/, ""), database, collection)
      );
      const first = categories[0];
      const allSame =
        first !== null &&
        categories.every(
          (c) => c !== null && c.toLowerCase() === first.toLowerCase()
        );
      const defaultValue = allSame ? first : "";

      const raw = window.prompt( // eslint-disable-line no-alert -- user-facing category input
        "Enter category (comma-separated for multiple):",
        defaultValue
      );

      if (raw) {
        const newLabels = raw.toLowerCase().split(",").map((l) => l.trim()).filter(Boolean);
        const groupedUpdates = new Map<string, string[]>();
        let unchangedCount = 0;

        for (const entry of entries) {
          const documentName = entry.replace(/\.json$/, "");
          const existing = mongoFs.getCachedDocumentCategory(
            documentName,
            database,
            collection
          );
          const existingLabels = existing
            ? existing.split(",").map((l) => l.trim().toLowerCase())
            : [];
          const labelsToAdd = newLabels.filter((l) => !existingLabels.includes(l));

          if (labelsToAdd.length === 0) {
            unchangedCount++;
          } else {
            const merged = [...existingLabels, ...labelsToAdd].join(", ");
            groupedUpdates.set(merged, [
              ...(groupedUpdates.get(merged) || []),
              documentName,
            ]);
          }
        }

        let succeeded = unchangedCount;
        let failed = 0;
        const groupedEntries = [...groupedUpdates.entries()];

        const groupedResults = await Promise.allSettled(
          groupedEntries.map(([merged, documentNames]) =>
            mongoFs.patchDocuments(database, collection, documentNames, {
              category: merged,
            })
          )
        );

        groupedResults.forEach((result, index) => {
          const documentCount = groupedEntries[index]?.[1].length || 0;

          if (result.status === "fulfilled") {
            succeeded += result.value.matchedCount;
            failed += Math.max(0, documentCount - result.value.matchedCount);
          } else {
            failed += documentCount;
          }
        });

        if (failed > 0) {
          showToast(`${failed} of ${entries.length} items failed to save.`, "error");
        } else if (succeeded > 0) {
          showToast(`Category set for ${succeeded} item(s).`, "success");
        }
        if (succeeded > 0 && failed === 0 && hideCategorized) {
          setFiles((currentFiles) => {
            if (!currentFiles) return currentFiles;
            const updated = { ...currentFiles };
            for (const entry of entries) {
              delete updated[entry];
            }
            return updated;
          });
        }
      }
    },
    [hideCategorized, mongoCollection, mongoFs, setFiles, showToast]
  );
  const [quickLookPath, setQuickLookPath] = useState("");
  const handleQuickLook = useCallback(
    (entry: string) => {
      setQuickLookPath(join(url, entry));
    },
    [url]
  );
  const handleQuickLookClose = useCallback(() => {
    setQuickLookPath("");
    fileManagerRef.current?.focus(PREVENT_SCROLL);
  }, []);
  const { StyledFileEntry, StyledFileManager } = FileManagerViews[view];
  const { isSelecting, selectionRect, selectionStyling, selectionEvents } =
    useSelection(fileManagerRef, focusedEntries, focusFunctions, isDesktop);
  const draggableEntry = useDraggableEntries(
    focusedEntries,
    focusFunctions,
    fileManagerRef,
    isSelecting,
    allowMovingDraggableEntries,
    isDesktop
  );
  const fileDrop = useFileDrop({
    callback: folderActions.newPath,
    directory: url,
    updatePositions: allowMovingDraggableEntries,
  });
  const folderContextMenu = useFolderContextMenu(
    url,
    folderActions,
    isDesktop,
    isStartMenu
  );
  const loading = useMemo(() => {
    if (hideLoading) return false;

    return isLoading || url !== currentUrl;
  }, [currentUrl, hideLoading, isLoading, url]);
  const { sizes } = useTheme();
  const setView = useCallback(
    (newView: FileManagerViewNames) => {
      setViews((currentViews) => ({ ...currentViews, [url]: newView }));
      setColumns(newView === "details" ? DEFAULT_COLUMNS : undefined);
    },
    [setViews, url]
  );
  const isIconView = useMemo(() => view === "icon", [view]);
  const keyShortcuts = useFileKeyboardShortcuts(
    files,
    url,
    focusedEntries,
    setRenaming,
    focusFunctions,
    folderActions,
    updateFiles,
    fileManagerRef,
    id,
    isStartMenu,
    isDesktop,
    setView,
    isMongoFS ? handleToggleHideCategorized : undefined,
    isMongoFS ? handleSetCategory : undefined,
    isMongoFS ? handleQuickLook : undefined,
    isMongoFS ? handleDismiss : undefined,
    isMongoFS ? handleToggleHideDismissed : undefined
  );
  const [permission, setPermission] = useState<PermissionState>("prompt");
  const requestingPermissions = useRef(false);
  const focusedOnLoad = useRef(false);
  const onKeyDown = useMemo(
    () => (renaming === "" ? keyShortcuts() : undefined),
    [keyShortcuts, renaming]
  );
  const fileKeys = useMemo(() => Object.keys(files), [files]);
  const iconGridMetrics = useMemo(() => {
    const { gridHeight, gridWidth, rowGap } = ICON_ZOOM_LEVELS[iconZoomLevel];

    return { gridHeight, gridWidth, rowGap };
  }, [iconZoomLevel]);
  const fileManagerPaddingY = useMemo(() => {
    const [top = "0", right = top, bottom = top] =
      sizes.fileManager.padding.split(" ");

    return {
      bottom: Number.parseFloat(bottom || right || top) || 0,
      top: Number.parseFloat(top) || 0,
    };
  }, [sizes.fileManager.padding]);
  const fileManagerColumnGap = useMemo(
    () => Number.parseFloat(sizes.fileManager.columnGap) || 0,
    [sizes.fileManager.columnGap]
  );
  const estimatedVirtualRowHeight = useMemo(
    () =>
      view === "details"
        ? Number.parseFloat(sizes.fileManager.detailsRowHeight)
        : 37,
    [sizes.fileManager.detailsRowHeight, view]
  );
  const [virtualRowHeight, setVirtualRowHeight] = useState(
    estimatedVirtualRowHeight
  );
  const shouldVirtualizeRows = useMemo(
    () =>
      !loading &&
      !isDesktop &&
      !isStartMenu &&
      !isIconView &&
      renaming === "" &&
      fileKeys.length > ROW_VIRTUALIZATION_THRESHOLD,
    [fileKeys.length, isDesktop, isIconView, isStartMenu, loading, renaming]
  );
  const shouldVirtualizeIconGrid = useMemo(
    () =>
      !loading &&
      !isDesktop &&
      !isStartMenu &&
      isFileExplorerIconView &&
      renaming === "" &&
      fileKeys.length > ICON_GRID_VIRTUALIZATION_THRESHOLD,
    [
      fileKeys.length,
      isDesktop,
      isFileExplorerIconView,
      isStartMenu,
      loading,
      renaming,
    ]
  );
  const {
    bottomOffset: virtualBottomOffset,
    endIndex: virtualEndIndex,
    startIndex: virtualStartIndex,
    topOffset: virtualTopOffset,
  } = useVirtualRows(
    fileManagerRef,
    fileKeys.length,
    virtualRowHeight,
    shouldVirtualizeRows
  );
  const {
    columnCount: virtualIconColumnCount,
    endIndex: virtualIconEndIndex,
    startIndex: virtualIconStartIndex,
    totalHeight: virtualIconTotalHeight,
  } = useVirtualGrid(
    fileManagerRef,
    fileKeys.length,
    iconGridMetrics.gridWidth,
    iconGridMetrics.gridHeight,
    iconGridMetrics.rowGap,
    fileManagerColumnGap,
    shouldVirtualizeIconGrid,
    fileManagerPaddingY.top,
    fileManagerPaddingY.bottom
  );
  const renderedEntries = useMemo(
    () => {
      if (shouldVirtualizeRows) {
        return fileKeys
          .slice(virtualStartIndex, virtualEndIndex + 1)
          .map((file, index) => ({
            file,
            index: virtualStartIndex + index,
          }));
      }

      if (shouldVirtualizeIconGrid) {
        return fileKeys
          .slice(virtualIconStartIndex, virtualIconEndIndex + 1)
          .map((file, index) => ({
            file,
            index: virtualIconStartIndex + index,
          }));
      }

      return fileKeys.map((file, index) => ({ file, index }));
    },
    [
      fileKeys,
      shouldVirtualizeIconGrid,
      shouldVirtualizeRows,
      virtualEndIndex,
      virtualIconEndIndex,
      virtualIconStartIndex,
      virtualStartIndex,
    ]
  );
  const isEmptyFolder = useMemo(
    () => !isDesktop && !isStartMenu && !loading && fileKeys.length === 0,
    [fileKeys.length, isDesktop, isStartMenu, loading]
  );

  useEffect(() => {
    if (
      !requestingPermissions.current &&
      permission !== "granted" &&
      rootFs?.mntMap[currentUrl]?.getName() === "FileSystemAccess"
    ) {
      requestingPermissions.current = true;

      import("contexts/fileSystem/functions").then(({ requestPermission }) =>
        requestPermission(currentUrl)
          .then((permissions) => {
            const isGranted = permissions === "granted";

            if (!permissions || isGranted) {
              setPermission("granted");

              if (isGranted) updateFiles();
            }
          })
          .catch((error: Error) => {
            if (error?.message === "Permission already granted") {
              setPermission("granted");
            }
          })
          .finally(() => {
            requestingPermissions.current = false;
          })
      );
    }
  }, [currentUrl, permission, rootFs?.mntMap, updateFiles]);

  useEffect(() => {
    if (!mounted && MOUNTABLE_EXTENSIONS.has(getExtension(url))) {
      const doMountUrl = async (): Promise<void> => {
        if (!(await lstat(url)).isDirectory()) {
          setMounted((currentlyMounted) => {
            if (!currentlyMounted) {
              mountFs(url)
                .then(() => setTimeout(updateFiles, 100))
                .catch((mountError: Error) => {
                  // eslint-disable-next-line no-console
                  console.warn(`Failed to mount filesystem at ${url}:`, mountError);
                });
            }
            return true;
          });
        }
      };

      doMountUrl();
    }
  }, [lstat, mountFs, mounted, updateFiles, url]);

  useEffect(() => {
    if (url !== currentUrl) {
      allFilesRef.current = undefined;
      folderActions.resetFiles();
      setCurrentUrl(url);
      setPermission("denied");
    }
  }, [currentUrl, folderActions, url]);

  useEffect(() => {
    if (!focusedOnLoad.current && !loading && !isDesktop && !isStartMenu) {
      fileManagerRef.current?.focus(PREVENT_SCROLL);
      focusedOnLoad.current = true;
    }
  }, [isDesktop, isStartMenu, loading]);

  useEffect(() => {
    setColumns(isDetailsView ? DEFAULT_COLUMNS : undefined);
  }, [isDetailsView]);

  useEffect(() => {
    setVirtualRowHeight(estimatedVirtualRowHeight);
  }, [estimatedVirtualRowHeight]);

  useLayoutEffect(() => {
    if (!shouldVirtualizeRows || renderedEntries.length === 0) return;

    const firstRenderedEntry = fileManagerRef.current?.querySelector<HTMLElement>(
      "li[data-virtual-entry='true']"
    );
    const measuredHeight = firstRenderedEntry?.getBoundingClientRect().height;

    if (
      measuredHeight &&
      Math.abs(measuredHeight - virtualRowHeight) > 1
    ) {
      setVirtualRowHeight(measuredHeight);
    }
  }, [renderedEntries.length, shouldVirtualizeRows, virtualRowHeight]);

  /* eslint-disable consistent-return -- early-return is idiomatic for useEffect guards */
  useEffect(() => {
    const container = fileManagerRef.current;

    if (!container || !isIconView || isDesktop || quickLookPath) return;

    const onWheel = (event: globalThis.WheelEvent): void => {
      if (event.ctrlKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 1 : -1;

        setIconZoomLevel((current) =>
          Math.max(0, Math.min(ICON_ZOOM_LEVELS.length - 1, current + delta))
        );
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });

    return (): void => {
      container.removeEventListener("wheel", onWheel);
    };
  }, [isDesktop, isIconView, quickLookPath, setIconZoomLevel]);

  useEffect(() => {
    const container = fileManagerRef.current;

    if (!container || !hasMore) return;

    const onScroll = (): void => {
      const { scrollTop, clientHeight, scrollHeight } = container;

      if (scrollTop + clientHeight >= scrollHeight - 300) {
        loadMore();
      }
    };

    // Fill viewport if content is too short to scroll
    if (container.scrollHeight <= container.clientHeight) {
      loadMore();
    }

    container.addEventListener("scroll", onScroll, { passive: true });

    return (): void => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [hasMore, loadMore]);
  /* eslint-enable consistent-return */

  // Re-apply active filters when files change (e.g. after readdir refresh)
  useEffect(() => {
    if (!mongoFs || (!hideCategorized && !hideDismissed)) return;

    const { database, collection } = mongoCollection;
    const categorizedNames = hideCategorized
      ? mongoFs.getCachedDocumentNames(database, collection)
      : undefined;
    const dismissedNames = hideDismissed
      ? mongoFs.getCachedDismissedNames(database, collection)
      : undefined;

    if (!categorizedNames && !dismissedNames) return;

    setFiles((currentFiles) => {
      if (!currentFiles) return currentFiles;

      // Sync unfiltered snapshot with current state (same collection only)
      if (allFilesRef.current?.key === url) {
        // Add new entries loaded since snapshot was taken
        for (const [name, stat] of Object.entries(currentFiles)) {
          if (!(name in allFilesRef.current.files)) {
            allFilesRef.current.files[name] = stat;
          }
        }
        // Remove entries deleted while filter was active
        for (const name of Object.keys(allFilesRef.current.files)) {
          if (!(name in currentFiles)) {
            delete allFilesRef.current.files[name];
          }
        }
      }

      const filtered: typeof currentFiles = {};
      let changed = false;

      for (const [name, stat] of Object.entries(currentFiles)) {
        const docName = name.replace(/\.json$/, "");
        const shouldHide =
          (categorizedNames?.has(docName) ?? false) ||
          (dismissedNames?.has(docName) ?? false);

        if (shouldHide) {
          changed = true;
        } else {
          filtered[name] = stat;
        }
      }

      return changed ? filtered : currentFiles;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks-addons/no-unused-deps
  }, [files]);

  return (
    <>
      {loading && <StyledLoading $hasColumns={isDetailsView} />}
      {!loading && isEmptyFolder && <StyledEmpty $hasColumns={isDetailsView} />}
      <StyledFileManager
        ref={fileManagerRef}
        $iconZoomLevel={isIconView && !isDesktop ? iconZoomLevel : undefined}
        $isEmptyFolder={isEmptyFolder}
        $scrollable={!hideScrolling}
        onKeyDownCapture={loading ? undefined : onKeyDown}
        style={
          shouldVirtualizeIconGrid
            ? {
                display: "block",
                padding: 0,
                position: "relative",
              }
            : undefined
        }
        {...(loading || readOnly
          ? { onContextMenu: haltEvent }
          : {
              $selecting: isSelecting,
              ...fileDrop,
              ...folderContextMenu,
              ...selectionEvents,
            })}
        {...FOCUSABLE_ELEMENT}
      >
        {isDetailsView && columns && (
          <Columns
            columns={columns}
            directory={url}
            files={files}
            setColumns={setColumns}
          />
        )}
        {!loading && (
          <>
            {isSelecting && <StyledSelection style={selectionStyling} />}
            {shouldVirtualizeRows && virtualTopOffset > 0 && (
              <li
                role="presentation"
                style={{ height: virtualTopOffset, pointerEvents: "none" }}
                aria-hidden
              />
            )}
            {shouldVirtualizeIconGrid && (
              <li
                role="presentation"
                style={{ height: virtualIconTotalHeight, pointerEvents: "none" }}
                aria-hidden
              />
            )}
            {renderedEntries.map(({ file, index }) => (
              <StyledFileEntry
                key={file}
                $desktop={isDesktop}
                $iconZoomLevel={isIconView && !isDesktop ? iconZoomLevel : undefined}
                $selecting={isSelecting}
                $visible={!isLoading}
                data-virtual-entry="true"
                style={
                  shouldVirtualizeIconGrid
                    ? {
                        height: iconGridMetrics.gridHeight,
                        left:
                          (index % virtualIconColumnCount) *
                          (iconGridMetrics.gridWidth + fileManagerColumnGap),
                        position: "absolute",
                        top:
                          fileManagerPaddingY.top +
                          Math.floor(index / virtualIconColumnCount) *
                            (iconGridMetrics.gridHeight + iconGridMetrics.rowGap),
                        width: iconGridMetrics.gridWidth,
                      }
                    : undefined
                }
                {...(!readOnly && draggableEntry(url, file, renaming === file))}
                {...(renaming === "" && { onKeyDown: keyShortcuts(file) })}
                {...focusableEntry(file)}
              >
                <FileEntry
                  columns={columns}
                  fileActions={fileActions}
                  fileManagerId={id}
                  fileManagerRef={fileManagerRef}
                  focusFunctions={focusFunctions}
                  focusedEntries={focusedEntries}
                  hasNewFolderIcon={isStartMenu}
                  hideShortcutIcon={hideShortcutIcons}
                  iconZoomLevel={isIconView && !isDesktop ? iconZoomLevel : undefined}
                  isDesktop={isDesktop}
                  isHeading={isDesktop && files[file].systemShortcut}
                  isLoadingFileManager={isLoading}
                  loadIconImmediately={loadIconsImmediately}
                  mongoIconMount={mongoIconMount}
                  name={isMongoFS ? MongoDBFileSystem.decodeDocumentIdentifier(basename(file, SHORTCUT_EXTENSION)) : basename(file, SHORTCUT_EXTENSION)}
                  path={join(url, file)}
                  readOnly={readOnly}
                  renaming={renaming === file}
                  selectionRect={selectionRect}
                  setFiles={isMongoFS ? setFiles : undefined}
                  setRenaming={setRenaming}
                  stats={files[file]}
                  view={view}
                />
              </StyledFileEntry>
            ))}
            {shouldVirtualizeRows && virtualBottomOffset > 0 && (
              <li
                role="presentation"
                style={{ height: virtualBottomOffset, pointerEvents: "none" }}
                aria-hidden
              />
            )}
          </>
        )}
      </StyledFileManager>
      {quickLookPath && (
        <QuickLook
          files={fileKeys}
          onClose={handleQuickLookClose}
          path={quickLookPath}
          url={url}
        />
      )}
      {showStatusBar && (
        <StatusBar
          count={loading ? 0 : fileKeys.length}
          directory={url}
          fileDrop={fileDrop}
          {...(isMongoFS
            ? {
                hideCategorized,
                hideDismissed,
                onToggleHideCategorized: handleToggleHideCategorized,
                onToggleHideDismissed: handleToggleHideDismissed,
              }
            : {})}
          iconZoomLevel={iconZoomLevel}
          selected={focusedEntries}
          setIconZoomLevel={setIconZoomLevel}
          setView={setView}
          view={view}
        />
      )}
    </>
  );
};

export default memo(FileManager);
