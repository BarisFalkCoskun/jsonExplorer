import { dirname, join } from "path";
import { useCallback, useEffect } from "react";
import useTransferDialog from "components/system/Dialogs/Transfer/useTransferDialog";
import { createFileReaders } from "components/system/Files/FileManager/functions";
import { type FocusEntryFunctions } from "components/system/Files/FileManager/useFocusableEntries";
import {
  type Files,
  type FolderActions,
} from "components/system/Files/FileManager/useFolder";
import { type FileManagerViewNames } from "components/system/Files/Views";
import { useFileSystem } from "contexts/fileSystem";
import { useProcesses } from "contexts/process";
import { useSession } from "contexts/session";
import {
  DESKTOP_PATH,
  PREVENT_SCROLL,
  SHORTCUT_EXTENSION,
} from "utils/constants";
import {
  haltEvent,
  saveUnpositionedDesktopIcons,
  sendMouseClick,
} from "utils/functions";
import { getPerfDuration, getPerfNow, logPerf } from "utils/perfDiagnostics";

type KeyboardShortcutEntry = (file?: string) => React.KeyboardEventHandler;

type BackspaceShortcutAction = "delete" | "navigateUp" | "none";

export const getBackspaceShortcutAction = (
  focusedEntries: string[],
  id?: string
): BackspaceShortcutAction => {
  if (focusedEntries.length > 0) return "delete";

  return id ? "navigateUp" : "none";
};

const useFileKeyboardShortcuts = (
  files: Files,
  url: string,
  focusedEntries: string[],
  setRenaming: React.Dispatch<React.SetStateAction<string>>,
  { blurEntry, focusEntry }: FocusEntryFunctions,
  { newPath, pasteToFolder }: FolderActions,
  updateFiles: (newFile?: string, oldFile?: string) => void,
  fileManagerRef: React.RefObject<HTMLOListElement | null>,
  id?: string,
  isStartMenu?: boolean,
  isDesktop?: boolean,
  setView?: (newView: FileManagerViewNames) => void,
  onToggleHideCategorized?: () => void,
  onSetCategory?: (entries: string[]) => void,
  onQuickLook?: (entry: string) => void,
  onDismiss?: (entries: string[]) => void,
  onToggleHideDismissed?: () => void,
  onToggleHideSubstituteGroup?: () => void
): KeyboardShortcutEntry => {
  const { copyEntries, deletePath, moveEntries } = useFileSystem();
  const { open, url: changeUrl } = useProcesses();
  const { openTransferDialog } = useTransferDialog();
  const { foregroundId, setIconPositions } = useSession();

  useEffect(() => {
    const pasteHandler = (event: ClipboardEvent): void => {
      if (
        event.clipboardData?.files?.length &&
        ((!foregroundId && isDesktop) || foregroundId === id)
      ) {
        event.stopImmediatePropagation?.();
        createFileReaders(event.clipboardData.files, url, newPath)
          .then(openTransferDialog)
          .catch(console.error);
      }
    };

    document.addEventListener("paste", pasteHandler);

    return () => document.removeEventListener("paste", pasteHandler);
  }, [foregroundId, id, isDesktop, newPath, openTransferDialog, url]);

  return useCallback(
    (file?: string): React.KeyboardEventHandler =>
      (event) => {
        if (isStartMenu) return;

        const { altKey, ctrlKey, key, target, shiftKey } = event;

        if (shiftKey) {
          if (ctrlKey) {
            if (!isDesktop) {
              const updateViewAndFocus = (
                newView: FileManagerViewNames
              ): void => {
                setView?.(newView);
                requestAnimationFrame(() =>
                  fileManagerRef.current?.focus(PREVENT_SCROLL)
                );
              };

              // eslint-disable-next-line default-case
              switch (key) {
                case "#": // 3
                  updateViewAndFocus("icon");
                  break;
                case "^": // 6
                  updateViewAndFocus("details");
                  break;
              }
            }

            if (key === "D" && onToggleHideDismissed) {
              haltEvent(event);
              onToggleHideDismissed();
            }
          }

          return;
        }

        const onDelete = async (): Promise<void> => {
          if (focusedEntries.length > 0) {
            haltEvent(event);
            const deleteStartedAt = getPerfNow();
            const entriesToDelete = [...focusedEntries];

            if (url === DESKTOP_PATH) {
              saveUnpositionedDesktopIcons(setIconPositions);
            }

            const results = await Promise.allSettled(
              entriesToDelete.map(async (entry) => {
                const path = join(url, entry);
                const entryDeleteStartedAt = getPerfNow();
                const deleted = await deletePath(path);
                const deleteMs = getPerfDuration(entryDeleteStartedAt);
                let updateMs = 0;

                if (deleted) {
                  const updateStartedAt = getPerfNow();
                  await Promise.resolve(updateFiles(undefined, path));
                  updateMs = getPerfDuration(updateStartedAt);
                }

                return { deleteMs, deleted, updateMs };
              })
            );
            const fulfilled = results.filter(
              (
                result
              ): result is PromiseFulfilledResult<{
                deleteMs: number;
                deleted: boolean;
                updateMs: number;
              }> => result.status === "fulfilled"
            );
            const deleteDurations = fulfilled.map(
              ({ value }) => value.deleteMs
            );
            const updateDurations = fulfilled.map(
              ({ value }) => value.updateMs
            );
            const succeeded = fulfilled.filter(
              ({ value }) => value.deleted
            ).length;

            for (const result of results) {
              if (result.status === "rejected") {
                console.error("Delete failed:", result.reason);
              }
            }

            logPerf("keyboard-delete", {
              avgDeleteMs:
                deleteDurations.length > 0
                  ? Number(
                      (
                        deleteDurations.reduce((sum, ms) => sum + ms, 0) /
                        deleteDurations.length
                      ).toFixed(1)
                    )
                  : 0,
              avgUpdateMs:
                updateDurations.length > 0
                  ? Number(
                      (
                        updateDurations.reduce((sum, ms) => sum + ms, 0) /
                        updateDurations.length
                      ).toFixed(1)
                    )
                  : 0,
              count: entriesToDelete.length,
              failed: results.length - fulfilled.length,
              maxDeleteMs:
                deleteDurations.length > 0 ? Math.max(...deleteDurations) : 0,
              maxUpdateMs:
                updateDurations.length > 0 ? Math.max(...updateDurations) : 0,
              succeeded,
              totalMs: getPerfDuration(deleteStartedAt),
              url,
            });
            blurEntry();
          }
        };

        if (ctrlKey) {
          const lKey = key.toLowerCase();

          // eslint-disable-next-line default-case
          switch (lKey) {
            case "a":
              haltEvent(event);
              if (target instanceof HTMLOListElement) {
                const [firstEntry] = target.querySelectorAll("button");

                firstEntry?.focus(PREVENT_SCROLL);
              }
              Object.keys(files).forEach((fileName) => focusEntry(fileName));
              break;
            case "c":
              haltEvent(event);
              copyEntries(focusedEntries.map((entry) => join(url, entry)));
              break;
            case "d":
              if (onDismiss && focusedEntries.length > 0) {
                haltEvent(event);
                onDismiss(focusedEntries);
              } else {
                onDelete();
              }
              break;
            case "g":
              if (onToggleHideSubstituteGroup) {
                haltEvent(event);
                onToggleHideSubstituteGroup();
              }
              break;
            case "h":
              if (onToggleHideCategorized) {
                haltEvent(event);
                onToggleHideCategorized();
              }
              break;

            case "l":
              if (onSetCategory && focusedEntries.length > 0) {
                haltEvent(event);
                onSetCategory(focusedEntries);
              }
              break;

            case "r":
              haltEvent(event);
              updateFiles();
              break;
            case "x":
              haltEvent(event);
              moveEntries(focusedEntries.map((entry) => join(url, entry)));
              break;
            case "v":
              event.stopPropagation();
              if (target instanceof HTMLOListElement) {
                pasteToFolder();
              }
              break;
          }
        } else if (altKey) {
          const lKey = key.toLowerCase();

          if (lKey === "n") {
            haltEvent(event);
            open("FileExplorer", { url });
          } else if (key === "Enter" && focusedEntries.length > 0) {
            haltEvent(event);
            open("Properties", { url: join(url, focusedEntries[0]) });
          }
        } else {
          switch (key) {
            case "F2":
              if (focusedEntries.length > 0 && file) {
                haltEvent(event);
                setRenaming(file);
              }
              break;
            case "F5":
              if (id) {
                haltEvent(event);
                updateFiles();
              }
              break;
            case "Delete":
              onDelete();
              break;
            case "Backspace":
              if (getBackspaceShortcutAction(focusedEntries, id) === "delete") {
                onDelete();
              } else if (id) {
                haltEvent(event);
                changeUrl(id, dirname(url));
              }
              break;
            case "Enter":
              if (
                focusedEntries.length > 0 &&
                target instanceof HTMLButtonElement
              ) {
                haltEvent(event);
                sendMouseClick(target, 2);
              }
              break;
            case " ":
              if (onQuickLook && focusedEntries.length === 1) {
                haltEvent(event);
                onQuickLook(focusedEntries[0]);
              }
              break;
            default:
              if (key.startsWith("Arrow")) {
                haltEvent(event);

                if (!(target instanceof HTMLElement)) return;

                let targetElement = target;

                if (!(target instanceof HTMLButtonElement)) {
                  targetElement = target.querySelector(
                    "button"
                  ) as HTMLButtonElement;
                  if (!targetElement) return;
                }

                const { x, y, height, width } =
                  targetElement.getBoundingClientRect();
                let movedElement =
                  key === "ArrowUp" || key === "ArrowDown"
                    ? document.elementFromPoint(
                        x,
                        y + height / 2 + (key === "ArrowUp" ? -height : height)
                      )
                    : document.elementFromPoint(
                        x + width / 2 + (key === "ArrowLeft" ? -width : width),
                        y
                      );

                if (movedElement instanceof HTMLOListElement) {
                  const nearestLi = targetElement.closest("li");

                  if (nearestLi instanceof HTMLLIElement) {
                    const olChildren = [...movedElement.children];
                    const liPosition = olChildren.indexOf(nearestLi);

                    if (key === "ArrowUp" || key === "ArrowDown") {
                      movedElement =
                        olChildren[
                          key === "ArrowUp"
                            ? liPosition === 0
                              ? olChildren.length - 1
                              : liPosition - 1
                            : liPosition === olChildren.length - 1
                              ? 0
                              : liPosition + 1
                        ].querySelector("button");
                    }
                  }
                }

                const closestButton = movedElement?.closest("button");
                let dispatchElement: HTMLElement = closestButton as HTMLElement;

                if (
                  !(closestButton instanceof HTMLButtonElement) ||
                  !fileManagerRef.current?.contains(closestButton)
                ) {
                  dispatchElement = targetElement;
                }

                dispatchElement?.dispatchEvent(
                  new MouseEvent("mousedown", {
                    bubbles: true,
                  })
                );
              } else if (/^[\da-z]$/i.test(key)) {
                haltEvent(event);

                const fileNames = Object.keys(files);
                const lastFocusedEntryIndex = fileNames.indexOf(
                  focusedEntries[focusedEntries.length - 1]
                );
                const lowerCaseKey = key.toLowerCase();
                const upperCaseKey = key.toUpperCase();
                const fileNamesStartingFromLastFocusedEntry = [
                  ...fileNames.slice(lastFocusedEntryIndex),
                  ...fileNames.slice(0, lastFocusedEntryIndex),
                ];
                const focusOnEntry = fileNamesStartingFromLastFocusedEntry.find(
                  (name) =>
                    !focusedEntries.includes(name) &&
                    ((
                      files[name]?.displayName ||
                      name.replace(SHORTCUT_EXTENSION, "")
                    ).startsWith(lowerCaseKey) ||
                      (
                        files[name]?.displayName ||
                        name.replace(SHORTCUT_EXTENSION, "")
                      ).startsWith(upperCaseKey))
                );

                if (focusOnEntry) {
                  blurEntry();
                  focusEntry(focusOnEntry);

                  try {
                    fileManagerRef.current
                      ?.querySelector(
                        `button[data-file-id='${CSS.escape(focusOnEntry)}']`
                      )
                      ?.scrollIntoView();
                  } catch {
                    // Ignore error getting/scrolling element
                  }
                }
              }
          }
        }
      },
    [
      blurEntry,
      changeUrl,
      copyEntries,
      deletePath,
      fileManagerRef,
      files,
      focusEntry,
      focusedEntries,
      id,
      isDesktop,
      isStartMenu,
      moveEntries,
      onDismiss,
      onQuickLook,
      onSetCategory,
      onToggleHideCategorized,
      onToggleHideDismissed,
      onToggleHideSubstituteGroup,
      open,
      pasteToFolder,
      setIconPositions,
      setRenaming,
      setView,
      updateFiles,
      url,
    ]
  );
};

export default useFileKeyboardShortcuts;
