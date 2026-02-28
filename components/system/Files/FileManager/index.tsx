import { basename, join } from "path";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  const allFilesRef = useRef<Record<string, any> | null>(null);
  const handleToggleHideCategorized = useCallback(() => {
    if (!mongoFs) return;

    const newHidden = !mongoFs.hideCategorized;
    mongoFs.hideCategorized = newHidden;
    setHideCategorized(newHidden);

    if (newHidden) {
      // Save the full file list before filtering
      allFilesRef.current = { ...files };

      // Get cached docs with category info to know which to hide
      const cachedDocs = mongoFs.getCachedDocumentNames();

      if (cachedDocs) {
        setFiles((currentFiles) => {
          if (!currentFiles) return currentFiles;

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
        // No cache available, fall back to full refresh
        updateFiles();
      }
    } else {
      allFilesRef.current = null;
      // Always do a full refresh when showing categorized items, because
      // the user may have changed categories since the snapshot was taken.
      updateFiles();
    }
  }, [files, mongoFs, setFiles, setHideCategorized, updateFiles]);
  const allDismissedFilesRef = useRef<Record<string, any> | null>(null);
  const handleToggleHideDismissed = useCallback(() => {
    if (!mongoFs) return;

    const newHidden = !mongoFs.hideDismissed;
    mongoFs.hideDismissed = newHidden;
    setHideDismissed(newHidden);

    if (newHidden) {
      allDismissedFilesRef.current = { ...files };

      const cachedDocs = mongoFs.getCachedDismissedNames();

      if (cachedDocs) {
        setFiles((currentFiles) => {
          if (!currentFiles) return currentFiles;

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
    } else {
      allDismissedFilesRef.current = null;
      // Always do a full refresh when showing dismissed items, because
      // the user may have undismissed items since the snapshot was taken.
      updateFiles();
    }
  }, [files, mongoFs, setFiles, setHideDismissed, updateFiles]);
  const handleDismiss = useCallback(
    (entries: string[]) => {
      if (!mongoFs || !mountUrl) return;

      entries.forEach((entry) => {
        const relativePath = `${url.replace(`${mountUrl}/`, "")}/${entry}`.replace(
          /\.json$/,
          ""
        );
        mongoFs
          .patchDocument(relativePath, { dismissed: true })
          .catch(console.error);
      });

      if (mongoFs.hideDismissed) {
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
    [mongoFs, mountUrl, setFiles, url]
  );
  const handleSetCategory = useCallback(
    (entries: string[]) => {
      if (!mongoFs || !mountUrl) return;

      // Pre-fill only when ALL selected entries share the same category
      const categories = entries.map((e) =>
        mongoFs.getCachedDocumentCategory(e.replace(/\.json$/, ""))
      );
      const first = categories[0];
      const allSame =
        first !== null &&
        categories.every(
          (c) => c !== null && c.toLowerCase() === first.toLowerCase()
        );
      const defaultValue = allSame ? first : "";

      const raw = window.prompt(
        "Enter category (comma-separated for multiple):",
        defaultValue
      );

      if (raw) {
        const newLabels = raw.toLowerCase().split(",").map((l) => l.trim()).filter(Boolean);

        entries.forEach((entry) => {
          const existing = mongoFs.getCachedDocumentCategory(
            entry.replace(/\.json$/, "")
          );
          const existingLabels = existing ? existing.split(",").map((l) => l.trim().toLowerCase()) : [];
          const labelsToAdd = newLabels.filter((l) => !existingLabels.includes(l));
          if (labelsToAdd.length === 0) return;

          const merged = [...existingLabels, ...labelsToAdd].join(", ");
          const relativePath = `${url.replace(`${mountUrl}/`, "")}/${entry}`.replace(
            /\.json$/,
            ""
          );
          mongoFs
            .patchDocument(relativePath, { category: merged })
            .catch(console.error);
        });
      }
    },
    [mongoFs, mountUrl, url]
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
      const mountUrl = async (): Promise<void> => {
        if (!(await lstat(url)).isDirectory()) {
          setMounted((currentlyMounted) => {
            if (!currentlyMounted) {
              mountFs(url)
                .then(() => setTimeout(updateFiles, 100))
                .catch((error: Error) => {
                  console.warn(`Failed to mount filesystem at ${url}:`, error);
                });
            }
            return true;
          });
        }
      };

      mountUrl();
    }
  }, [lstat, mountFs, mounted, updateFiles, url]);

  useEffect(() => {
    if (url !== currentUrl) {
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

    return () => {
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

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [hasMore, loadMore]);

  useEffect(() => {
    if (mongoFs) {
      mongoFs.hideCategorized = hideCategorized;
      mongoFs.hideDismissed = hideDismissed;
    }
  }, [mongoFs, hideCategorized, hideDismissed]);

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
            {fileKeys.map((file) => (
              <StyledFileEntry
                key={file}
                $desktop={isDesktop}
                $iconZoomLevel={isIconView && !isDesktop ? iconZoomLevel : undefined}
                $selecting={isSelecting}
                $visible={!isLoading}
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
                  name={basename(file, SHORTCUT_EXTENSION)}
                  path={join(url, file)}
                  readOnly={readOnly}
                  renaming={renaming === file}
                  selectionRect={selectionRect}
                  setRenaming={setRenaming}
                  stats={files[file]}
                  view={view}
                />
              </StyledFileEntry>
            ))}
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
