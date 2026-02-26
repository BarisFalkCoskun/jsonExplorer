import { basename, join } from "path";
import { useCallback, useEffect, useRef, useState } from "react";
import StyledQuickLook from "components/system/Files/FileManager/QuickLook/StyledQuickLook";
import { useMongoDBIcon } from "components/system/Files/FileEntry/useMongoDBIcon";
import { FOCUSABLE_ELEMENT } from "utils/constants";
import { haltEvent } from "utils/functions";

type QuickLookProps = {
  files: string[];
  onClose: () => void;
  path: string;
  url: string;
};

// Inner component keyed by path — each file gets a clean hook mount cycle,
// avoiding the race condition between useMongoDBIcon's load and reset effects.
const QuickLookImage: FC<{ path: string; scale: number }> = ({
  path,
  scale,
}) => {
  const [visible, setVisible] = useState(false);
  const { images, currentImageIndex, getCurrentImageUrl } = useMongoDBIcon(
    path,
    visible
  );
  const imageUrl = getCurrentImageUrl();

  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <>
      <div className="ql-content">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={basename(path, ".json")}
            src={imageUrl}
            style={{ transform: `scale(${scale})` }}
          />
        ) : (
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            Loading...
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="ql-counter">
          {currentImageIndex + 1} / {images.length}
        </div>
      )}
    </>
  );
};

const QuickLook: FC<QuickLookProps> = ({ files, onClose, path, url }) => {
  const [currentFile, setCurrentFile] = useState(basename(path));
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentPath = join(url, currentFile);
  const displayName = basename(currentFile, ".json");

  const navigateFile = useCallback(
    (direction: -1 | 1) => {
      const idx = files.indexOf(currentFile);
      const nextIdx = idx + direction;

      if (nextIdx >= 0 && nextIdx < files.length) {
        setCurrentFile(files[nextIdx]);
        setScale(1);
      }
    },
    [currentFile, files]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { key } = event;

      switch (key) {
        case "Escape":
        case " ":
          haltEvent(event);
          onClose();
          break;
        case "ArrowLeft":
          haltEvent(event);
          navigateFile(-1);
          break;
        case "ArrowRight":
          haltEvent(event);
          navigateFile(1);
          break;
        default:
          break;
      }
    },
    [navigateFile, onClose]
  );

  const handleWheel = useCallback((event: React.WheelEvent) => {
    haltEvent(event);
    const delta = event.deltaY < 0 ? 0.1 : -0.1;

    setScale((prev) => Math.max(0.1, Math.min(10, prev + delta)));
  }, []);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === containerRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <StyledQuickLook
      ref={containerRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      {...FOCUSABLE_ELEMENT}
    >
      <div className="ql-window">
        <div className="ql-titlebar">
          <button onClick={onClose} type="button" aria-label="Close" />
          <span>{displayName}</span>
        </div>
        <QuickLookImage key={currentPath} path={currentPath} scale={scale} />
      </div>
    </StyledQuickLook>
  );
};

export default QuickLook;
