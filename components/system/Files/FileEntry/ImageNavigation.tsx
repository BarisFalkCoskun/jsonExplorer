import { memo } from "react";
import styled from "styled-components";

const StyledImageNavigation = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  pointer-events: none;
  z-index: 10;

  &.show {
    opacity: 1;
    pointer-events: auto;
  }

  .nav-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: rgba(0, 0, 0, 0.7);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    margin: 2px;
    transition: all 0.2s ease-in-out;
    user-select: none;

    &:hover {
      background: rgba(0, 0, 0, 0.9);
      transform: scale(1.1);
    }

    &:active {
      transform: scale(0.95);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;

      &:hover {
        background: rgba(0, 0, 0, 0.7);
        transform: none;
      }
    }

    &.prev {
      &::before {
        content: "‹";
        display: block;
        line-height: 1;
      }
    }

    &.next {
      &::before {
        content: "›";
        display: block;
        line-height: 1;
      }
    }
  }

  .nav-indicator {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 2px;
    background: rgba(0, 0, 0, 0.5);
    padding: 2px 4px;
    border-radius: 8px;
    font-size: 10px;
    color: white;
    line-height: 1;
  }
`;

interface ImageNavigationProps {
  show: boolean;
  canGoToPrevious: boolean;
  canGoToNext: boolean;
  currentIndex: number;
  totalImages: number;
  onPrevious: () => void;
  onNext: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const ImageNavigation: React.FC<ImageNavigationProps> = ({
  show,
  canGoToPrevious,
  canGoToNext,
  currentIndex,
  totalImages,
  onPrevious,
  onNext,
  onMouseEnter,
  onMouseLeave,
}) => {
  const handlePrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (canGoToPrevious) {
      onPrevious();
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (canGoToNext) {
      onNext();
    }
  };

  if (totalImages <= 1) {
    return null;
  }

  return (
    <StyledImageNavigation
      className={show ? "show" : ""}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        className="nav-arrow prev"
        onClick={handlePrevious}
        disabled={!canGoToPrevious}
        title="Previous image"
        type="button"
      />

      <button
        className="nav-arrow next"
        onClick={handleNext}
        disabled={!canGoToNext}
        title="Next image"
        type="button"
      />

      <div className="nav-indicator">
        {currentIndex + 1}/{totalImages}
      </div>
    </StyledImageNavigation>
  );
};

export default memo(ImageNavigation);