import { createContext, useCallback, useContext, useState } from "react";

export type ToastSeverity = "success" | "error" | "info";

export type Toast = {
  id: number;
  message: string;
  severity: ToastSeverity;
};

type ToastContextValue = {
  dismissToast: (id: number) => void;
  showToast: (message: string, severity?: ToastSeverity) => void;
  toasts: Toast[];
};

let nextId = 0;

export const ToastContext = createContext<ToastContextValue>({
  dismissToast: () => { /* noop */ },
  showToast: () => { /* noop */ },
  toasts: [],
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

  return { dismissToast, showToast, toasts };
};

export const useToast = (): Pick<ToastContextValue, "showToast"> =>
  useContext(ToastContext);
