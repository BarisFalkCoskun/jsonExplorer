import { memo, useState, useCallback, useMemo, useEffect } from 'react';
import styled from 'styled-components';
import { extname } from 'path';
import { useFileSystem } from 'contexts/fileSystem';

const DocumentContainer = styled.div`
  position: relative;
  display: inline-block;
  cursor: pointer;

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
  background: #1a1a1a;
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
  font-size: 14px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  opacity: ${({ $visible }) => ($visible ? 1 : 0.4)};
  pointer-events: ${({ $visible }) => ($visible ? 'auto' : 'none')};
  transition: all 0.2s ease;
  margin: ${({ $direction }) => ($direction === 'left' ? '0 2px 0 3px' : '0 3px 0 2px')};

  &:hover {
    background: rgba(0, 0, 0, 0.9);
    border-color: rgba(255, 255, 255, 0.5);
    transform: scale(1.1);
  }

  &:disabled {
    opacity: 0.2;
    cursor: not-allowed;
    transform: none;
  }
`;

const ImageIndicator = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 8px;
  padding: 1px 3px;
  border-radius: 6px;
  font-weight: bold;
`;

// Cache parsed documents to prevent re-parsing on every render
const documentCache = new Map();

async function parseMongoDocument(path, readFile) {
  try {
    if (!path.endsWith('.json')) return null;

    // Check cache first
    if (documentCache.has(path)) {
      return documentCache.get(path);
    }

    // Check if this is a MongoDB document path
    const pathParts = path.split('/');
    if (pathParts.length < 6) return null;

    const [, , desktop, connectionName, databaseName, collectionName] = pathParts;

    if ((connectionName === 'Local_MongoDB' || connectionName === 'local') && desktop === 'Desktop') {
      try {
        // Read the actual file content
        const fileData = await readFile(path);
        if (fileData) {
          const content = new TextDecoder().decode(fileData);
          const document = JSON.parse(content);

          // Cache the result
          documentCache.set(path, document);
          return document;
        }
      } catch (error) {
        console.warn('Failed to read MongoDB document:', path, error);
      }
    }

    return null;
  } catch {
    return null;
  }
}


const MongoDocumentHandler = ({ path, children }) => {
  const { readFile } = useFileSystem();
  const [mongoDoc, setMongoDoc] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    parseMongoDocument(path, readFile).then(doc => {
      if (isMounted) {
        setMongoDoc(doc);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [path, readFile]);

  const allImages = useMemo(() => {
    if (!mongoDoc) return [];
    const images = mongoDoc.images || [];
    const oldImages = mongoDoc.oldImages || [];
    return [...images, ...oldImages];
  }, [mongoDoc]);

  const hasImages = allImages.length > 0;
  const hasMultipleImages = allImages.length > 1;
  const currentImage = hasImages ? allImages[currentImageIndex] : null;

  const goToPrevious = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    if (hasMultipleImages) {
      setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : allImages.length - 1));
      setImageError(false);
    }
  }, [hasMultipleImages, allImages.length]);

  const goToNext = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
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

  // If this is not a MongoDB document, render the original children
  if (isLoading || !mongoDoc) {
    return children;
  }

  const displayName = mongoDoc.name || mongoDoc._id;
  const canGoBack = currentImageIndex > 0;
  const canGoForward = currentImageIndex < allImages.length - 1;

  return (
    <DocumentContainer>
      {hasImages && currentImage && !imageError ? (
        <>
          <ImageIcon
            src={currentImage}
            alt={displayName}
            onError={handleImageError}
            onLoad={handleImageLoad}
          />
          {hasMultipleImages && (
            <ImageIndicator>
              {currentImageIndex + 1}/{allImages.length}
            </ImageIndicator>
          )}
        </>
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
    </DocumentContainer>
  );
};

export default memo(MongoDocumentHandler);