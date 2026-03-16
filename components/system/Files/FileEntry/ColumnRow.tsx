import { useCallback, useState, useRef, useEffect, memo } from "react";
import { useTheme } from "styled-components";
import StyledColumnRow from "components/system/Files/FileEntry/StyledColumnRow";
import { type Columns } from "components/system/Files/FileManager/Columns/constants";
import { type FileStat } from "components/system/Files/FileManager/functions";
import {
  getDateModified,
  getFileType,
} from "components/system/Files/FileEntry/functions";
import { UNKNOWN_SIZE } from "contexts/fileSystem/core";
import { useFileSystem } from "contexts/fileSystem";
import { getExtension, getFormattedSize } from "utils/functions";

type ColumnDataProps = {
  date: string;
  size: string;
  type: string;
};

const ColumnRow: FC<{
  columns: Columns;
  isDirectory: boolean;
  path: string;
  stats: FileStat;
}> = ({ columns, isDirectory, path, stats }) => {
  const { stat } = useFileSystem();
  const { formats } = useTheme();
  const getColumnData = useCallback(async (): Promise<ColumnDataProps> => {
    if (
      stats.listingType ||
      typeof stats.listingDateModifiedMs === "number" ||
      "listingSizeText" in stats
    ) {
      return {
        date:
          typeof stats.listingDateModifiedMs === "number"
            ? getDateModified(path, stats, formats.dateModified)
            : "",
        size: isDirectory ? "" : stats.listingSizeText || "",
        type: isDirectory ? "File folder" : stats.listingType || getFileType(getExtension(path)),
      };
    }

    const fullStats = stats.size === UNKNOWN_SIZE ? await stat(path) : stats;

    return {
      date: getDateModified(path, fullStats, formats.dateModified),
      size: isDirectory ? "" : getFormattedSize(fullStats.size, true),
      type: isDirectory ? "File folder" : getFileType(getExtension(path)),
    };
  }, [formats.dateModified, isDirectory, path, stat, stats]);
  const [columnData, setColumnData] = useState<ColumnDataProps>();
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!columnData && !creatingRef.current) {
      creatingRef.current = true;
      getColumnData().then((newColumnData) => {
        setColumnData(newColumnData);
        creatingRef.current = false;
      });
    }
  }, [columnData, getColumnData]);

  return (
    <StyledColumnRow>
      <div style={{ width: columns?.date.width }}>{columnData?.date}</div>
      <div style={{ width: columns?.type.width }}>{columnData?.type}</div>
      <div style={{ width: columns?.size.width }}>{columnData?.size}</div>
    </StyledColumnRow>
  );
};

export default memo(ColumnRow);
