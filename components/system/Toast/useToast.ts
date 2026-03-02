import { createContext, useCallback, useContext, useState } from "react";

export type ToastSeverity = "success" | "error" | "info";

export type Toast = {
  id: number;
  message: string;
  severity: ToastSeverity;
};

type ToastContextValue = {
  toasts: Toast[];
  showToast: (message: string, severity?: ToastSeverity) => void;
  dismissToast: (id: number) => void;
};

let nextId = 0;

export const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
});

export const useToastProvider = (): ToastContextValue => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, severity: ToastSeverity = "info") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, severity }]);
      setTimeout(() => dismissToast(id), 4000);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
};

export const useToast = (): Pick<ToastContextValue, "showToast"> =>
  useContext(ToastContext);
