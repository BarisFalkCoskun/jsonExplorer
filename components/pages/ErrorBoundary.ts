import { Component } from "react";
import { isDev } from "utils/functions";

type ErrorBoundaryProps = {
  FallbackRender?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

// eslint-disable-next-line react/require-optimization -- ErrorBoundary must always re-render on error
export class ErrorBoundary extends Component<
  React.PropsWithChildren<ErrorBoundaryProps>,
  ErrorBoundaryState
> {
  public constructor(props: React.PropsWithChildren<ErrorBoundaryProps>) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(): void {
    const { FallbackRender } = this.props;

    if (!FallbackRender && !isDev()) {
      const RELOAD_KEY = "errorBoundaryReloads";
      const count = Number(sessionStorage.getItem(RELOAD_KEY) || "0");

      if (count < 1) {
        sessionStorage.setItem(RELOAD_KEY, String(count + 1));
        window.location.reload();
      }
    }
  }

  public override render(): React.ReactNode {
    const {
      props: { children, FallbackRender },
      state: { hasError },
    } = this;

    return hasError ? FallbackRender : children;
  }
}
