import styled from "styled-components";
import { type StyledFileManagerProps } from "components/system/Files/Views";
import { ICON_ZOOM_LEVELS, DEFAULT_ICON_ZOOM_LEVEL } from "components/system/Files/FileManager/constants";
import ScrollBars from "styles/common/ScrollBars";
import { TASKBAR_HEIGHT } from "utils/constants";

const StyledFileManager = styled.ol<StyledFileManagerProps>`
  ${({ $scrollable }) => ($scrollable ? ScrollBars() : undefined)};

  contain: strict;
  display: grid;
  gap: ${({ $iconZoomLevel, theme }) => {
    if ($iconZoomLevel !== undefined) {
      const { rowGap } = ICON_ZOOM_LEVELS[$iconZoomLevel];
      return `${rowGap}px ${theme.sizes.fileManager.columnGap}`;
    }
    return `${theme.sizes.fileManager.rowGap} ${theme.sizes.fileManager.columnGap}`;
  }};
  grid-auto-flow: row;
  grid-template-columns: ${({ $iconZoomLevel, theme }) => {
    if ($iconZoomLevel !== undefined) {
      const { gridWidth } = ICON_ZOOM_LEVELS[$iconZoomLevel];
      return `repeat(auto-fill, ${gridWidth}px)`;
    }
    return `repeat(auto-fill, ${theme.sizes.fileManager.gridEntryWidth})`;
  }};
  grid-template-rows: ${({ $iconZoomLevel, theme }) => {
    if ($iconZoomLevel !== undefined) {
      const { gridHeight } = ICON_ZOOM_LEVELS[$iconZoomLevel];
      return `repeat(auto-fill, ${gridHeight}px)`;
    }
    return `repeat(auto-fill, ${theme.sizes.fileManager.gridEntryHeight})`;
  }};
  height: 100%;
  overflow: ${({ $isEmptyFolder, $scrollable }) =>
    !$isEmptyFolder && $scrollable ? undefined : "hidden"};
  padding: ${({ theme }) => theme.sizes.fileManager.padding};
  place-content: flex-start;
  pointer-events: ${({ $selecting }) => ($selecting ? "auto" : undefined)};

  main > & {
    grid-auto-flow: column;
    height: calc(100% - ${TASKBAR_HEIGHT}px);
    overflow: visible;
    padding-bottom: 21px;
  }
`;

export default StyledFileManager;
