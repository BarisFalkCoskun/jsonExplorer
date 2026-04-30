import { join } from "path";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTheme } from "styled-components";
import { type FileManagerViewNames } from "components/system/Files/Views";
import StyledStatusBar from "components/system/Files/FileManager/StyledStatusBar";
import { ICON_ZOOM_LEVELS } from "components/system/Files/FileManager/constants";
import { type FileDrop } from "components/system/Files/FileManager/useFileDrop";
import { useFileSystem } from "contexts/fileSystem";
import useResizeObserver from "hooks/useResizeObserver";
import { getFormattedSize, haltEvent, label } from "utils/functions";
import { UNKNOWN_SIZE } from "contexts/fileSystem/core";
import Icon from "styles/common/Icon";
import Button from "styles/common/Button";
import { getPerfDuration, getPerfNow, logPerf } from "utils/perfDiagnostics";

type StatusBarProps = {
  count: number;
  directory: string;
  fileDrop: FileDrop;
  hideCategorized?: boolean;
  hideDismissed?: boolean;
  hideSubstituteGroup?: boolean;
  iconZoomLevel: number;
  localImages?: boolean;
  mongoTagExcludeCount?: number;
  mongoTagIncludeCount?: number;
  onClearMongoTagFilters?: () => void;
  onSetMongoTagExcludeFilter?: () => void;
  onSetMongoTagIncludeFilter?: () => void;
  onToggleHideCategorized?: () => void;
  onToggleHideDismissed?: () => void;
  onToggleHideSubstituteGroup?: () => void;
  onToggleImageSource?: () => void;
  selected: string[];
  setIconZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  setView: (view: FileManagerViewNames) => void;
  totalCount?: number;
  view: FileManagerViewNames;
};

const UNCALCULATED_SIZE = -2;

const StatusBar: FC<StatusBarProps> = ({
  count,
  directory,
  fileDrop,
  hideCategorized,
  hideDismissed,
  hideSubstituteGroup,
  iconZoomLevel,
  localImages,
  mongoTagExcludeCount = 0,
  mongoTagIncludeCount = 0,
  onClearMongoTagFilters,
  onSetMongoTagExcludeFilter,
  onSetMongoTagIncludeFilter,
  onToggleHideCategorized,
  onToggleHideDismissed,
  onToggleHideSubstituteGroup,
  onToggleImageSource,
  selected,
  setIconZoomLevel,
  setView,
  totalCount,
  view,
}) => {
  const { exists, lstat, stat } = useFileSystem();
  const [selectedSize, setSelectedSize] = useState(UNKNOWN_SIZE);
  const [showSelected, setShowSelected] = useState(false);
  const { sizes } = useTheme();
  const updateShowSelected = useCallback(
    (width: number): void =>
      setShowSelected(width > sizes.fileExplorer.minimumStatusBarWidth),
    [sizes.fileExplorer.minimumStatusBarWidth]
  );
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const hasMongoTagFilters =
    mongoTagIncludeCount > 0 || mongoTagExcludeCount > 0;

  useEffect(() => {
    const startedAt = getPerfNow();
    let existsChecks = 0;
    let lstatChecks = 0;
    let statChecks = 0;

    const updateSelectedSize = async (): Promise<void> => {
      const size = await selected.reduce(async (totalSize, file) => {
        const currentSize = await totalSize;

        if (currentSize === UNCALCULATED_SIZE) return UNCALCULATED_SIZE;

        const path = join(directory, file);

        try {
          existsChecks += 1;
          if (await exists(path)) {
            lstatChecks += 1;
            if ((await lstat(path)).isDirectory()) {
              return UNCALCULATED_SIZE;
            }

            statChecks += 1;
            return (
              (currentSize === UNKNOWN_SIZE ? 0 : currentSize) +
              (await stat(path)).size
            );
          }
        } catch {
          // Ignore errors getting file sizes
        }

        return totalSize;
      }, Promise.resolve(UNKNOWN_SIZE));

      setSelectedSize(size);
      logPerf("status-selected-size", {
        directory,
        durationMs: getPerfDuration(startedAt),
        existsChecks,
        lstatChecks,
        selectedCount: selected.length,
        size,
        statChecks,
      });
    };

    updateSelectedSize();
  }, [directory, exists, lstat, selected, stat]);

  useLayoutEffect(() => {
    if (statusBarRef.current) {
      updateShowSelected(statusBarRef.current.getBoundingClientRect().width);
    }
  }, [updateShowSelected]);

  useResizeObserver(
    statusBarRef.current,
    useCallback<ResizeObserverCallback>(
      ([{ contentRect: { width = 0 } = {} }]) => updateShowSelected(width),
      [updateShowSelected]
    )
  );

  return (
    <StyledStatusBar
      ref={statusBarRef}
      onContextMenuCapture={haltEvent}
      {...fileDrop}
    >
      <div {...label("Total item count")}>
        {typeof totalCount === "number" && totalCount !== count
          ? `${count} of ${totalCount} items`
          : `${count} item${count === 1 ? "" : "s"}`}
      </div>
      {showSelected && selected.length > 0 && (
        <div className="selected" {...label("Selected item count and size")}>
          {selected.length} item{selected.length === 1 ? "" : "s"} selected
          {selectedSize !== UNKNOWN_SIZE && selectedSize !== UNCALCULATED_SIZE
            ? `\u00A0\u00A0${getFormattedSize(selectedSize)}`
            : ""}
        </div>
      )}
      {onToggleImageSource && (
        <div className="hide-toggles">
          <Button
            className={`hide-toggle${localImages ? " active" : ""}`}
            onClick={onToggleImageSource}
            {...label("Toggle between local and external image loading")}
          >
            {localImages ? "Local Imgs" : "External Imgs"}
          </Button>
        </div>
      )}
      {(onToggleHideCategorized ||
        onToggleHideDismissed ||
        onToggleHideSubstituteGroup ||
        onSetMongoTagIncludeFilter ||
        onSetMongoTagExcludeFilter) && (
        <div className="hide-toggles">
          {onSetMongoTagIncludeFilter && (
            <Button
              className={`hide-toggle${mongoTagIncludeCount > 0 ? " active" : ""}`}
              onClick={onSetMongoTagIncludeFilter}
              {...label("Include documents with any matching tag")}
            >
              {mongoTagIncludeCount > 0
                ? `Include ${mongoTagIncludeCount}`
                : "Include Tags"}
            </Button>
          )}
          {onSetMongoTagExcludeFilter && (
            <Button
              className={`hide-toggle${mongoTagExcludeCount > 0 ? " active" : ""}`}
              onClick={onSetMongoTagExcludeFilter}
              {...label("Exclude documents with any matching tag")}
            >
              {mongoTagExcludeCount > 0
                ? `Exclude ${mongoTagExcludeCount}`
                : "Exclude Tags"}
            </Button>
          )}
          {hasMongoTagFilters && onClearMongoTagFilters && (
            <Button
              className="hide-toggle"
              onClick={onClearMongoTagFilters}
              {...label("Clear tag filters")}
            >
              Clear Tags
            </Button>
          )}
          {onToggleHideCategorized && (
            <Button
              className={`hide-toggle${hideCategorized ? " active" : ""}`}
              onClick={onToggleHideCategorized}
              {...label("Toggle visibility of categorized items (Ctrl+H)")}
            >
              {hideCategorized ? "Show All" : "Hide Labeled"}
            </Button>
          )}
          {onToggleHideDismissed && (
            <Button
              className={`hide-toggle${hideDismissed ? " active" : ""}`}
              onClick={onToggleHideDismissed}
              {...label("Toggle visibility of dismissed items (Ctrl+Shift+D)")}
            >
              {hideDismissed ? "Show Dismissed" : "Hide Dismissed"}
            </Button>
          )}
          {onToggleHideSubstituteGroup && (
            <Button
              className={`hide-toggle${hideSubstituteGroup ? " active" : ""}`}
              onClick={onToggleHideSubstituteGroup}
              {...label("Toggle visibility of substitute group items (Ctrl+G)")}
            >
              {hideSubstituteGroup ? "Show Grouped" : "Hide Grouped"}
            </Button>
          )}
        </div>
      )}
      <nav className="views">
        <Button
          className={view === "details" ? "active" : undefined}
          onClick={() => setView("details")}
          {...label(
            "Displays information about each item\nin the window.  (Ctrl+Shift+6)"
          )}
        >
          <Icon
            displaySize={16}
            imgSize={16}
            src="/System/Icons/details_view.webp"
          />
        </Button>
        <Button
          className={view === "icon" ? "active" : undefined}
          onClick={() => setView("icon")}
          {...label(
            "Display items by using medium\nthumbnails.  (Ctrl+Shift+3)"
          )}
        >
          <Icon
            displaySize={16}
            imgSize={16}
            src="/System/Icons/icon_view.webp"
          />
        </Button>
        {view === "icon" && (
          <input
            className="zoom-slider"
            max={ICON_ZOOM_LEVELS.length - 1}
            min={0}
            onChange={(e) => setIconZoomLevel(Number(e.target.value))}
            type="range"
            value={iconZoomLevel}
            {...label("Icon size")}
          />
        )}
      </nav>
    </StyledStatusBar>
  );
};

export default memo(StatusBar);
