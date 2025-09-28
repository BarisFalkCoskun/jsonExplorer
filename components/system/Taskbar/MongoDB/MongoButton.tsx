import { memo, useCallback } from 'react';
import styled from 'styled-components';
import Button from 'styles/common/Button';

const StyledMongoButton = styled(Button)<{ $active?: boolean }>`
  height: 24px;
  padding: 0 6px;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.selectionHighlight : 'transparent'};
  border: none;
  border-radius: 3px;
  margin: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  transition: background-color 0.2s ease;
  width: auto;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.selectionHighlight};
  }

  svg {
    width: 14px;
    height: 14px;
    fill: ${({ theme }) => theme.colors.text};
    flex-shrink: 0;
  }
`;

const MongoIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M13.74 4.23c-.84-1-1.57-2-1.71-2.22H12c-.14.21-.87 1.22-1.71 2.22-7.2 9.19 1.14 15.39 1.14 15.39l.07.05c.06.95.22 2.33.22 2.33h.62s.15-1.38.22-2.33l.07-.05S20.94 13.42 13.74 4.23zM12.64 19.5c-.17-.07-.6-.26-1.05-.63-.48-.4-.96-.86-1.35-1.37C9.1 16.1 8.8 14.7 9.05 13.5c.2-.98.66-1.8 1.35-2.4.35-.3.75-.55 1.24-.7.49.15.89.4 1.24.7.69.6 1.15 1.42 1.35 2.4.25 1.2-.05 2.6-1.19 3.9-.39.51-.87.97-1.35 1.37-.45.37-.88.56-1.05.63z"/>
  </svg>
);

interface MongoButtonProps {
  onClick: () => void;
  active?: boolean;
}

const MongoButton = ({ onClick, active = false }: MongoButtonProps) => {
  const handleClick = useCallback((event: React.MouseEvent) => {
    console.log('MongoDB button clicked!');
    event.preventDefault();
    event.stopPropagation();
    onClick();
  }, [onClick]);

  return (
    <StyledMongoButton
      $active={active}
      onClick={handleClick}
      title="MongoDB Connection Manager (Click to manage database connections)"
    >
      <MongoIcon />
      MongoDB
    </StyledMongoButton>
  );
};

export default memo(MongoButton);