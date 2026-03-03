import { useContext } from "react";
import { createPortal } from "react-dom";
import { StyledToastContainer, StyledToastItem } from "components/system/Toast/StyledToast";
import { ToastContext } from "components/system/Toast/useToast";

const ToastRenderer: FC = () => {
  const { toasts, dismissToast } = useContext(ToastContext);

  // eslint-disable-next-line unicorn/no-null -- React component must return null not undefined
  if (toasts.length === 0) return null;

  return createPortal(
    <StyledToastContainer>
      {toasts.map((toast) => (
        <StyledToastItem
          key={toast.id}
          $severity={toast.severity}
          onClick={() => dismissToast(toast.id)}
        >
          {toast.message}
        </StyledToastItem>
      ))}
    </StyledToastContainer>,
    document.body
  );
};

export default ToastRenderer;
