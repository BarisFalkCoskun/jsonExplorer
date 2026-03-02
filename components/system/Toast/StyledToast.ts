import styled, { keyframes } from "styled-components";

const slideIn = keyframes`
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

export const StyledToastContainer = styled.div`
  position: fixed;
  bottom: 52px;
  right: 8px;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;

type StyledToastItemProps = {
  $severity: "success" | "error" | "info";
};

const severityColors: Record<string, string> = {
  success: "#2e7d32",
  error: "#c62828",
  info: "#424242",
};

export const StyledToastItem = styled.div<StyledToastItemProps>`
  background: ${({ $severity }) => severityColors[$severity] || severityColors.info};
  color: #fff;
  padding: 8px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-family: sans-serif;
  max-width: 320px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
  pointer-events: auto;
  animation:
    ${slideIn} 0.25s ease-out,
    ${fadeOut} 0.3s ease-in 3.7s forwards;
  cursor: pointer;
`;
