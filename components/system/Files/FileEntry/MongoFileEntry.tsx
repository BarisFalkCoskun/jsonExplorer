import { memo, useState, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { type MongoDocument } from 'services/types/mongoTypes';

const MongoFileContainer = styled.div`
  position: relative;
  display: inline-block;

  &:hover .image-navigation {
    opacity: 1;
  }
`;

const ImageIcon = styled.img`
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const DefaultIcon = styled.div`
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 12px;
`;

const ImageNavigation = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;

  &.visible {
    pointer-events: auto;
  }
`;

const NavButton = styled.button<{ $direction: 'left' | 'right'; $visible: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: ${({ $visible }) => ($visible ? 1 : 0.3)};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
  transition: opacity 0.2s ease;
  margin: ${({ $direction }) => ($direction === 'left' ? '0 2px 0 4px' : '0 4px 0 2px')};

  &:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
`;

const FileName = styled.div`
  margin-top: 4px;
  font-size: 11px;
  text-align: center;
  word-break: break-word;
  max-width: 60px;
`;

interface MongoFileEntryProps {
  document: MongoDocument;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

const MongoFileEntry: React.FC<MongoFileEntryProps> = ({
  document,
  onClick,
  onDoubleClick,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Combine images and oldImages arrays
  const allImages = useMemo(() => {
    const images = document.images || [];
    const oldImages = document.oldImages || [];
    return [...images, ...oldImages];
  }, [document.images, document.oldImages]);

  const hasImages = allImages.length > 0;
  const hasMultipleImages = allImages.length > 1;
  const currentImage = hasImages ? allImages[currentImageIndex] : null;

  // Navigation handlers
  const goToPrevious = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasMultipleImages) {
      setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
      setImageError(false);
    }
  }, [hasMultipleImages, allImages.length]);

  const goToNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasMultipleImages) {
      setCurrentImageIndex((prev) => (prev < allImages.length - 1 ? prev + 1 : 0));
      setImageError(false);
    }
  }, [hasMultipleImages, allImages.length]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageError(false);
  }, []);

  // Display name (fallback to _id if no name)
  const displayName = document.name || document._id;

  // Show navigation buttons
  const canGoBack = currentImageIndex > 0;
  const canGoForward = currentImageIndex < allImages.length - 1;

  return (
    <MongoFileContainer onClick={onClick} onDoubleClick={onDoubleClick}>
      {hasImages && currentImage && !imageError ? (
        <ImageIcon
          src={currentImage}
          alt={displayName}
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      ) : (
        <DefaultIcon>
          {displayName.slice(0, 2).toUpperCase()}
        </DefaultIcon>
      )}

      {hasMultipleImages && (
        <ImageNavigation className={`image-navigation ${hasMultipleImages ? 'visible' : ''}`}>
          <NavButton
            type="button"
            $direction="left"
            $visible={canGoBack}
            onClick={goToPrevious}
            disabled={!canGoBack}
            title="Previous image"
          >
            ‹
          </NavButton>
          <NavButton
            type="button"
            $direction="right"
            $visible={canGoForward}
            onClick={goToNext}
            disabled={!canGoForward}
            title="Next image"
          >
            ›
          </NavButton>
        </ImageNavigation>
      )}

      <FileName>{displayName}</FileName>
    </MongoFileContainer>
  );
};

export default memo(MongoFileEntry);