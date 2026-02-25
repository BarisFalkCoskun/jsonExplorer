import StyledDetailsFileEntry from "components/system/Files/Views/Details/StyledFileEntry";
import StyledDetailsFileManager from "components/system/Files/Views/Details/StyledFileManager";
import StyledIconFileEntry from "components/system/Files/Views/Icon/StyledFileEntry";
import StyledIconFileManager from "components/system/Files/Views/Icon/StyledFileManager";
import StyledListFileEntry from "components/system/Files/Views/List/StyledFileEntry";
import StyledListFileManager from "components/system/Files/Views/List/StyledFileManager";
import {
  DEFAULT_ICON_ZOOM_LEVEL,
  ICON_ZOOM_LEVELS,
} from "components/system/Files/FileManager/constants";
import { type IconProps } from "styles/common/Icon";

export type StyledFileEntryProps = {
  $desktop?: boolean;
  $iconZoomLevel?: number;
  $labelHeightOffset?: number;
  $selecting?: boolean;
  $visible?: boolean;
};

export type StyledFileManagerProps = {
  $iconZoomLevel?: number;
  $isEmptyFolder: boolean;
  $scrollable: boolean;
  $selecting?: boolean;
};

type FileManagerView = {
  StyledFileEntry: typeof StyledIconFileEntry | typeof StyledListFileEntry;
  /* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
  StyledFileManager:
    | typeof StyledDetailsFileManager
    | typeof StyledIconFileManager
    | typeof StyledListFileManager;
  /* eslint-enable @typescript-eslint/no-duplicate-type-constituents */
};

export type FileManagerViewNames = "details" | "icon" | "list";

export const FileManagerViews: Record<FileManagerViewNames, FileManagerView> = {
  details: {
    StyledFileEntry: StyledDetailsFileEntry,
    StyledFileManager: StyledDetailsFileManager,
  },
  icon: {
    StyledFileEntry: StyledIconFileEntry,
    StyledFileManager: StyledIconFileManager,
  },
  list: {
    StyledFileEntry: StyledListFileEntry,
    StyledFileManager: StyledListFileManager,
  },
};

export const FileEntryIconSize: Record<
  FileManagerViewNames | "detailsSub" | "sub",
  IconProps
> = {
  details: {
    imgSize: 16,
  },
  detailsSub: {
    displaySize: 8,
    imgSize: 16,
  },
  icon: {
    imgSize: 48,
  },
  list: {
    displaySize: 24,
    imgSize: 48,
  },
  sub: {
    displaySize: 48,
    imgSize: 16,
  },
};

export const getFileEntryIconSize = (
  view: FileManagerViewNames | "detailsSub" | "sub",
  zoomLevel?: number
): IconProps => {
  if (view === "icon") {
    const level = zoomLevel ?? DEFAULT_ICON_ZOOM_LEVEL;
    const { iconSize } = ICON_ZOOM_LEVELS[level];

    return { imgSize: iconSize as IconProps["imgSize"] };
  }

  if (view === "sub" && zoomLevel !== undefined) {
    const { iconSize } = ICON_ZOOM_LEVELS[zoomLevel];

    return {
      displaySize: iconSize as IconProps["displaySize"],
      imgSize: 16,
    };
  }

  return FileEntryIconSize[view];
};
